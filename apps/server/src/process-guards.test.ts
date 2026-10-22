import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { installUnhandledRejectionGuard, REJECTION_LOG_WINDOW_MS } from './process-guards';

function setup() {
  const target = new EventEmitter();
  const lines: string[] = [];
  let time = 1_000;
  installUnhandledRejectionGuard(target as unknown as NodeJS.Process, (line) => lines.push(line), () => time);
  return {
    reject: (reason: unknown) => target.emit('unhandledRejection', reason),
    lines,
    advance: (ms: number) => (time += ms),
  };
}

describe('unhandled rejection guard', () => {
  it('logs name and message and does not throw', () => {
    const { reject, lines } = setup();
    expect(() => reject(new RangeError('boom'))).not.toThrow();
    expect(lines).toEqual(['unhandled rejection (process keeps running): RangeError: boom']);
  });

  it('logs a repeating rejection once per window and reports how many were suppressed', () => {
    const { reject, lines, advance } = setup();
    for (let i = 0; i < 5; i++) reject(new Error('Stream is not writeable'));
    expect(lines).toHaveLength(1);
    advance(REJECTION_LOG_WINDOW_MS);
    reject(new Error('Stream is not writeable'));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('[+4 similar suppressed]');
  });

  it('alternating messages are each limited on their own', () => {
    const { reject, lines } = setup();
    for (let i = 0; i < 4; i++) {
      reject(new Error('a'));
      reject(new Error('b'));
    }
    expect(lines).toHaveLength(2);
  });

  it('never prints the value of a non-Error rejection', () => {
    const { reject, lines } = setup();
    reject('redis://:s3cret@host:6379');
    reject({ options: { password: 's3cret' } });
    expect(lines.join('\n')).not.toContain('s3cret');
    expect(lines).toHaveLength(2);
  });
});
