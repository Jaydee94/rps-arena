import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import type { PublicParticipant, PublicTournament, RoomJoined, RoomView } from '@rps/shared';
import {
  appScreen,
  captureReveal,
  createTournament,
  eventFrames,
  gesture,
  joinRoom,
  latestView,
  leaveReveal,
  newPlayer,
  openHome,
  tournamentCode,
  type Player,
  type TournamentFormatName,
} from './helpers/app';

// Four browsers, several best-of-3 matches and intermissions per test: far more than one duel.
test.describe.configure({ timeout: 240_000 });

/** A browser in the tournament: its page, its nickname and its participant id (tournament.youId). */
interface Person extends Player {
  name: string;
  id: string;
}

const NAMES = ['Ann', 'Ben', 'Cleo', 'Dan'] as const;
/** Generous: the machine running the e2e suite may be busy; every wait is on visible state, never a sleep. */
const SLOW = { timeout: 30_000 };

const joinedOf = (p: Player): RoomJoined => {
  const frame = eventFrames(p.frames).find((f) => f.event === 'room:joined');
  expect(frame, 'the page has received room:joined').toBeDefined();
  return frame!.payload as RoomJoined;
};

const tournamentOf = (p: Player): PublicTournament => {
  const tournament = latestView(p)?.tournament;
  expect(tournament, 'the page has received a tournament view').toBeTruthy();
  return tournament!;
};

/** A participant as the latest view `p` received (only among `p.frames[from..]`) shows it. */
const participantIn = (p: Player, id: string, from = 0): PublicParticipant | undefined =>
  latestView(p, from)?.tournament?.participants.find((x) => x.id === id);

/**
 * Ann creates a Classic tournament in `format`, Ben, Cleo and Dan join by code, Ann starts it.
 * Resolves in the lobby state right before the start, with everyone's participant id known.
 */
async function openTournament(browser: Browser, format: TournamentFormatName): Promise<{ people: Person[]; code: string }> {
  const players = await Promise.all(NAMES.map(() => newPlayer(browser)));
  const [host] = players;
  await openHome(host!.page);
  await createTournament(host!.page, { nickname: NAMES[0], format, mode: 'Classic' });
  const code = await tournamentCode(host!.page);
  await expect(host!.page.getByText(`Format: ${format}`)).toBeVisible();

  for (const [i, p] of players.entries()) {
    if (i === 0) continue;
    await openHome(p.page);
    await joinRoom(p.page, code, NAMES[i]!);
    await expect(p.page.getByText('Waiting for the host to start the tournament…')).toBeVisible(SLOW);
  }
  for (const p of players) await expect(p.page.getByText('4 / 8 players')).toBeVisible(SLOW);

  const people = players.map((p, i) => ({ ...p, name: NAMES[i]!, id: tournamentOf(p).youId ?? '' }));
  for (const person of people) expect(person.id).not.toBe('');
  expect(new Set(people.map((p) => p.id)).size).toBe(4);
  return { people, code };
}

/**
 * Waits until a match runs and splits the people: the two of the running pairing are on the board,
 * everyone else watches. Nobody picks meanwhile, so the pick phase holds still (PICK_TIMEOUT_MS).
 */
async function splitPairing(people: Person[]): Promise<{ playing: Person[]; watching: Person[] }> {
  for (const p of people) await expect(appScreen(p.page)).toHaveAttribute('data-screen', /^(board|spectate)$/, SLOW);
  const playing: Person[] = [];
  const watching: Person[] = [];
  for (const p of people) ((await appScreen(p.page).getAttribute('data-screen')) === 'board' ? playing : watching).push(p);
  expect(playing, 'exactly two people play the running pairing').toHaveLength(2);
  for (const p of playing) await expect(p.page.getByText('Pick your gesture!')).toBeVisible(SLOW);
  for (const p of watching) {
    await expect(p.page.getByText('You are watching', { exact: true })).toBeVisible(SLOW);
    await expect(p.page.getByText('The players are choosing…')).toBeVisible(SLOW);
  }
  return { playing, watching };
}

/** Watchers have nothing to play with: no gesture pad, no gesture on the screen. */
async function expectNoGestures(page: Page): Promise<void> {
  await expect(page.getByTestId('spectate')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.locator('[data-gesture]')).toHaveCount(0);
}

