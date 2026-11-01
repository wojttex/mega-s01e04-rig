---
name: plan-to-issues
description: Use when a ready plan needs issues, when applying this repo's issue schema, or when outside review gates issue closure or preview clean-up.
---

# plan-to-issues

Turns `plan.md` into GitHub issues that workers can pick up cold. Easiest with `gh`, authenticated,
in a shell this agent can run.

## Steps

1. Read `plan.md`, `AGENTS.md` and `docs/adr/`.
2. Draft the split as a table: title · plan section · scope · done when · blocked by.
   One issue per unit of work. For outside review, include a review-wait issue that blocks
   clean-up; use the review gates below when defining dependencies and done conditions.
3. **Stop and show the table to the human.** Publish nothing until they approve it.
4. Ask the human what every issue here must carry (fields, labels, wording), unless it is
   already written down in this session or in the repo. The approved contract below is the
   current rule; obtain approval for changes to it before publishing issues.
5. Ensure the approved plan label exists, then create issues in dependency order so
   blocked-by can cite real numbers:

   ```sh
   gh issue create --title "<title>" --label "plan:<plan>" --body-file <tmp.md>
   ```

6. Record every issue URL from gh's output (not from memory) and reply with the list.

## Approved issue contract

Each issue has a specific title, the label `plan:<plan>` from the plan's `plan` frontmatter,
and this body. For the morning digest, the label is `plan:morning-digest`.
Use the actual section or subsection identifier, such as `1` or `2a`.

```md
Source: plan.md § <section>

## Scope
<The unit of work and its boundaries.>

## Done when
<Observable conditions that must all hold before closure.>

## Blocked by
<Actual issue numbers or URLs; write "None" when there are no dependencies.>

## Validation
<The tests, commands or external evidence that prove the done conditions.>
```

`Source` is the first body line. Use the same body and label in the file-backed tracker
(ADR 0004); its frontmatter precedes the body. Preserve the approved contract in this
shared skill rather than relying on a previous chat or copying it into other instructions.

## Outside review gates

Represent these as separate completion conditions, with evidence recorded on the relevant
issue. In a new split, publication, review waiting and clean-up are separate units of work.
The review-wait issue names the required result in Done when: a confirmed read for a
preview-read check, or approval when approval is required.

| Gate | Evidence | Issue state and dependencies |
| --- | --- | --- |
| Published | An unauthenticated fetch of the public link returns the intended preview. | Ready to submit; this alone does not finish submission or review. |
| Submitted | The recipient or service acknowledges receipt of the link. | A submission-only issue can close; the review-wait issue stays open. |
| Reviewed | The reviewer or service explicitly confirms the result required by Done when. A read receipt alone does not satisfy an approval requirement. | The review-wait issue can close, releasing its clean-up dependency. |
| Cleaned up | After the required human approval, the same public URL returns the replacement without the marker. | The clean-up issue can close after its validation passes. |

For an existing issue that combines publication and review, keep it open through submission
until the Reviewed condition holds. A plan saying "done when the link is sent" describes
submission only; add the review-wait dependency to the proposed split before publishing.
If the published tracker already lacks that dependency, make the missing review gate
explicit there before closing review work or starting clean-up, within the human's authorization.

An acknowledgement such as "accepted", "queued" or "will look in a few minutes" proves
Submitted only. While review is pending, leave the reviewed copy and marker unchanged,
keep the review issue open, and wait or check again at the service's stated interval.
Record an ambiguous response as pending; ask the human which required review result it
confirms. A review result unlocks only the clean-up dependency: obtain the required
separate approval before replacing the public preview.

## Closure

Close an issue after every Done when condition has evidence in Validation and all its
dependencies are satisfied. Use the closing comment from AGENTS.md:

```sh
gh issue close <n> -c "<closing comment>"
```

## No `gh`

Steps 1–4 hold either way. GitHub reachable another way (a connector, the REST API, the web UI):
the same issues, made that way. GitHub issues out of reach altogether: write them as files in
`docs/issues/`, format in ADR 0004, then commit and push.

## Don'ts

- Don't paste the whole plan into one issue, and don't keep issues only in chat.
- Don't invent sections the plan doesn't have. If the plan is unclear, ask.
