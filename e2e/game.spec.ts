import { expect, test, type Page } from '@playwright/test';
import {
  continueButton,
  createRoom,
  gesture,
  joinRoom,
  lobbyCode,
  newPlayer,
  openHome,
  playAgainButton,
  playUntilResult,
  score,
  startMatch,
  type Player,
} from './helpers/app';

const roomError = (page: Page) => page.getByRole('alert');
const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

/** A creates a Classic best-of-3 room, B joins by invite link, A starts the match. */
async function startDuel(a: Player, b: Player): Promise<string> {
  await openHome(a.page);
  await createRoom(a.page, { nickname: 'Ann', mode: 'Classic', bestOf: 3 });
  const code = await lobbyCode(a.page);

  await openHome(b.page, `?room=${code}`);
  await expect(b.page.getByLabel('Room code', { exact: true })).toHaveValue(code);
  await joinRoom(b.page, code, 'Ben');
  await expect(b.page.getByText('Waiting for the host to start…')).toBeVisible();

  await startMatch(a.page);
  await expect(a.page.getByText('Pick your gesture!')).toBeVisible();
  await expect(b.page.getByText('Pick your gesture!')).toBeVisible();
  return code;
}

test('classic duel: two players play a best-of-3 to the result screen', async ({ browser }) => {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);

  await startDuel(a, b);
  await expect(score(a.page)).toHaveText('0 : 0');

  for (const [round, expected] of [
    [1, ['1 : 0', '0 : 1']],
    [2, ['2 : 0', '0 : 2']],
  ] as const) {
    await gesture(a.page, 'Rock').click();
    await gesture(b.page, 'Scissors').click();

    await expect(a.page.getByText('You win the round!')).toBeVisible();
    await expect(b.page.getByText('You lose the round!')).toBeVisible();
    await expect(score(a.page)).toHaveText(expected[0]);
    await expect(score(b.page)).toHaveText(expected[1]);
    await expect(region(a.page, 'You')).toContainText('Rock');
    await expect(region(a.page, 'Opponent')).toContainText('Scissors');
    await expect(region(b.page, 'You')).toContainText('Scissors');
    await expect(region(b.page, 'Opponent')).toContainText('Rock');

    await continueButton(a.page).click();
    await continueButton(b.page).click();
    if (round === 1) {
      await expect(a.page.getByText('Pick your gesture!')).toBeVisible();
      await expect(b.page.getByText('Pick your gesture!')).toBeVisible();
    }
  }

  await expect(a.page.getByRole('heading', { level: 2, name: 'You won the match!' })).toBeVisible();
  await expect(b.page.getByRole('heading', { level: 2, name: 'Not this time.' })).toBeVisible();
  await expect(a.page.getByText('Final score 2 : 0')).toBeVisible();
  await expect(b.page.getByText('Final score 0 : 2')).toBeVisible();

  await a.context.close();
  await b.context.close();
});

test('secrecy: a locked pick never reaches the opponent before the reveal', async ({ browser }) => {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  await startDuel(a, b);

  await gesture(a.page, 'Rock').click();
  await expect(a.page.getByText('Locked in. Waiting for the others…')).toBeVisible();
  await expect(b.page.getByText('Opponent has chosen')).toBeVisible();

  // B's UI shows no gesture at all for the opponent.
  await expect(region(b.page, 'Opponent')).not.toContainText('Rock');
  await expect(region(b.page, 'Opponent').locator('[data-gesture]')).toHaveCount(0);

  // And neither does the wire: the lock-in update has arrived, yet no frame mentions the gesture.
  const locked = b.frames.filter((f) => f.event === 'room:state' && JSON.stringify(f.payload).includes('"lockedSeats":["a0"]'));
  expect(locked.length).toBeGreaterThan(0);
  expect(b.frames.length).toBeGreaterThan(0);
  for (const frame of b.frames) expect(frame.raw.toLowerCase()).not.toContain('rock');

  // After B has picked too, the reveal frames carry both gestures.
  await gesture(b.page, 'Scissors').click();
  await expect(b.page.getByText('You lose the round!')).toBeVisible();
  const reveal = b.frames.filter((f) => f.event === 'room:state' && f.raw.includes('"lastRound":{'));
  expect(reveal.length).toBeGreaterThan(0);
  const last = reveal[reveal.length - 1]!;
  expect(last.raw).toContain('"a0":"rock"');
  expect(last.raw).toContain('"b0":"scissors"');

  await a.context.close();
  await b.context.close();
});

test('bot room: a best-of-3 against the hard bot reaches the result screen', async ({ browser }) => {
  const p = await newPlayer(browser);
  await openHome(p.page);
  await createRoom(p.page, { nickname: 'Ann', mode: 'Classic', bestOf: 3, bot: 'Hard' });

  // The bot is seated at once, so the match starts without a lobby stop.
  await expect(p.page.getByText('Pick your gesture!')).toBeVisible();
  await expect(region(p.page, 'Opponent')).toBeVisible();

  await playUntilResult(p.page, 'Rock');
  await expect(playAgainButton(p.page)).toBeVisible();
  await expect(
    p.page.getByRole('heading', { level: 2 }).filter({ hasText: /^(You won the match!|Not this time\.)$/ }),
  ).toBeVisible();
  await expect(p.page.getByText(/^Final score \d : \d$/)).toBeVisible();

  await p.context.close();
});

