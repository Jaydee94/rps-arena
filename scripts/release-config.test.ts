import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { template } from 'lodash-es';
import { describe, expect, it } from 'vitest';

// @semantic-release/exec renders every command with lodash `template` over the release context
// (lib/exec.js: `template(config[cmd])({ config, ...context })`). This renders the configured
// publishCmd with that very function.

type PluginSpec = string | [string, Record<string, unknown>];

const releaseConfig = JSON.parse(
  readFileSync(fileURLToPath(new URL('../.releaserc.json', import.meta.url)), 'utf8'),
) as { plugins: PluginSpec[] };

const execEntry = releaseConfig.plugins.find(
  (plugin): plugin is [string, Record<string, unknown>] =>
    Array.isArray(plugin) && plugin[0] === '@semantic-release/exec',
);
if (!execEntry) throw new Error('.releaserc.json has no configured @semantic-release/exec');
const publishCmd = execEntry[1]['publishCmd'];
if (typeof publishCmd !== 'string') throw new Error('@semantic-release/exec has no publishCmd');

const render = (lastRelease: Record<string, unknown>): string =>
  template(publishCmd)({ config: execEntry[1], lastRelease, nextRelease: { version: '1.0.0' } });

describe('.releaserc.json publishCmd', () => {
  it('assumes missing registry packages only for the very first release (lastRelease is {})', () => {
    expect(render({})).toBe('PUBLISH_ASSUME_MISSING=1 bash scripts/publish.sh 1.0.0');
  });

  it('leaves the flag empty (strict existence checks) for every later release', () => {
    expect(render({ version: '1.2.3' })).toBe('PUBLISH_ASSUME_MISSING= bash scripts/publish.sh 1.0.0');
  });

  it('treats an explicitly undefined version like the first release', () => {
    expect(render({ version: undefined })).toBe('PUBLISH_ASSUME_MISSING=1 bash scripts/publish.sh 1.0.0');
  });
});
