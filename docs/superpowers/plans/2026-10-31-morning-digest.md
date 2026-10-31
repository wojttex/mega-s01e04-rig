# Morning Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Tasks follow the human-approved A–H split; separate workers and branches per issue.

**Goal:** Turn nightly JSONL into a readable server-rendered digest and matching JSON, with a replaceable public review copy.

**Architecture:** A synchronous reader supplies one canonical sorted result to HTML, JSON and board counts. Routes remain in `src/app.tsx`, views in `src/views/`, logic in `src/digest/`.

**Tech Stack:** Node 22+, TypeScript strict, Hono JSX, Vitest, pnpm.

**Spec:** `plan.md`, `AGENTS.md`, `docs/vision.md`, `docs/styleguide.md`, `docs/adr/0001-server-rendered-jsx-no-client-js.md` through ADR 0004. Human approved the split and common issue fields in the Challenge chat on 2026-10-31.

## Global Constraints

- Never commit `.env`, tokens or previews. Keep private receipts and logs outside the repository.
- Don't touch `runs/`: those are real nights, read-only fixtures.
- No client JS (ADR 0001). One layout, one inline stylesheet.
- Times: keep the offset from the log; never convert to UTC for display.
- Missing data renders as `—`, never as an empty cell and never dropped.
- Each issue opens with `Source: plan.md § <n>` and carries `plan:morning-digest`.
- Public preview creation and later marker removal each require separate explicit human approval.

## Review Focus

- Malformed JSON and structurally invalid records count as bad lines without dropping valid jobs (B/F).
- Encoded traversal and non-date night parameters cannot read outside runsDir (B/F).
- Out-of-order timestamps and differing offsets preserve chronological first/last and original strings (B).
- Untrusted job/error strings are escaped in HTML (C/F).
- A retrying job that succeeds still shows its retry count; any earlier failure remains marked (B/C).

## Shared interfaces (implementation decisions)

`src/digest/types.ts` exports `DigestStatus = 'ok' | 'retry' | 'fail'`, `DigestRow` with `job: string`, `owner: string | null`, `runs: number`, `retries: number`, `lastStatus: DigestStatus`, `lastError: string | null`, `firstAt: string`, `lastAt: string`, `hasFailure: boolean`. `DigestNight` contains `night: string`, `rows: DigestRow[]`, `badLines: number`, `counts: Record<DigestStatus, number>`. `ReadNight = (runsDir: string, night: string) => DigestNight | null` specifies the synchronous reader contract; `src/digest/reader.ts` exports `readNight: ReadNight`. Missing files or invalid date-shaped names return null; other I/O failures propagate. Empty files return a non-null result with no rows. Counts summarize valid log events. Rows sort by job using deterministic lexical comparison. `runs` counts all valid events per job; `retries` counts retry events; latest chronological event supplies owner and status, latest error-bearing event supplies lastError, first/last retain original timestamp strings. Equal instants break ties by input order. Blank lines are ignored.

### Task 1: A. Types contract — § 1

**Files:** create `src/digest/types.ts`.
**Produces:** the shared interfaces above. No runtime behavior.
- [ ] Define documented exports and `ReadNight` signature; run `pnpm typecheck`.
- [ ] Commit types alone before implementation workers start; close only after verified and pushed.

### Task 2: B. Reader — § 1

**Files:** create `src/digest/reader.ts`, `test/digest-reader.test.ts`.
**Consumes:** A; **Produces:** `readNight: ReadNight`.
- [ ] Write tests for sample night: five jobs, one bad line; retry counts, nullable owner, event counts, latest error and any failure.
- [ ] Test missing/empty/malformed records, invalid path names, out-of-order timestamps with different offsets and safe job names such as `__proto__`.
- [ ] Observe failing tests, implement minimal reader with Map and validated input, then run reader tests, full suite and typecheck.
- [ ] Commit with issue reference and report evidence.

### Task 3: C. HTML — § 2a

**Files:** create `src/views/digest.tsx`, modify `src/app.tsx`; tests in `test/digest-page.test.tsx`.
**Consumes:** A and B's reader contract; **Produces:** GET `/digest/:night`.
- [ ] Write failing app.request tests with temporary fixtures for table, sorting, warning marks, escaped text, null owner, empty/missing nights and banner.
- [ ] Render all row fields in Layout; use `.warn` for >=3 retries or hasFailure. Display badLines and `nothing ran` where applicable.
- [ ] Run tests and typecheck; commit scoped changes.

### Task 4: D. JSON — § 2b

**Files:** modify `src/app.tsx`; create `test/digest-json.test.ts`.
**Consumes:** canonical readNight; **Produces:** GET `/api/digest/:night` returning DigestNight, 404 when null.
- [ ] Write failing app.request tests for JSON response, missing night and empty rows.
- [ ] Implement route without a separate aggregation or sort; compare rows with HTML during integration.
- [ ] Run tests and typecheck; commit scoped changes. Integrator resolves shared app.tsx edits.

### Task 5: E. Board — § 2c

**Files:** modify `src/status.ts`, `src/views/status.tsx`; create `test/digest-board.test.tsx`.
**Consumes:** readNight and nightsOnDisk; **Produces:** board links and valid-event ok/retry/fail counts.
- [ ] Write failing board tests for both real nights and temporary empty/bad-line nights.
- [ ] Extend Status with night summaries while retaining nights:string[] for compatibility; render each night as `/digest/<night>` link with named counts.
- [ ] Run suite/typecheck; commit scoped changes.

### Task 6: F. Route integration tests — § 2d

**Files:** create `test/digest-routes.test.tsx` (independent worker).
**Consumes:** integrated B–D routes.
- [ ] Use temporary runsDir; assert HTML/JSON 200 and same sorted jobs, 404, empty night, bad line, nullable owner, escaping, invalid path. Fixtures in runs/ remain untouched.
- [ ] Run `pnpm test` and `pnpm typecheck`, commit tests and report result.

### Task 7: G. Review preview — § 3

**Files:** exported HTML outside repository, no committed preview.
- [ ] Run rig locally with private .env; save GET `/digest/2026-10-28` using curl, checking sample data, banner, self-contained HTML and no scripts.
- [ ] Select a supported replaceable HTTPS host; obtain explicit human approval stating what/why/where/visibility/undo before publication.
- [ ] Publish and verify public HTML, then submit repo + preview to claim_challenge. Keep exact private receipts; do not close until review link is submitted.

### Task 8: H. Cleanup — § 4

**Files:** move root plan to `docs/plans/done/morning-digest.md`, add actual issue URLs.
- [ ] After reviewer requests cleanup, obtain explicit human approval before overwriting preview.
- [ ] Save with LANE_MARKER unset, overwrite same URL, verify `no marker set` and absence of original marker.
- [ ] Archive plan, commit/push, close issue with required done/worker/commit comment; resubmit identical repo + preview answer with receipts.
- [ ] Write course debrief only after accepted solve.
