import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import { gestureBeats, gestureSetFor, type ModeId } from '@rps/shared';
import RulesPanel from './RulesPanel.svelte';
import { setLocale, t } from '../lib/i18n';
import { doesSentence } from '../lib/matchup-fx';

const lines = () => screen.getAllByRole('listitem');

describe('RulesPanel', () => {
  beforeEach(() => setLocale('de'));

  it('is a native details element titled "Regeln" that starts closed', () => {
    const { container } = render(RulesPanel, { mode: 'classic' });
    const details = container.querySelector('details.rules') as HTMLDetailsElement;
    expect(details).toBeInTheDocument();
    expect(details.open).toBe(false);
    expect(within(details).getByText('Regeln', { selector: 'summary' })).toBeInTheDocument();
  });

  it('is titled "Rules" in English', () => {
    setLocale('en');
    render(RulesPanel, { mode: 'classic' });
    expect(screen.getByText('Rules', { selector: 'summary' })).toBeInTheDocument();
  });

  it('shows the mode description and one line per gesture in classic', () => {
    render(RulesPanel, { mode: 'classic' });
    expect(screen.getByText(t('mode.classic.desc'))).toBeInTheDocument();
    expect(lines()).toHaveLength(3);
    expect(lines().map((li) => li.textContent?.trim())).toEqual([
      'Stein zerquetscht Schere',
      'Schere zerschneidet Papier',
      'Papier bedeckt Stein',
    ]);
  });

  it('writes the lines in English', () => {
    setLocale('en');
    render(RulesPanel, { mode: 'lizard-spock' });
    expect(lines()[0]).toHaveTextContent('Rock crushes Scissors, crushes Lizard');
  });

  it('shows 15 lines with 7 names each in wheel15', () => {
    render(RulesPanel, { mode: 'wheel15' });
    const set = gestureSetFor('wheel15');
    expect(lines()).toHaveLength(15);
    set.gestures.forEach((gesture, i) => {
      const beaten = gestureBeats(set, gesture);
      expect(beaten).toHaveLength(7);
      expect(lines()[i]).toHaveTextContent(doesSentence(gesture, beaten));
    });
  });

  it('draws an icon for the gesture and for each beaten gesture', () => {
    const { container } = render(RulesPanel, { mode: 'wheel7' });
    // per line: 1 own icon + 3 beaten icons
    expect(container.querySelectorAll('li')[0]?.querySelectorAll('.gesture-icon')).toHaveLength(4);
  });

  it.each([
    ['bluff', 'lizard-spock', 5],
    ['team2v2', 'classic', 3],
    ['wheel9', 'wheel9', 9],
  ] as [ModeId, string, number][])('uses the %s gesture set (%s)', (mode, _set, count) => {
    render(RulesPanel, { mode });
    expect(lines()).toHaveLength(count);
    expect(screen.getByText(t(`mode.${mode}.desc`))).toBeInTheDocument();
  });
});
