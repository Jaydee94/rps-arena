import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

/** One decoded Socket.IO event frame that the page received over the websocket. */
export interface ReceivedFrame {
  raw: string;
  event: string;
  payload: unknown;
}

export interface Player {
  context: BrowserContext;
  page: Page;
  /** Every Socket.IO event frame this page received since it was created (live array). */
  frames: ReceivedFrame[];
}

export type ModeName = 'Classic' | 'Lizard & Spock' | 'Wheel of 7' | 'Wheel of 9' | 'Wheel of 15' | 'Bluff';

export interface CreateOptions {
  nickname: string;
  mode?: ModeName;
  bestOf?: 3 | 5 | 7;
  bot?: 'Easy' | 'Medium' | 'Hard';
}

/** Socket.IO event packets look like `42["event",{...}]` (an ack id may sit before the `[`). */
function decode(raw: string): ReceivedFrame | null {
  if (!raw.startsWith('42')) return null;
  try {
    const data: unknown = JSON.parse(raw.slice(raw.indexOf('[')));
    if (Array.isArray(data) && typeof data[0] === 'string') return { raw, event: data[0], payload: data[1] };
  } catch {
    // not an event packet we care about
  }
  return null;
}

/** Opens a fresh browser context and records the websocket frames from the very first page load. */
export async function newPlayer(browser: Browser, viewport?: { width: number; height: number }): Promise<Player> {
  const context = await browser.newContext({ locale: 'en-US', ...(viewport ? { viewport } : {}) });
  const page = await context.newPage();
  const frames: ReceivedFrame[] = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', ({ payload }) => {
      const frame = decode(typeof payload === 'string' ? payload : payload.toString('utf8'));
      if (frame) frames.push(frame);
    });
  });
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
    await expect(continueButton(page).or(playAgainButton(page))).toBeVisible();
    if (await playAgainButton(page).isVisible()) return;
    // The reveal also ends by itself after a few seconds, so a missed click is harmless.
    await continueButton(page).click({ timeout: 2_000 }).catch(() => undefined);
  }
  throw new Error(`no result screen after ${maxRounds} rounds`);
}
