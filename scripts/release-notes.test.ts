import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateNotes } from '@semantic-release/release-notes-generator';
import { describe, expect, it } from 'vitest';

type PluginSpec = string | [string, Record<string, unknown>];

const releaseConfig = JSON.parse(
  readFileSync(fileURLToPath(new URL('../.releaserc.json', import.meta.url)), 'utf8'),
) as { plugins: PluginSpec[] };

const notesEntry = releaseConfig.plugins.find(
  (plugin): plugin is [string, Record<string, unknown>] =>
    Array.isArray(plugin) && plugin[0] === '@semantic-release/release-notes-generator',
);
if (!notesEntry) throw new Error('.releaserc.json has no configured @semantic-release/release-notes-generator');

const logger = { log: () => undefined, error: () => undefined };

const commit = (hash: string, message: string) => ({
  hash: hash.repeat(40 / hash.length),
  message,
  subject: message.split('\n')[0],
  body: message.split('\n').slice(2).join('\n'),
  committerDate: '2026-10-22T10:00:00.000Z',
});

// Guards the pairing of the preset with the writer that @semantic-release/release-notes-generator
// bundles: conventional-changelog-conventionalcommits 10.x needs conventional-changelog-writer 9+,
// but the (only stable) notes generator 14.1.1 ships writer 8.x, so the preset is pinned to 9.x.
// Renovate bumping the preset to 10.x makes this test fail instead of the first real release.
describe('release notes with the configured preset', () => {
  it('generates notes for a mix of commits (the real plugin, no network)', async () => {
    const notes = await generateNotes(notesEntry[1], {
      cwd: process.cwd(),
      commits: [
        commit('a1', 'feat: add lobby chat'),
        commit('b2', 'fix: handle reconnect'),
        commit('c3', 'fix(deps): bump socket.io to 4.9.0'),
        commit('d4', 'feat(server)!: drop the v1 protocol'),
        commit('e5', 'fix: tighten validation\n\nBREAKING CHANGE: invalid names are rejected'),
        commit('f6', 'docs: update the readme wording'),
      ],
      lastRelease: {},
      nextRelease: { version: '1.0.0', gitTag: 'v1.0.0' },
      options: { repositoryUrl: 'https://github.com/Jaydee94/rps-arena.git' },
      logger,
    });

    expect(notes).toContain('1.0.0');
    expect(notes).toContain('Features');
    expect(notes).toContain('add lobby chat');
    expect(notes).toContain('Bug Fixes');
    expect(notes).toContain('handle reconnect');
    expect(notes).toContain('bump socket.io to 4.9.0');
    expect(notes).toMatch(/BREAKING CHANGES/i);
    expect(notes).toContain('invalid names are rejected');
    expect(notes).not.toContain('update the readme wording');
  });
});
