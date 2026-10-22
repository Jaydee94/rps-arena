import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import { describe, expect, it } from 'vitest';

type PluginSpec = string | [string, Record<string, unknown>];

const releaseConfig = JSON.parse(
  readFileSync(fileURLToPath(new URL('../.releaserc.json', import.meta.url)), 'utf8'),
) as { branches: string[]; plugins: PluginSpec[] };

const analyzerEntry = releaseConfig.plugins.find(
  (plugin): plugin is [string, Record<string, unknown>] =>
    Array.isArray(plugin) && plugin[0] === '@semantic-release/commit-analyzer',
);
if (!analyzerEntry) throw new Error('.releaserc.json has no configured @semantic-release/commit-analyzer');
const analyzerConfig = analyzerEntry[1];

const logger = { log: () => undefined, error: () => undefined };

/** The release type semantic-release would derive from these commit messages (null = no release). */
async function releaseType(...messages: string[]): Promise<string | null> {
  const commits = messages.map((message, index) => ({
    hash: `deadbeef${index}`,
    message,
  }));
  const result = await analyzeCommits(analyzerConfig, {
    cwd: process.cwd(),
    commits,
    logger,
  });
  return result ?? null;
}

describe('.releaserc.json', () => {
  it('releases from main only and never writes back to the repository', () => {
    expect(releaseConfig.branches).toEqual(['main']);
    const names = releaseConfig.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
    expect(names).toEqual([
      '@semantic-release/commit-analyzer',
      '@semantic-release/release-notes-generator',
      '@semantic-release/github',
      '@semantic-release/exec',
    ]);
    expect(names).not.toContain('@semantic-release/git');
    expect(names).not.toContain('@semantic-release/changelog');
  });
});

describe('release rules', () => {
  it.each([
    ['feat: add lobby', 'minor'],
    ['feat(web): add lobby', 'minor'],
    ['fix: handle reconnect', 'patch'],
    ['perf: cache avatars', 'patch'],
    ['fix(deps): bump socket.io to 4.9.0', 'patch'],
    ['feat!: drop the v1 protocol', 'major'],
    ['feat(server)!: drop the v1 protocol', 'major'],
    ['feat: new protocol\n\nBREAKING CHANGE: v1 clients are rejected', 'major'],
    ['fix: tighten validation\n\nBREAKING CHANGE: invalid names are rejected', 'major'],
  ])('%j -> %s', async (message, expected) => {
    expect(await releaseType(message)).toBe(expected);
  });

  it.each([
    'docs: update readme',
    'ci: pin actions',
    'chore: tidy',
    'chore(deps): bump lockfile maintenance',
    'test: cover reconnect',
    'refactor: extract helper',
    'build: tweak dockerfile',
    'style: format',
    'not a conventional commit',
  ])('%j -> no release', async (message) => {
    expect(await releaseType(message)).toBeNull();
  });

  it('takes the highest release type of a mixed list', async () => {
    expect(await releaseType('docs: x', 'chore: y')).toBeNull();
    expect(await releaseType('docs: x', 'fix: y')).toBe('patch');
    expect(await releaseType('fix: x', 'feat: y', 'ci: z')).toBe('minor');
    expect(await releaseType('fix: x', 'feat: y', 'refactor!: z')).toBe('major');
  });
});
