import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import App from './App.svelte';
import { setLocale } from './lib/i18n';
import { actions, lastErrorStore, resetConnectionMock, roomStore } from './test/connection-mock';
import { makeRoom } from './test/fixtures';

vi.mock('./lib/connection', async () => (await import('./test/connection-mock')).connectionMock);

describe('App screen routing', () => {
  beforeEach(() => {
    setLocale('de');
    resetConnectionMock();
  });

  it('shows Home without a room', () => {
    render(App);
    expect(screen.getByRole('button', { name: /Raum erstellen/ })).toBeInTheDocument();
  });

  it('shows the Lobby while there is no match', () => {
    roomStore.set(makeRoom({ match: null }));
    render(App);
    expect(screen.getByRole('heading', { name: 'Warteraum' })).toBeInTheDocument();
  });

  it.each(['announce', 'pick', 'reveal'] as const)('shows the Board in phase %s', (phase) => {
    const lastRound = { picks: { a0: 'rock', b0: 'spock' }, duels: [{ seats: ['a0', 'b0'] as ['a0', 'b0'], result: 'b' as const }], winner: 'b' as const };
    roomStore.set(makeRoom({ config: { mode: 'bluff', bestOf: 3 }, match: { phase, lastRound: phase === 'reveal' ? lastRound : null } }));
    render(App);
    expect(screen.getByRole('region', { name: 'Gegner' })).toBeInTheDocument();
  });

  it('shows the Result when the match is finished', () => {
    roomStore.set(makeRoom({ match: { phase: 'finished', winner: 'a' } }));
    render(App);
    expect(screen.getByRole('button', { name: 'Nochmal spielen' })).toBeInTheDocument();
  });

  it('switches screens when the room state changes', async () => {
    roomStore.set(makeRoom({ match: null }));
    render(App);
    expect(screen.getByRole('heading', { name: 'Warteraum' })).toBeInTheDocument();
    roomStore.set(makeRoom({ match: { phase: 'pick' } }));
    expect(await screen.findByRole('region', { name: 'Gegner' })).toBeInTheDocument();
  });

  it('shows a localized, dismissible error in an alert', async () => {
    lastErrorStore.set({ code: 'room_full', message: 'raw server text' });
    render(App);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Der Raum ist leider voll.');
    expect(alert).not.toHaveTextContent('raw server text');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Schließen' }));
    expect(actions.clearError).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