/**
 * The winner picks Rock, the loser Scissors, twice: a 2 : 0 best of 3. `next` is the screen everyone
 * reaches after the deciding reveal. `whileLocked` runs in round 1 after the winner locked in and
 * before the loser picks (the window in which nobody else may learn the winner's gesture).
 */
async function playPairing(
  match: { winner: Person; loser: Person; watching: Person[] },
  next: (page: Page) => Locator,
  whileLocked?: () => Promise<void>,
): Promise<void> {
  const { winner, loser, watching } = match;
  for (const round of [1, 2]) {
    await expect(gesture(winner.page, 'Rock')).toBeEnabled(SLOW);
    await expect(gesture(loser.page, 'Scissors')).toBeEnabled(SLOW);
    await gesture(winner.page, 'Rock').click();
    if (round === 1 && whileLocked) await whileLocked();
    await gesture(loser.page, 'Scissors').click();

    // One atomic capture per page; nobody presses Continue before all captures are in.
    const [byWinner, byLoser, ...byWatchers] = await Promise.all([winner, loser, ...watching].map((p) => captureReveal(p.page)));
    expect(byWinner!.status).toBe('You win the round!');
    expect(byLoser!.status).toBe('You lose the round!');
    expect(byWinner!.cards['Opponent']?.gestures).toEqual(['scissors']);
    expect(byLoser!.cards['Opponent']?.gestures).toEqual(['rock']);
    for (const seen of byWatchers) {
      expect(seen.status).toBe(`${winner.name} wins the round!`);
      expect(seen.cards[winner.name]?.gestures).toEqual(['rock']);
      expect(seen.cards[loser.name]?.gestures).toEqual(['scissors']);
    }

    const after = round === 1 ? (page: Page) => page.getByText('Pick your gesture!') : next;
    await Promise.all([winner, loser].map((p) => leaveReveal(p.page, after(p.page))));
  }
  for (const p of watching) await expect(next(p.page)).toBeVisible(SLOW);
}

const intermission = (page: Page) => page.getByRole('heading', { level: 2, name: 'Match over' });
const podium = (page: Page) => page.getByRole('heading', { level: 2, name: 'Podium' });

/**
 * The secrecy check while the winner of the first pick has locked in: every watcher sees that, but
 * neither its screen nor any frame it ever received names the gesture, and nothing from a
 * participant's own channel (a token, another youId, a player view, a pick) reached it.
 */
async function expectWatchersLearnNothing(locked: Person, watching: Person[], everyone: Person[]): Promise<void> {
  const tokens = new Map(everyone.map((p) => [p.id, joinedOf(p).token]));
  for (const w of watching) {
    await expect(w.page.getByText(`${locked.name} has locked in`)).toBeVisible(SLOW);
    await expectNoGestures(w.page);
    // The barrier: the watcher has received the update that says one side is locked in.
    await expect
      .poll(
        () =>
          eventFrames(w.frames).some(
            (f) => f.event === 'room:state' && (f.payload as RoomView).match?.lockedSeats.length === 1,
          ),
        SLOW,
      )
      .toBe(true);
    expect(w.frames.some((f) => f.raw.startsWith('0'))).toBe(true); // engine.io open packet: the raw list is complete
    for (const frame of w.frames) {
      expect(frame.raw.toLowerCase()).not.toContain('rock');
      expect(frame.raw).not.toContain('"yourPick":"');
      expect(frame.raw).not.toContain('"role":"player"');
      for (const [id, token] of tokens) {
        // Its own token belongs in its room:joined frame and nowhere else; the others' tokens nowhere.
        if (!(id === w.id && frame.event === 'room:joined')) expect(frame.raw).not.toContain(token);
        if (id !== w.id) expect(frame.raw).not.toContain(`"youId":"${id}"`);
      }
    }
    // Every view it got was its own participant view: a watcher's, addressed to itself.
    for (const f of eventFrames(w.frames).filter((x) => x.event === 'room:state')) {
      const view = f.payload as RoomView;
      expect(view.role).toBe('spectator');
      expect(view.tournament?.youId).toBe(w.id);
      expect(view.match?.yourPick ?? null).toBeNull();
    }
  }
}

