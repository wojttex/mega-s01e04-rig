import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
let runsDir: string;

beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-reader-')); });
afterEach(() => { rmSync(runsDir, { recursive: true, force: true }); });

function writeLines(lines: unknown[]) {
  writeFileSync(join(runsDir, `${night}.jsonl`), lines.map((line) => JSON.stringify(line)).join('\n'));
}

const event = { at: '2026-10-28T23:00:00+01:00', job: 'job', status: 'ok', owner: 'rook' };

describe('readNight', () => {
  it('aggregates the sample night, retaining errors after recovery and original offsets', () => {
    const result = readNight('runs', night);
    expect(result?.badLines).toBe(1);
    expect(result?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(result?.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(result?.rows[0]).toEqual({
      job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok',
      lastError: null, firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00', hasFailure: false,
    });
    expect(result?.rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok',
      lastError: 'upstream 503', firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00', hasFailure: false,
    });
    expect(result?.rows[2]).toMatchObject({ runs: 8, retries: 1, lastError: 'lock held', lastStatus: 'ok' });
    expect(result?.rows[3]).toMatchObject({ runs: 1, retries: 0, hasFailure: true, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('returns null for a missing file', () => {
    expect(readNight(runsDir, night)).toBeNull();
  });

  it.each(['', '../2026-10-28', '/2026-10-28', '2026-1-28', '2026-10-28.jsonl', '2026-10-28/../2026-10-28', '2026-10-28\n'])(
    'rejects the invalid night name %j even when a valid file exists', (name) => {
      writeLines([event]);
      expect(readNight(runsDir, name)).toBeNull();
    },
  );

  it.each(['', '\n  \n\t\r\n'])('returns an empty digest for empty or blank input %j', (content) => {
    writeFileSync(join(runsDir, `${night}.jsonl`), content);
    expect(readNight(runsDir, night)).toEqual({ night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('counts malformed JSON and invalid record shapes while continuing to valid events', () => {
    writeLines([
      null, [], 'text', 42, {},
      { ...event, job: '' }, { ...event, job: 1 }, { ...event, job: '  ' },
      { ...event, at: 'not a date' }, { ...event, at: '2026-10-28T23:00:00' },
      { ...event, at: '2026-13-28T23:00:00+01:00' }, { ...event, at: 1 },
      { ...event, status: 'unknown' }, { ...event, owner: 1 }, { ...event, error: {} },
      event,
    ]);
    const file = join(runsDir, `${night}.jsonl`);
    writeFileSync(file, '\nnot JSON\n', { flag: 'a' });
    expect(readNight(runsDir, night)).toMatchObject({ badLines: 16, counts: { ok: 1, retry: 0, fail: 0 }, rows: [{ job: 'job', runs: 1 }] });
  });

  it('uses actual chronology for times, owner, status and the latest error-bearing event', () => {
    writeLines([
      { ...event, at: '2026-10-28T23:30:00+02:00', status: 'fail', error: 'older error' },
      { ...event, at: '2026-10-28T22:00:00Z', status: 'retry', error: 'latest error' },
      { ...event, at: '2026-10-28T23:00:00Z', owner: null },
      { ...event, at: '2026-10-28T22:45:00+02:00', status: 'retry', owner: 'old', error: 'earliest error' },
    ]);
    expect(readNight(runsDir, night)?.rows).toEqual([{
      job: 'job', owner: null, runs: 4, retries: 2, lastStatus: 'ok', lastError: 'latest error',
      firstAt: '2026-10-28T22:45:00+02:00', lastAt: '2026-10-28T23:00:00Z', hasFailure: true,
    }]);
  });

  it('breaks equal-instant ties in input order and preserves the selected spelling', () => {
    writeLines([
      { ...event, at: '2026-10-28T23:00:00+01:00', status: 'fail', error: 'first error' },
      { ...event, at: '2026-10-28T22:00:00Z', status: 'retry', owner: 'new', error: 'last error' },
    ]);
    expect(readNight(runsDir, night)?.rows[0]).toMatchObject({
      firstAt: '2026-10-28T23:00:00+01:00', lastAt: '2026-10-28T22:00:00Z', owner: 'new', lastStatus: 'retry', lastError: 'last error',
    });
  });

  it('handles missing owners and prototype-like job names with deterministic lexical sorting', () => {
    writeLines([
      { at: event.at, job: '__proto__', status: 'ok' },
      { ...event, job: 'constructor', error: null },
      { ...event, job: 'Z', owner: null },
    ]);
    const result = readNight(runsDir, night);
    expect(result?.rows.map((row) => row.job)).toEqual(['Z', '__proto__', 'constructor']);
    expect(result?.rows[1]).toMatchObject({ owner: null, runs: 1, lastError: null });
  });

  it('propagates non-missing-file I/O errors', () => {
    mkdirSync(join(runsDir, `${night}.jsonl`));
    expect(() => readNight(runsDir, night)).toThrow();
  });
});
