import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

describe('digest page', () => {
  let runsDir: string;

  beforeEach(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-page-'));
    vi.stubEnv('LANE_ID', 'page-lane');
    vi.stubEnv('LANE_MARKER', 'PAGE-MARKER');
  });

  afterEach(() => {
    rmSync(runsDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  function app() {
    return createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
  }

  function writeNight(events: unknown[]) {
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), events.map((event) => JSON.stringify(event)).join('\n'));
  }

  it('renders one sorted table with every row field, original offsets and the lane banner', async () => {
    writeNight([
      { job: 'zulu', owner: 'Zoë', status: 'ok', at: '2026-10-28T03:00:00+02:00' },
      { job: 'alpha', owner: 'Ada', status: 'retry', at: '2026-10-28T01:00:00+01:00', error: 'timed out' },
      { job: 'alpha', owner: 'Ben', status: 'ok', at: '2026-10-28T03:30:00+02:00' },
    ]);
    const response = await app().request('/digest/2026-10-28');
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html.match(/<table>/g)).toHaveLength(1);
    expect(html.indexOf('<td>alpha</td>')).toBeLessThan(html.indexOf('<td>zulu</td>'));
    expect(html).toContain('<td>alpha</td><td>Ben</td><td>2</td><td>1</td><td>ok</td><td>timed out</td><td>2026-10-28T01:00:00+01:00</td><td>2026-10-28T03:30:00+02:00</td>');
    expect(html).toContain('page-lane');
    expect(html).toContain('PAGE-MARKER');
    expect(html).not.toMatch(/<script\b/i);
  });

  it('warns visibly about three retries and a failure even after recovery', async () => {
    writeNight([
      ...[1, 2, 3].map((hour) => ({ job: 'retrying', owner: null, status: 'retry', at: `2026-10-28T0${hour}:00:00+01:00` })),
      { job: 'retrying', owner: null, status: 'ok', at: '2026-10-28T04:00:00+01:00' },
      { job: 'recovered', owner: null, status: 'fail', at: '2026-10-28T01:00:00+01:00' },
      { job: 'recovered', owner: null, status: 'ok', at: '2026-10-28T02:00:00+01:00' },
      { job: 'normal', owner: null, status: 'ok', at: '2026-10-28T01:00:00+01:00' },
    ]);
    const html = await (await app().request('/digest/2026-10-28')).text();
    const recovered = html.match(/<tr[^>]*><td>recovered<\/td>.*?<\/tr>/)?.[0];
    const retrying = html.match(/<tr[^>]*><td>retrying<\/td>.*?<\/tr>/)?.[0];
    expect(recovered).toContain('class="warn"');
    expect(recovered).toContain('ok');
    expect(recovered).toContain('failure recorded');
    expect(retrying).toContain('class="warn"');
    expect(retrying).toContain('3 (high retries)');
    expect(html.match(/<tr[^>]*><td>normal<\/td>.*?<\/tr>/)?.[0]).not.toContain('class="warn"');
  });

  it('escapes untrusted fields and shows missing owner and error as em dashes', async () => {
    writeNight([
      { job: '<script>alert(1)</script>', owner: '<b>owner</b>', status: 'fail', at: '2026-10-28T01:00:00+01:00', error: '<img src=x onerror=alert(2)>' },
      { job: 'unowned', owner: null, status: 'ok', at: '2026-10-28T01:00:00+01:00' },
    ]);
    const html = await (await app().request('/digest/2026-10-28')).text();
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;owner&lt;/b&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(html).toContain('<td>unowned</td><td>—</td><td>1</td><td>0</td><td>ok</td><td>—</td>');
    expect(html).not.toMatch(/<(script|img|b)\b/i);
  });

  it('renders an empty night as nothing ran and reports bad lines', async () => {
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), '');
    const response = await app().request('/digest/2026-10-28');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('nothing ran');
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), '{invalid}\n');
    const html = await (await app().request('/digest/2026-10-28')).text();
    expect(html).toContain('nothing ran');
    expect(html).toContain('bad lines: 1');
  });

  it('keeps valid rows visible alongside bad-line counts', async () => {
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), '{invalid}\n' + JSON.stringify({ job: 'survivor', owner: null, status: 'ok', at: '2026-10-28T01:00:00+01:00' }));
    const response = await app().request('/digest/2026-10-28');
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('<td>survivor</td>');
    expect(html).toContain('bad lines: 1');
  });

  it('returns 404 for missing and invalid nights', async () => {
    for (const night of ['2026-10-27', 'not-a-date', '..%2Fsecret']) {
      expect((await app().request(`/digest/${night}`)).status).toBe(404);
    }
  });
});