test('tournament knockout: four players, live watchers, host skip, podium and rematch', async ({ browser }) => {
  const { people } = await openTournament(browser, 'Knockout');
  const host = people[0]!;

  await expect(host.page.getByRole('button', { name: 'Start tournament' })).toBeEnabled();
  for (const p of people.slice(1)) await expect(p.page.getByRole('button', { name: 'Start tournament' })).toHaveCount(0);
  await host.page.getByRole('button', { name: 'Start tournament' }).click();

  // Semifinal 1: the two of the first pairing play, the two others watch it live.
  const first = await splitPairing(people);
  const [w1, l1] = first.playing as [Person, Person];
  await playPairing({ winner: w1, loser: l1, watching: first.watching }, intermission, () =>
    expectWatchersLearnNothing(w1, first.watching, people),
  );

  // The intermission: the host skips the wait at once (INTERMISSION_MS runs meanwhile, so no checks before the click).
  await expect(host.page.getByText(`${w1.name} wins!`, { exact: true })).toBeVisible(SLOW);
  const waitUntil = tournamentOf(host).untilMs;
  expect(tournamentOf(host).phase).toBe('intermission');
  expect(waitUntil).not.toBeNull();
  const skippedAt = Date.now();
  await host.page.getByRole('button', { name: 'Skip', exact: true }).click();

  // Everyone else got the same intermission with the result, but not as host (so without Skip).
  for (const p of people.slice(1)) {
    const views = eventFrames(p.frames)
      .filter((f) => f.event === 'room:state' && (f.payload as RoomView).tournament?.phase === 'intermission')
      .map((f) => f.payload as RoomView);
    expect(views.length, `${p.name} received the intermission`).toBeGreaterThan(0);
    for (const view of views) {
      expect(view.isHost).toBe(false);
      const t = view.tournament!;
      expect(t.pairings.find((x) => x.id === t.currentPairingId)?.winner).toBe(w1.id);
    }
  }

  // Semifinal 2: the other two. It started before the intermission would have run out by itself
  // (the frame timestamps and `untilMs` come from the same clock: server and browsers share the machine).
  const second = await splitPairing(people);
  expect(second.playing.map((p) => p.id).sort()).toEqual(first.watching.map((p) => p.id).sort());
  const started = eventFrames(host.frames).find(
    (f) => f.at >= skippedAt && f.event === 'room:state' && (f.payload as RoomView).tournament?.phase === 'match',
  );
  expect(started, 'the host received the start of the second pairing').toBeDefined();
  expect(started!.at).toBeLessThan(waitUntil!);
  const [w2, l2] = second.playing as [Person, Person];
  await playPairing({ winner: w2, loser: l2, watching: second.watching }, intermission);

  // The final: both semifinal winners; the eliminated two watch.
  for (const p of people) await expect(p.page.getByText(`${w2.name} wins!`, { exact: true })).toBeVisible(SLOW);
  const final = await splitPairing(people);
  expect(final.playing.map((p) => p.id).sort()).toEqual([w1.id, w2.id].sort());
  const champion = final.playing.find((p) => p.id === w1.id)!;
  const runnerUp = final.playing.find((p) => p.id === w2.id)!;
  await playPairing({ winner: champion, loser: runnerUp, watching: final.watching }, podium);

  // The award ceremony: places 1 to 3 (both semifinal losers share 3rd), the same for everyone.
  for (const p of people) {
    await expect(p.page.getByText(`${champion.name} is the champion!`)).toBeVisible(SLOW);
    const places = p.page.getByRole('list', { name: 'Podium' });
    await expect(places.locator('[data-rank="1"]')).toContainText(champion.name);
    await expect(places.locator('[data-rank="2"]')).toContainText(runnerUp.name);
    for (const third of [l1, l2]) await expect(places.locator('[data-rank="3"]')).toContainText(third.name);
    for (const n of [1, 2, 3]) await expect(places.getByText(`Place ${n}`, { exact: true })).toBeVisible();
  }
  expect(tournamentOf(host).podium).toEqual([
    { rank: 1, ids: [champion.id] },
    { rank: 2, ids: [runnerUp.id] },
    { rank: 3, ids: people.filter((p) => p.id === l1.id || p.id === l2.id).map((p) => p.id) },
  ]);

  // Rematch: only the host offers it, and it takes everyone back to the lobby.
  for (const p of people.slice(1)) await expect(p.page.getByRole('button', { name: 'Play again' })).toHaveCount(0);
  await host.page.getByRole('button', { name: 'Play again' }).click();
  for (const p of people) {
    await expect(p.page.getByRole('heading', { level: 2, name: 'Tournament' })).toBeVisible(SLOW);
    await expect(p.page.getByText('4 / 8 players')).toBeVisible(SLOW);
  }
  await expect(host.page.getByRole('button', { name: 'Start tournament' })).toBeEnabled();
  for (const p of people.slice(1)) {
    await expect(p.page.getByText('Waiting for the host to start the tournament…')).toBeVisible();
  }

  for (const p of people) await p.context.close();
});