test('wheel of 15: the board offers 15 gestures and picking works', async ({ browser }) => {
  const p = await newPlayer(browser);
  await openHome(p.page);
  await createRoom(p.page, { nickname: 'Ann', mode: 'Wheel of 15', bot: 'Easy' });

  await expect(p.page.getByText('Pick your gesture!')).toBeVisible();
  const pad = p.page.getByRole('radiogroup', { name: 'Gestures' });
  await expect(pad.getByRole('radio')).toHaveCount(15);

  await pad.getByRole('radio').first().click();
  await expect(continueButton(p.page)).toBeVisible();
  await expect(p.page.getByText(/^(You win the round!|You lose the round!|It's a draw!)$/)).toBeVisible();

  await p.context.close();
});

test('errors: unknown code and full room are reported, the app stays usable', async ({ browser }) => {
  const a = await newPlayer(browser);
  await openHome(a.page);
  await joinRoom(a.page, 'ZZZZZ', 'Ann');
  await expect(roomError(a.page)).toHaveText(/That room doesn't exist \(anymore\)\./);

  // Still usable: dismiss the error and create a room instead.
  await roomError(a.page).getByRole('button', { name: 'Dismiss' }).click();
  await expect(roomError(a.page)).toHaveCount(0);
  await createRoom(a.page, { nickname: 'Ann' });
  const code = await lobbyCode(a.page);

  const b = await newPlayer(browser);
  await openHome(b.page);
  await joinRoom(b.page, code, 'Ben');
  await expect(b.page.getByText('Waiting for the host to start…')).toBeVisible();

  const c = await newPlayer(browser);
  await openHome(c.page);
  await joinRoom(c.page, code, 'Cleo');
  await expect(roomError(c.page)).toHaveText(/Sorry, that room is full\./);
  await expect(c.page.getByRole('button', { name: 'Create room' })).toBeVisible();

  await a.context.close();
  await b.context.close();
  await c.context.close();
});

test('reconnect: a reload puts the player back into the same room and seat', async ({ browser }) => {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  await startDuel(a, b);

  await b.page.reload();
  // Back on the board of the same match, not on the start screen.
  await expect(b.page.getByText('Pick your gesture!')).toBeVisible();
  await expect(b.page.getByRole('heading', { level: 2, name: 'Rock, Paper, Scissors: The Arena!' })).toHaveCount(0);
  await expect(region(b.page, 'You')).toContainText('Ben');
  await expect(region(b.page, 'Opponent')).toContainText('Ann');

  // Same seat: B's pick still decides the round against A's pick.
  await gesture(a.page, 'Rock').click();
  await gesture(b.page, 'Paper').click();
  await expect(b.page.getByText('You win the round!')).toBeVisible();
  await expect(a.page.getByText('You lose the round!')).toBeVisible();

  // The host can reload too and still sits across from B.
  await a.page.reload();
  await expect(region(a.page, 'Opponent')).toContainText('Ben');

  await a.context.close();
  await b.context.close();
});

test('reconnect in the lobby: the reload keeps the seat and the room code', async ({ browser }) => {
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);
  await openHome(a.page);
  await createRoom(a.page, { nickname: 'Ann' });
  const code = await lobbyCode(a.page);
  await openHome(b.page, `?room=${code}`);
  await joinRoom(b.page, code, 'Ben');
  await expect(b.page.getByText('Waiting for the host to start…')).toBeVisible();

  await b.page.reload();
  await expect(b.page.getByText('Waiting for the host to start…')).toBeVisible();
  expect(await lobbyCode(b.page)).toBe(code);

  await a.context.close();
  await b.context.close();
});

test('language switch keeps the typed input', async ({ browser }) => {
  const p = await newPlayer(browser);
  await openHome(p.page);

  await p.page.getByLabel('Your name', { exact: true }).fill('Ann');
  await expect(p.page.getByRole('button', { name: 'Create room' })).toBeVisible();

  await p.page.getByRole('button', { name: 'DE', exact: true }).click();
  await expect(p.page.getByLabel('Dein Name', { exact: true })).toHaveValue('Ann');
  await expect(p.page.getByRole('button', { name: 'Raum erstellen' })).toBeVisible();
  await expect(p.page.getByRole('button', { name: 'Create room' })).toHaveCount(0);

  await p.page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(p.page.getByLabel('Your name', { exact: true })).toHaveValue('Ann');
  await expect(p.page.getByRole('button', { name: 'Create room' })).toBeVisible();

  await p.context.close();
});

test('mobile viewport: no horizontal scroll, the board is usable', async ({ browser }) => {
  const p = await newPlayer(browser, { width: 390, height: 844 });
  await openHome(p.page);

  const overflow = () => p.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);

  await createRoom(p.page, { nickname: 'Ann', bot: 'Easy' });
  await expect(p.page.getByText('Pick your gesture!')).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);

  const viewport = p.page.viewportSize()!;
  for (const name of ['Rock', 'Paper', 'Scissors']) {
    const button = gesture(p.page, name);
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }

  await gesture(p.page, 'Paper').click();
  await expect(continueButton(p.page)).toBeVisible();

  await p.context.close();
});
