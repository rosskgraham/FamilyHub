---
name: review-story
description: Independently review a FamilyHub card's PR against its acceptance criteria, re-running the tests, and post the verdict to the card, the PR and the story-review status. Only for a session that didn't write the code; normally started by scripts/review-story.mjs. Use when Ross asks to review a card or the next card in review.
argument-hint: '[work item id] [PR number]'
disable-model-invocation: true
---

# Review a story

You're the independent reviewer described in [docs/ways-of-working.md](../../../docs/ways-of-working.md). Your job is
to find out whether the PR really does what the card says, not to agree with the evidence. Trust nothing you haven't
checked yourself.

**If this session wrote or edited any of this PR's code, stop now** and say the review has to run in a new session:
`node scripts/review-story.mjs <id>`.

## 1. Find the work

- With an id in `$ARGUMENTS`, use it; a second number is the PR.
- Without one, `node scripts/board.mjs next "In review"` and take the first card whose open PR has no `story-review`
  status on its latest commit (`gh pr checks <pr>`).
- Read the card: `node scripts/board.mjs show <id>`: the acceptance criteria, the parent, and the Evidence comment.
- Find the PR: `gh pr list --search "AB#<id>" --state open`, and read it with `gh pr view <pr>` and `gh pr diff <pr>`.
- Check the code you're reading is the PR's latest commit: `git rev-parse HEAD` matches `headRefOid` from
  `gh pr view <pr> --json headRefOid`. `scripts/review-story.mjs` sets this up. If you were started some other way and
  it doesn't match, stop and ask Ross to run the script instead; never check out over someone's working copy.

## 2. Check it

For **each acceptance criterion**, decide **met**, **not met** or **unverified**:

- Read the code that does it. Does it do what the criterion says, including edge cases?
- Find the test the card says covers it. Does that test actually check the criterion, or only something near it?
- Re-run the tests that matter yourself. In `app/`: `npm test`, `npm run check`, `npm run lint`, and
  `npx playwright test` (skip the screenshot tests, which need Docker: `--grep-invert "view"` or by file). In
  `backend/`: `uv run pytest`, `uv run ruff check`. For `infra/`: `az bicep build`.
- For a criterion about the board itself: `node scripts/board.mjs columns` and `show`.
- A criterion that can only be checked on the Pi or by hand is **unverified** unless the evidence shows it was, and is
  fine to approve if the card says it waits for after the merge.

Then look for problems beyond the criteria:

- bugs: wrong logic, missed cases, races, error handling, things that break on Windows or on the Pi;
- anything the evidence claims that you couldn't reproduce;
- the root README not updated when what the Hub does changed; missing glossary entries or ADRs the card asked for;
- a UI change or UI bug fix without screenshots on the card;
- Household members' names or other private details in the repo (it's public);
- scope creep: changes the card didn't ask for.

Grade each finding **blocking** (a criterion isn't met, a bug, a false claim, private data) or **minor** (worth fixing,
not worth holding the merge).

## 3. Post the verdict

**Approve** only if every criterion is met or acceptably unverified, and nothing is blocking. Otherwise **request
changes**.

1. A **Review** comment on the card, as HTML on stdin to `node scripts/board.mjs comment <id>`:
   the verdict and the commit reviewed; a table of each criterion with met / not met / unverified and why; findings
   with file and line, blocking first; the commands you ran and their results.
2. The same on the PR, in Markdown: `gh pr comment <pr> --body-file -` with the text on stdin.
3. The status, on the commit you reviewed (from `git rev-parse HEAD`), never looked up again from the PR:
   `node scripts/board.mjs status <commit> success "Approved: <one line>"`, or
   `node scripts/board.mjs status <commit> failure "Changes requested: <one line>"`.
4. If you requested changes: `node scripts/board.mjs move <id> Active`.

End with the verdict in two or three lines. Never edit, commit, push or merge anything.
