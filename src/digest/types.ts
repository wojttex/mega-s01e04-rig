/** Status of a valid run-log event. */
export type DigestStatus = 'ok' | 'retry' | 'fail';

/** Aggregated events for one job in a night. */
export interface DigestRow {
  job: string;
  /** Owner from the latest chronological event. */
  owner: string | null;
  /** All valid events for this job. */
  runs: number;
  /** Events whose status is retry. */
  retries: number;
  /** Status from the latest chronological event. */
  lastStatus: DigestStatus;
  /** Error from the latest error-bearing event, if any. */
  lastError: string | null;
  /** Earliest event timestamp, retaining its original offset and spelling. */
  firstAt: string;
  /** Latest event timestamp, retaining its original offset and spelling. */
  lastAt: string;
  /** Whether any valid event for the job failed. */
  hasFailure: boolean;
}

/** A night's valid events, grouped into deterministically job-sorted rows. */
export interface DigestNight {
  night: string;
  rows: DigestRow[];
  /** Malformed nonblank input lines. */
  badLines: number;
  /** Counts of valid log events by status. */
  counts: Record<DigestStatus, number>;
}

/**
 * Synchronously reads a night, returning null for a missing file or invalid
 * date-shaped name and propagating other I/O failures. Empty files produce an
 * empty digest. Blank lines are ignored; equal instants use input order to
 * break ties when selecting chronological events.
 */
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
