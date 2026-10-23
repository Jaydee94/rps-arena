/**
 * Registry of the matchup effect art. Adding a scene means adding a file, never editing this one:
 * - `fx/<attack>.svelte` (e.g. `smash.svelte`): the attack graphic that ClashFx draws at the loser's sticker
 *   (also `clash.svelte` for a draw);
 * - `fx/react-<reaction>.svelte` (e.g. `react-crumble.svelte`): optional overlay art inside the losing
 *   sticker, props `{ gesture, size }`.
 * Markup only: motion lives in styles/animations.css (REVEAL, `---- fx: ... ----` sub-sections).
 */
import type { Component } from 'svelte';

const files = import.meta.glob<Component<Record<string, unknown>>>('./*.svelte', { eager: true, import: 'default' });

const byName: Record<string, Component<Record<string, unknown>>> = Object.fromEntries(
  Object.entries(files).map(([path, component]) => [path.slice(2, -'.svelte'.length), component]),
);

/** The attack graphic for `attack` (or `clash`), or null when that scene does not exist yet. */
export function attackArt(attack: string): Component<Record<string, unknown>> | null {
  return attack.startsWith('react-') || !Object.hasOwn(byName, attack) ? null : (byName[attack] ?? null);
}

/** The overlay art of a losing sticker for `reaction`, or null when the reaction needs none (yet). */
export function reactionArt(reaction: string): Component<Record<string, unknown>> | null {
  return byName[`react-${reaction}`] ?? null;
}
