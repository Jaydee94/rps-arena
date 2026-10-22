import type { RoundResult, SeatId, Team } from '@rps/shared';
import { teamOf } from './seats';

export type Outcome = 'win' | 'lose' | 'draw';

export interface DuelView {
  mine: SeatId;
  theirs: SeatId;
  outcome: Outcome;
}

export function outcomeFor(winner: Team | 'draw', myTeam: Team): Outcome {
  if (winner === 'draw') return 'draw';
  return winner === myTeam ? 'win' : 'lose';
}

/** The duels of a round seen from `you`: the own duel first, own seat always on `mine`. */
export function duelViews(round: RoundResult, you: SeatId): DuelView[] {
  const myTeam = teamOf(you);
  const views = round.duels.map(({ seats: [first, second], result }) => {
    const [mine, theirs] = teamOf(first) === myTeam ? [first, second] : [second, first];
    // seats[0] is the 'a' side of the duel, so 'a' means seat team a won.
    return { mine, theirs, outcome: outcomeFor(result === 'draw' ? 'draw' : result, myTeam) };
  });
  return views.sort((x, y) => Number(y.mine === you) - Number(x.mine === you));
}

/** One side of the scoreboard. */
export interface Side {
  name: string;
  avatar: string;
  score: number;
}
