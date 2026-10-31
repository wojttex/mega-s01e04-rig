import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { DigestNight } from '../src/digest/types.js';

const night = '2026-10-30';
const at = '2026-10-30T02:15:00+01:00';

function tableRows(html: string): string[] {
  return html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
}

describe('digest routes', () => {
  let root: string;
  let config: RigConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
    const runsDir = join(root, 'runs');
    mkdirSync(runsDir);
    config = { adapter: 'shim', installed: at, beatEverySeconds: 60, runsDir };
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeNight(lines: unknown[]) {
    writeFileSync(join(config.runsDir, `${night}.jsonl`), lines.map((line) => JSON.stringify(line)).join('\n'));
  }

  it('serves the digest in the usual HTML layout', async () => {
    writeNight([{ at, job: 'nightly-job', owner: 'rook', status: 'ok' }]);
    const previousMarker = process.env.LANE_MARKER;
    process.env.LANE_MARKER = 'DIGEST-ROUTE-TEST';
    try {
      const res = await createApp(config).request(`/digest/${night}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      const html = await res.text();
      expect(html).toMatch(/<!doctype html>/i);
      expect(html).toMatch(/<header\b[^>]*>[\s\S]*DIGEST-ROUTE-TEST[\s\S]*?<\/header>/i);
      expect(html).toMatch(/<main\b[^>]*>[\s\S]*nightly-job[\s\S]*?<\/main>/i);
      expect(html.match(/<style\b/gi)).toHaveLength(1);
      expect(html).not.toMatch(/<script\b/i);
    } finally {
      if (previousMarker === undefined) delete process.env.LANE_MARKER;
      else process.env.LANE_MARKER = previousMarker;
    }
  });

  it('returns the complete DigestNight as JSON', async () => {
    writeNight([{ at, job: 'nightly-job', owner: 'rook', status: 'retry', error: 'try again' }]);
    const res = await createApp(config).request(`/api/digest/${night}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({
      night,
      rows: [{ job: 'nightly-job', owner: 'rook', runs: 1, retries: 1, lastStatus: 'retry',
        lastError: 'try again', firstAt: at, lastAt: at, hasFailure: false }],
      badLines: 0,
      counts: { ok: 0, retry: 1, fail: 0 },
    });
  });

  it.each(['/digest', '/api/digest'])('returns 404 for a missing night at %s', async (route) => {
    const res = await createApp(config).request(`${route}/${night}`);
    expect(res.status).toBe(404);
  });

  it('renders an empty night as nothing ran and returns an empty JSON digest', async () => {
    writeNight([]);
    const app = createApp(config);
    const page = await app.request(`/digest/${night}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toMatch(/nothing ran/i);
    const json = await app.request(`/api/digest/${night}`);
    expect(json.status).toBe(200);
    expect(await json.json()).toEqual({ night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('keeps valid rows when a malformed line occurs and counts it in JSON', async () => {
    writeFileSync(join(config.runsDir, `${night}.jsonl`), [
      JSON.stringify({ at, job: 'surviving-job', owner: 'rook', status: 'fail', error: 'job failed' }),
      '{ malformed json',
      '',
    ].join('\n'));
    const app = createApp(config);
    const page = await app.request(`/digest/${night}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('surviving-job');
    const json = await app.request(`/api/digest/${night}`);
    expect(json.status).toBe(200);
    const digest: DigestNight = await json.json();
    expect(digest.badLines).toBe(1);
    expect(digest.rows.map((row) => row.job)).toEqual(['surviving-job']);
    expect(digest.counts).toEqual({ ok: 0, retry: 0, fail: 1 });
  });

  it('uses the same lexical job order on the page and in JSON', async () => {
    writeNight(['zulu-job', 'alpha-job', 'middle-job'].map((job) => ({ at, job, owner: 'rook', status: 'ok' })));
    const app = createApp(config);
    const page = await app.request(`/digest/${night}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    const jobs = ['alpha-job', 'middle-job', 'zulu-job'];
    const pageJobs = tableRows(html).flatMap((row) => jobs.filter((job) => row.includes(job)));
    expect(pageJobs).toEqual(jobs);
    const json = await app.request(`/api/digest/${night}`);
    expect(json.status).toBe(200);
    const digest: DigestNight = await json.json();
    expect(digest.rows.map((row) => row.job)).toEqual(pageJobs);
  });

  it('keeps a null-owner job and displays an em dash in its row', async () => {
    writeNight([{ at, job: 'unowned-job', owner: null, status: 'ok' }]);
    const res = await createApp(config).request(`/digest/${night}`);
    expect(res.status).toBe(200);
    const row = tableRows(await res.text()).find((row) => row.includes('unowned-job'));
    expect(row).toBeDefined();
    const cells = row?.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) ?? [];
    expect(cells.map((cell) => cell.replace(/<[^>]*>/g, '').trim())).toContain('—');
  });

  it('escapes malicious job, owner, and error text in HTML', async () => {
    const job = '<script>alert("job")</script>';
    const owner = '<img src=x onerror=alert("owner")>';
    const error = '<svg onload=alert("error")>';
    writeNight([{ at, job, owner, status: 'fail', error }]);
    const res = await createApp(config).request(`/digest/${night}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    for (const text of [job, owner, error]) expect(html).not.toContain(text);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=');
    expect(html).toContain('&lt;svg onload=');
    expect(html).not.toMatch(/<(script|img|svg)\b/i);
  });

  it.each(['/digest', '/api/digest'])('rejects encoded traversal outside the configured directory at %s', async (route) => {
    const secretJob = 'outside-directory-secret';
    writeFileSync(join(root, `${night}.jsonl`), JSON.stringify({ at, job: secretJob, owner: 'rook', status: 'ok' }));
    const res = await createApp(config).request(`${route}/%2e%2e%2f${night}`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain(secretJob);
  });
});
