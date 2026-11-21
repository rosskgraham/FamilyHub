---
name: pickup
description: Pick up a Ready FamilyHub card (or one sent back from review, or one merged and waiting to be checked), implement it on a branch, post the evidence on the card, open the PR and start the independent review. Use when Ross asks to pick up, start, build or implement the next card or a given one.
argument-hint: '[work item id]'
---

# Pick up a card

Follow [docs/ways-of-working.md](../../../docs/ways-of-working.md); it's the source of truth. You implement; another
session reviews. Never review your own work, and never merge.

## 1. Pick the card

- With an id (`$ARGUMENTS`), use it and read it: `node scripts/board.mjs show <id>`.
  - **In Active with a Review comment asking for changes**: address every finding, then carry on from step 4.
  - **In review, and its PR is merged**: go to step 7.
  - **In review, PR open**: it's waiting for review; say so and stop.
- Without one, run `node scripts/board.mjs next Active` for cards sent back from review first, then
  `node scripts/board.mjs next Ready`. Offer the top one.
- Check it meets the Definition of Ready. If it doesn't, stop and suggest `/refine-story <id>`.
- Check the WIP limit: `node scripts/board.mjs next Active` shows fewer than 2 cards (not counting this one if it was
  sent back). If it's full, say which cards are holding it and stop.

## 2. Start

- Make a worktree from the latest main, so Ross's own checkout is untouched:
  `git fetch origin && git worktree add -b ab<id>-<short-name> .claude/worktrees/ab<id> origin/main`, and work there.
- `node scripts/board.mjs move <id> Active`, then post a **Started** comment (branch, and the plan in a few lines) with
  `node scripts/board.mjs comment <id>` reading HTML from stdin.

## 3. Build

- Work through the acceptance criteria. Each says how it's checked; write or update that test as you go.
- Run what CI runs for the parts you touched: in `app/`, `npm test`, `npm run check` and `npm run lint`, and the e2e
  tests with `npx playwright test`; screenshot tests only through `npm run test:screenshots` (needs Docker). In
  `backend/`, `uv run pytest` and `uv run ruff check`. For `infra/`, `az bicep build`.
- Update the root README if what the Hub does changes, the glossary for new terms, and an ADR if the card says one is
  needed.
- Screenshots: if anyone can see the change, take them (in each theme it affects) for the evidence. For a UI bug, show
  it fixed. Use sample data for anything going in the PR.
- Anything the card didn't foresee that's Ross's to decide: ask. Anything out of scope: create a new card in Idea with
  `node scripts/board.mjs create`, rather than doing it.

## 4. Open the PR

- Commit with `AB#<id>` in every message (and the attribution lines from the session's instructions), push, and open
  the PR with `gh pr create`. Its description has `AB#<id>`, what changed and why, and the evidence (step 5). Use
  `Fixes AB#<id>` only if nothing needs checking after the merge.
- Wait for CI: `gh pr checks <pr> --watch`. Fix anything red before handing over.

## 5. Post the evidence

Post an **Evidence** comment on the card (HTML on stdin to `node scripts/board.mjs comment <id>`):

- the PR link and its latest commit;
- a table of each acceptance criterion and its proof: test names and results, commands and what they showed, what was
  checked by hand;
- **what wasn't checked, and why**;
- whether the README changed, and why or why not.

Attach screenshots with `node scripts/board.mjs attach <id> <file> "<caption>"`. Never claim a check that didn't happen.

## 6. Hand over to review

- `node scripts/board.mjs move <id> "In review"`.
- Start the reviewer in the background: `node scripts/review-story.mjs <id>`. Pass nothing else: it reads the card and
  the PR itself, so nothing you say can steer it.
- When it finishes, report its verdict to Ross. If it asked for changes, the card is back in Active: offer to address
  them (step 1).

## 7. After the merge

- Check the change where it runs. The Pi installs each Hub release itself; check `/api/health` reports the release
  (`ssh hubadmin@familyhub.local curl -s localhost:3000/api/health`) and look at the change. Changes under `ansible/`
  need Ross to run the playbook first. Backend changes: after the pipeline's deploy.
- Post a **Verified** comment (what was checked, where, which release, screenshots if visible) and
  `node scripts/board.mjs move <id> Done`.
- If it can't be checked yet, say what's waiting and leave it in review.
- Remove the worktree: `git worktree remove .claude/worktrees/ab<id>`.
