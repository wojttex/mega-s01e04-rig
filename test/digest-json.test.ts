import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('digest JSON', () => {
  let runsDir: string;

  beforeEach(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-json-'));
  });

  afterEach(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  const app = () => createApp({
    adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir,
  });

  it('returns the full digest with sorted rows and a nullable owner', async () => {
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), [
      { at: '2026-10-28T23:00:00+01:00', job: 'zebra', status: 'retry', owner: 'Zoe', error: 'busy' },
      { at: '2026-10-28T23:01:00+01:00', job: 'alpha', status: 'fail', owner: null, error: 'offline' },
      { at: '2026-10-28T23:02:00+01:00', job: 'zebra', status: 'ok', owner: 'Zoe' },
    ].map((event) => JSON.stringify(event)).join('\n'));

    const res = await app().request('/api/digest/2026-10-28');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({
      night: '2026-10-28',
      rows: [
        { job: 'alpha', owner: null, runs: 1, retries: 0, lastStatus: 'fail', lastError: 'offline',
          firstAt: '2026-10-28T23:01:00+01:00', lastAt: '2026-10-28T23:01:00+01:00', hasFailure: true },
        { job: 'zebra', owner: 'Zoe', runs: 2, retries: 1, lastStatus: 'ok', lastError: 'busy',
          firstAt: '2026-10-28T23:00:00+01:00', lastAt: '2026-10-28T23:02:00+01:00', hasFailure: false },
      ],
      badLines: 0,
      counts: { ok: 1, retry: 1, fail: 1 },
    });
  });

  it('returns 404 for a missing night', async () => {
    const res = await app().request('/api/digest/2026-10-29');

    expect(res.status).toBe(404);
  });

  it('returns an empty digest for an empty file', async () => {
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), '');

    const res = await app().request('/api/digest/2026-10-28');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      night: '2026-10-28', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('reports malformed lines while retaining valid rows', async () => {
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), [
      'not JSON',
      JSON.stringify({ at: '2026-10-28T23:00:00+01:00', job: 'alpha', status: 'ok', owner: null }),
      JSON.stringify({ job: 'invalid' }),
    ].join('\n'));

    const res = await app().request('/api/digest/2026-10-28');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      night: '2026-10-28',
      rows: [{ job: 'alpha', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-28T23:00:00+01:00', lastAt: '2026-10-28T23:00:00+01:00', hasFailure: false }],
      badLines: 2,
      counts: { ok: 1, retry: 0, fail: 0 },
    });
  });
});