test('tournament round robin: a reload keeps the place, a dropped waiting player shows as disconnected without forfeiting', async ({ browser }) => {
  const { people } = await openTournament(browser, 'Round robin');
  const host = people[0]!;
  await host.page.getByRole('button', { name: 'Start tournament' }).click();

  const first = await splitPairing(people);
  const [w1, l1] = first.playing as [Person, Person];
  await playPairing({ winner: w1, loser: l1, watching: first.watching }, intermission);
  for (const p of people) await expect(p.page.getByText(`${w1.name} wins!`, { exact: true })).toBeVisible(SLOW);
  await expect(host.page.getByRole('table')).toContainText(w1.name);

  // The next pairing is the other half of round 1; the two who just played wait for later rounds.
  const upcoming = tournamentOf(host).pairings.find((p) => p.decidedBy === null);
  expect(upcoming).toBeDefined();
  const nextIds = [upcoming!.a, upcoming!.b];
  expect(nextIds.sort()).toEqual(first.watching.map((p) => p.id).sort());
  // The one who drops is not the host, so the host role (and the start of the next match) is not in play here.
  const leaver = first.playing.find((p) => p.id !== host.id)!;
  const reloader = first.playing.find((p) => p.id !== leaver.id)!;

  // A reload during the intermission (it may run out meanwhile): same participant, still in the tournament,
  // not back on the start screen. Only frames that arrived after the reload count for the checks below.
  const reloaderMark = reloader.frames.length;
  const hostMark = host.frames.length;
  await reloader.page.reload();
  await expect(reloader.page.getByText('Connected', { exact: true })).toBeVisible(SLOW);
  await expect(appScreen(reloader.page)).toHaveAttribute('data-screen', /^(tournament-intermission|spectate)$/, SLOW);
  await expect(reloader.page.getByRole('heading', { level: 2, name: 'Rock, Paper, Scissors: The Arena!' })).toHaveCount(0);
  await expect
    .poll(() => reloader.frames.findIndex((f, i) => i >= reloaderMark && f.event === 'room:joined'), SLOW)
    .toBeGreaterThanOrEqual(reloaderMark);
  // Views sent after the rejoin (they follow its room:joined frame) carry the restored state.
  const rejoined = reloader.frames.findIndex((f, i) => i >= reloaderMark && f.event === 'room:joined');
  await expect.poll(() => latestView(reloader, rejoined)?.tournament?.youId, SLOW).toBe(reloader.id);
  expect(latestView(reloader, rejoined)?.tournament?.participants).toHaveLength(4);
  expect(participantIn(reloader, reloader.id, rejoined)).toMatchObject({ connected: true, forfeited: false });
  await expect.poll(() => participantIn(host, reloader.id, hostMark)?.connected, SLOW).toBe(true);

  // Another one, waiting for a later match, closes the browser: it is shown as disconnected but has not
  // forfeited, since its grace period only starts once its next match is called up. The forfeit after the
  // grace period is covered by the server tests (the grace period cannot be shortened for the e2e run).
  await leaver.context.close();
  for (const p of people.filter((x) => x !== leaver)) {
    await expect.poll(() => participantIn(p, leaver.id)?.connected, SLOW).toBe(false);
    expect(participantIn(p, leaver.id)?.forfeited).toBe(false);
  }

  // The tournament does not wait for anybody: the intermission ends by itself and the next pairing plays.
  const rest = people.filter((p) => p !== leaver);
  for (const p of rest) await expect(appScreen(p.page)).toHaveAttribute('data-screen', /^(board|spectate)$/, SLOW);
  const second = rest.filter((p) => nextIds.includes(p.id));
  for (const p of second) await expect(p.page.getByText('Pick your gesture!')).toBeVisible(SLOW);
  await expect(appScreen(reloader.page)).toHaveAttribute('data-screen', 'spectate');
  await expect(reloader.page.getByText('You are watching', { exact: true })).toBeVisible();
  await expectNoGestures(reloader.page);
  expect(participantIn(reloader, leaver.id)).toMatchObject({ connected: false, forfeited: false });
  expect(participantIn(reloader, reloader.id)).toMatchObject({ connected: true, forfeited: false });

  for (const p of rest) await p.context.close();
});
