import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestNight, DigestRow, DigestStatus, ReadNight } from './types.js';

interface Instant {
  milliseconds: number;
  remainder: string;
}

function compareInstants(a: Instant, b: Instant): number {
  return a.milliseconds - b.milliseconds
    || (a.remainder < b.remainder ? -1 : a.remainder > b.remainder ? 1 : 0);
}

interface RunEvent {
  at: string;
  time: Instant;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error: string | null;
}

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.job !== 'string' || !record.job.trim()) return null;
  if (record.status !== 'ok' && record.status !== 'retry' && record.status !== 'fail') return null;
  if (typeof record.at !== 'string') return null;
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d+))?(?:Z|[+-]\d{2}:\d{2})$/.exec(record.at);
  if (!timestamp) return null;
  const milliseconds = Date.parse(record.at);
  if (!Number.isFinite(milliseconds)) return null;
  // Date.parse drops digits after milliseconds. Keep them as a decimal fraction;
  // removing trailing zeros makes equivalent precisions compare equally.
  const time = { milliseconds, remainder: (timestamp[1] ?? '').slice(3).replace(/0+$/, '') };
  if (record.owner != null && typeof record.owner !== 'string') return null;
  if (record.error != null && typeof record.error !== 'string') return null;
  return {
    at: record.at,
    time,
    job: record.job,
    status: record.status,
    owner: record.owner ?? null,
    error: record.error ?? null,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (night.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let content: string;
  try {
    content = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const result: DigestNight = { night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
  const jobs = new Map<string, { row: DigestRow; firstTime: Instant; lastTime: Instant; errorTime: Instant | null }>();
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    const event = parseEvent(line);
    if (!event) {
      result.badLines++;
      continue;
    }
    result.counts[event.status]++;
    const existing = jobs.get(event.job);
    if (!existing) {
      jobs.set(event.job, {
        row: {
          job: event.job,
          owner: event.owner,
          runs: 1,
          retries: event.status === 'retry' ? 1 : 0,
          lastStatus: event.status,
          lastError: event.error,
          firstAt: event.at,
          lastAt: event.at,
          hasFailure: event.status === 'fail',
        },
        firstTime: event.time,
        lastTime: event.time,
        errorTime: event.error === null ? null : event.time,
      });
      continue;
    }
    const { row } = existing;
    row.runs++;
    if (event.status === 'retry') row.retries++;
    if (event.status === 'fail') row.hasFailure = true;
    if (compareInstants(event.time, existing.firstTime) < 0) {
      existing.firstTime = event.time;
      row.firstAt = event.at;
    }
    if (compareInstants(event.time, existing.lastTime) >= 0) {
      existing.lastTime = event.time;
      row.lastAt = event.at;
      row.lastStatus = event.status;
      row.owner = event.owner;
    }
    if (event.error !== null && (existing.errorTime === null || compareInstants(event.time, existing.errorTime) >= 0)) {
      existing.errorTime = event.time;
      row.lastError = event.error;
    }
  }
  result.rows = [...jobs.values()].map(({ row }) => row)
    .sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return result;
};
