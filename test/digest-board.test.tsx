import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readStatus } from '../src/status.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };
const temporaryDirectories: string[] = [];

function temporaryRuns() {
  const dir = mkdtempSync(join(tmpdir(), 'rig-board-'));
  temporaryDirectories.push(dir);
  return dir;
}

function nightItem(html: string, night: string) {
  const item = html.match(/<li>.*?<\/li>/g)?.find((item) => item.includes(`href="/digest/${night}"`));
  expect(item, `digest link for ${night}`).toBeDefined();
  return item!.replace(/<[^>]*>/g, '');
}

afterEach(() => {
  for (const dir of temporaryDirectories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('digest links on the status board', () => {
  it('links both sample nights with valid-event counts, newest first', async () => {
    const response = await createApp(config).request('/');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(nightItem(html, '2026-10-28')).toMatch(/2026-10-28.*ok\s*10.*retry\s*4.*fail\s*1/);
    expect(nightItem(html, '2026-10-27')).toMatch(/2026-10-27.*ok\s*7.*retry\s*0.*fail\s*0/);
    expect(html.indexOf('href="/digest/2026-10-28"')).toBeLessThan(html.indexOf('href="/digest/2026-10-27"'));
    expect(readStatus(config).nights).toEqual(['2026-10-28', '2026-10-27']);
  });

  it('counts valid events rather than final job statuses and ignores bad lines', async () => {
    const runsDir = temporaryRuns();
    writeFileSync(join(runsDir, '2026-10-30.jsonl'), [
      '{bad json',
      JSON.stringify({ at: '2026-10-30T01:00:00+01:00', job: 'sync', status: 'retry', owner: null }),
      JSON.stringify({ at: '2026-10-30T01:01:00+01:00', job: 'sync', status: 'fail', owner: null }),
      JSON.stringify({ at: '2026-10-30T01:02:00+01:00', job: 'sync', status: 'ok', owner: null }),
      JSON.stringify({ at: '2026-10-30T01:03:00+01:00', job: 'sync', status: 'ok', owner: null }),
      JSON.stringify({ status: 'fail' }),
      '',
    ].join('\n'));

    const response = await createApp({ ...config, runsDir }).request('/');
    expect(response.status).toBe(200);
    expect(nightItem(await response.text(), '2026-10-30')).toMatch(/ok\s*2.*retry\s*1.*fail\s*1/);
  });

  it('keeps empty and entirely malformed nights linked with zero counts', async () => {
    const runsDir = temporaryRuns();
    writeFileSync(join(runsDir, '2026-10-29.jsonl'), '');
    writeFileSync(join(runsDir, '2026-10-30.jsonl'), 'not json\n{}\n');

    const response = await createApp({ ...config, runsDir }).request('/');
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(nightItem(html, '2026-10-29')).toMatch(/ok\s*0.*retry\s*0.*fail\s*0/);
    expect(nightItem(html, '2026-10-30')).toMatch(/ok\s*0.*retry\s*0.*fail\s*0/);
  });

  it('preserves the empty board when no nights exist', async () => {
    const response = await createApp({ ...config, runsDir: temporaryRuns() }).request('/');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('nothing in runs/');
  });
});
