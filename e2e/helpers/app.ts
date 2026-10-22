import { errors, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * One websocket frame the page received, of any packet type. `raw` is the complete frame (binary
 * frames are kept as `[binary N bytes] <utf8 text>`, so a negative scan covers them too). `event`
 * and `payload` are only set for decoded Socket.IO event packets (`42[...]`).
 */
export interface ReceivedFrame {
  raw: string;
  event?: string;
  payload?: unknown;
}

/** The subset of the decoded frames that are Socket.IO events; use these as barriers, not for negative scans. */
export const eventFrames = (frames: readonly ReceivedFrame[]): (ReceivedFrame & { event: string })[] =>
  frames.filter((f): f is ReceivedFrame & { event: string } => f.event !== undefined);

export interface Player {
  context: BrowserContext;
  page: Page;
  /** Every websocket frame (all packet types) this page received since it was created (live array). */
  frames: ReceivedFrame[];
}

export type ModeName = 'Classic' | 'Lizard & Spock' | 'Wheel of 7' | 'Wheel of 9' | 'Wheel of 15' | 'Bluff';

export interface CreateOptions {
  nickname: string;
  mode?: ModeName;
  bestOf?: 3 | 5 | 7;
  bot?: 'Easy' | 'Medium' | 'Hard';
}

/** Socket.IO event packets look like `42["event",{...}]`; acks (`43`), binary events (`45`) and engine.io packets stay undecoded. */
function decode(raw: string): ReceivedFrame {
  if (raw.startsWith('42')) {
    try {
      const data: unknown = JSON.parse(raw.slice(2));
      if (Array.isArray(data) && typeof data[0] === 'string') return { raw, event: data[0], payload: data[1] };
    } catch {
      // not valid JSON: keep it as a plain raw frame
    }
  }
  return { raw };
}

/**
 * Opens a fresh browser context and records the websocket frames from the very first page load.
 * `cpuThrottle` (CDP `Emulation.setCPUThrottlingRate`) makes the page slow, to prove the tests do not race the reveal.
 */
export async function newPlayer(
  browser: Browser,
  options: { viewport?: { width: number; height: number }; cpuThrottle?: number } = {},
): Promise<Player> {
  const context = await browser.newContext({ locale: 'en-US', ...(options.viewport ? { viewport: options.viewport } : {}) });
  const page = await context.newPage();
  const frames: ReceivedFrame[] = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', ({ payload }) => {
      frames.push(
        decode(typeof payload === 'string' ? payload : `[binary ${payload.length} bytes] ${payload.toString('utf8')}`),
      );
    });
  });
  if (options.cpuThrottle) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: options.cpuThrottle });
  }
  return { context, page, frames };
}

export async function openHome(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await expect(page.getByRole('heading', { level: 2, name: 'Rock, Paper, Scissors: The Arena!' })).toBeVisible();
  // The websocket must be up before anything is sent.
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
}

export async function createRoom(page: Page, options: CreateOptions): Promise<void> {
  await page.getByLabel('Your name', { exact: true }).fill(options.nickname);
  if (options.mode) await page.getByRole('radio', { name: new RegExp(`^${options.mode}`) }).check();
  if (options.bestOf) await page.getByRole('radio', { name: `Best of ${options.bestOf}` }).check();
  if (options.bot) {
    await page.getByRole('checkbox', { name: 'Play against a bot' }).check();
    await page.getByRole('radio', { name: options.bot }).check();
  }
  await page.getByRole('button', { name: 'Create room' }).click();
}

export async function joinRoom(page: Page, code: string, nickname: string): Promise<void> {
  await page.getByLabel('Your name', { exact: true }).fill(nickname);
  await page.getByLabel('Room code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Join room' }).click();
}

/** Reads the room code from the Lobby. */
export async function lobbyCode(page: Page): Promise<string> {
  await expect(page.getByRole('heading', { level: 2, name: 'Lobby' })).toBeVisible();
  const input = page.getByLabel('Room code', { exact: true });
  await expect(input).toHaveValue(/^[A-Z2-9]{5}$/);
  return input.inputValue();
}

export const gesture = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });
export const continueButton = (page: Page) => page.getByRole('button', { name: 'Continue' });
export const playAgainButton = (page: Page) => page.getByRole('button', { name: 'Play again' });
export const score = (page: Page) => page.getByRole('group', { name: 'Score' });

export async function startMatch(host: Page): Promise<void> {
  await host.getByRole('button', { name: "Let's go!" }).click();
}

/** What the board looked like at the moment the reveal appeared, captured in one atomic step. */
export interface RevealSnapshot {
  status: string;
  score: string;
  /** Player cards by accessible name ("You" / "Opponent"): visible text and the gesture ids shown. */
  cards: Record<string, { text: string; gestures: string[] }>;
}

/**
 * Waits (inside the page) for the reveal and captures status, score and cards in a single evaluation.
 * The reveal only lasts REVEAL_MS, so assertions belong on this snapshot, never on live polling expects.
 */
export async function captureReveal(page: Page): Promise<RevealSnapshot> {
  const handle = await page.waitForFunction(() => {
    if (!document.querySelector('[data-testid="duel"]')) return null;
    const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
    const cards: Record<string, { text: string; gestures: string[] }> = {};
    for (const card of document.querySelectorAll('section[aria-label]')) {
      cards[card.getAttribute('aria-label') ?? ''] = {
        text: clean(card.textContent),
        gestures: [...card.querySelectorAll('[data-gesture]')].map((g) => g.getAttribute('data-gesture') ?? ''),
      };
    }
    return {
      status: clean(document.querySelector('[role="status"]')?.textContent),
      score: clean(document.querySelector('[role="group"][aria-label="Score"]')?.textContent),
      cards,
    };
  });
  return (await handle.jsonValue()) as RevealSnapshot;
}

/**
 * Leaves the reveal. Clicks Continue if it is still there, but the server also advances by itself after
 * a few seconds, so a Continue that vanished meanwhile is fine. What is not fine is not reaching the
 * expected next state, which fails with a clear message.
 */
export async function advanceRound(page: Page, options: { expect: 'pick' | 'result' | 'either' }): Promise<void> {
  const pick = page.getByText('Pick your gesture!');
  const next = options.expect === 'pick' ? pick : options.expect === 'result' ? playAgainButton(page) : pick.or(playAgainButton(page));
  const button = continueButton(page);
  await expect(button.or(next), 'neither Continue nor the next state showed up after the reveal').toBeVisible({ timeout: 10_000 });
  if (await button.isVisible()) {
    try {
      await button.click({ timeout: 2_000 });
    } catch (error) {
      // Only the optional click may time out (the server advanced in between); anything else is real.
      if (!(error instanceof errors.TimeoutError)) throw error;
    }
  }
  await expect(next, `expected the ${options.expect} state after the reveal`).toBeVisible({ timeout: 10_000 });
}

/**
 * Plays one gesture per round (always the same one) until the Result screen shows. Draws simply
 * repeat. Bounded, so a broken game ends the test with a clear failure instead of hanging.
 */
export async function playUntilResult(page: Page, pick: string, maxRounds = 12): Promise<void> {
  for (let round = 1; round <= maxRounds; round++) {
    const pad = gesture(page, pick);
    await expect(pad.or(playAgainButton(page))).toBeVisible();
    if (await playAgainButton(page).isVisible()) return;
    await expect(pad).toBeEnabled();
    await pad.click();
    await advanceRound(page, { expect: 'either' });
  }
  if (await playAgainButton(page).isVisible()) return;
  throw new Error(`no result screen after ${maxRounds} rounds`);
}
