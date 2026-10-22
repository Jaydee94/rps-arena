import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Scoreboard from './Scoreboard.svelte';
import { setLocale } from '../lib/i18n';
import type { Side } from '../lib/board';

const player = (name: string, avatar: string, team: 'a' | 'b', score: number): Side => ({ name, avatar, team, score });
const teamSide = (name: string, team: 'a' | 'b', score: number): Side => ({ name, avatar: null, team, score });

describe('Scoreboard', () => {
  beforeEach(() => setLocale('de'));

  it('shows the avatar of each player and no team dot', () => {
    const { container } = render(Scoreboard, {
      left: player('Ann', 'fox', 'a', 1),
      right: player('Ben', 'owl', 'b', 0),
      round: 2,
      bestOf: 3,
      modeName: 'Klassisch',
    });
    expect(container.querySelector('[data-avatar="fox"]')).not.toBeNull();
    expect(container.querySelector('[data-avatar="owl"]')).not.toBeNull();
    expect(container.querySelector('.team-dot')).toBeNull();
  });

  it('shows a team dot instead of an avatar for team sides', () => {
    const { container } = render(Scoreboard, {
      left: teamSide('Team Rot', 'a', 1),
      right: teamSide('Team Blau', 'b', 0),
      round: 1,
      bestOf: 3,
      modeName: 'Team 2 gegen 2',
    });
    expect(container.querySelectorAll('.team-dot')).toHaveLength(2);
    expect(container.querySelector('[data-avatar]')).toBeNull();
    expect(screen.getByText('Team Rot')).toBeInTheDocument();
  });

  it('names the score group "Spielstand" and shows both points', () => {
    render(Scoreboard, {
      left: player('Ann', 'fox', 'a', 1),
      right: player('Ben', 'owl', 'b', 0),
      round: 2,
      bestOf: 3,
      modeName: 'Klassisch',
    });
    expect(screen.getByRole('group', { name: 'Spielstand' })).toHaveTextContent('1 : 0');
  });

  it('shows round on the left and best-of with the mode on the right of the meta line', () => {
    render(Scoreboard, {
      left: player('Ann', 'fox', 'a', 1),
      right: player('Ben', 'owl', 'b', 0),
      round: 2,
      bestOf: 3,
      modeName: 'Klassisch',
    });
    expect(screen.getByText('Runde 2')).toBeInTheDocument();
    expect(screen.getByText('Best of 3')).toBeInTheDocument();
    expect(screen.getByText('Klassisch')).toBeInTheDocument();
  });
});
