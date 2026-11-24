# Ways of working

How work moves from an idea to the wall. The backlog is the private Azure DevOps project
[FamilyHub](https://rossgraham.visualstudio.com/FamilyHub); the code is here. It's private because ideas can carry family
details, and this repo is public, so issues aren't used.

Most work is done by Claude Code sessions, with Ross deciding what matters and merging. Three skills cover the work, and
`scripts/board.mjs` is how they read and update the board.

| Skill                | Picks up                                                                 | Leaves it in                                         |
| -------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `/refine-story [id]` | the top card in Idea, or the one given                                   | Refined, or still in Idea with what's left to answer |
| `/pickup [id]`       | the top card in Refined, or the one given; or a card sent back to Active | In review                                            |
| `/review-story [id]` | the card Ross names, only when he asks for a review                      | In review (approved) or Active (changes requested)   |

## The board

Epics hold Features, Features hold User Stories, and Bugs sit beside stories. Each column's description on the board
repeats its rule from here.

| Column    | State    | Means                                                                                       |
| --------- | -------- | ------------------------------------------------------------------------------------------- |
| Idea      | New      | Written down, nothing more                                                                  |
| Refined   | New      | Fully kitted and ready to implement: meets the Definition of Ready                          |
| Active    | Active   | Being built, on a branch                                                                    |
| In review | Resolved | A PR is open, waiting for or past review; or merged and waiting to be checked where it runs |
| Done      | Closed   | Merged and checked                                                                          |

## How a card moves

Every move by Claude posts a comment on the card saying why. A move without its comment didn't happen properly.

| Move               | Who                                | Only when                                                           | Comment                                                     |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- |
| Idea → Refined     | Ross, or `/refine-story`           | It meets the Definition of Ready                                    | **Refined**: what was decided, and anything Ross was asked  |
| Refined → Active   | `/pickup`                          | Fewer than 2 cards are Active                                       | **Started**: the branch, and its dev server's address       |
| Active → In review | `/pickup`                          | A PR is open with `AB#<id>`, CI is green and the evidence is posted | **Evidence** (below)                                        |
| In review → Active | `/review-story`                    | It requests changes                                                 | **Review** (below)                                          |
| Merge              | Ross only                          | CI is green, and the review is green if Ross asked for one          | —                                                           |
| In review → Done   | Ross, or `/pickup` after the merge | It's checked where it runs                                          | **Verified**: what was checked, where, and in which release |
| Refined → Idea     | Ross, or `/pickup`                 | It turns out not to be ready                                        | What's missing                                              |

A card that turns out not to be needed goes to Removed, with a comment saying why.

### Screenshots

Where a picture shows the problem better than words, it goes on the card with `board.mjs attach`:

- **A UI bug** gets a screenshot of what's wrong when it's raised, and one of it fixed in its evidence. A bug with no
  visible symptom, such as a crash in a log, doesn't need one.
- **A story that changes the screen** gets screenshots of the result in its evidence, in each theme it affects.
- They go on the card, not in the PR, because the board is private and a screenshot of the real Hub can show the
  Household's Events and names. PR screenshots use sample data only, as the screenshot tests do.
- From the Pi: `ssh hubadmin@familyhub.local` and a screenshot of the kiosk, or from a PC: the Playwright screenshot
  tests' images, or a browser at the same 1920×1080.

### Definition of Ready

Refining is the work of moving a card from Idea to Refined. There's no column for it: a card stays in Idea until it's
fully kitted, and anything left to answer goes in a comment on it. Refined means this is all true:

- The problem, and who it's for, are written down.
- Every acceptance criterion can be tested, and says how it will be checked: a unit test, an e2e test, a screenshot test,
  on the Pi, on the backend, or by hand. For example: "Settings shows Auto chosen by default. _Checked by: e2e test._"
- If the screen changes, there's a mockup or the card says why one isn't needed.
- It says whether an ADR is needed, and the ADR is part of the work if so.
- It fits in one PR. If it doesn't, it's split; a Feature is split into User Stories.
- Nothing it depends on is unfinished.

### Seeing it while it's built

No change is built blind. Ross sees and tries each card's work on the PC with the Hub's real setup, while it's built:

- A card that changes anything on the screen gets its own dev server when it's picked up. In its worktree,
  `node scripts/card-dev.mjs` (in `app/`) starts it at `http://localhost:<6000 + id>`, such as 6054 for AB#54, with the
  main checkout's `app/.env` and a copy of its `app/data`. The sign-ins, calendars and Nest are real, so trying a change
  does it for real. The Hub's own databases are a copy, so changes to Stars or Settings stay in it. `--fresh-data`
  copies them again.
- The address goes in the **Started** and **Evidence** comments, so Ross can try it before the review.
- Ross's own dev server, on 5173, shows what's merged: after each merge, `node scripts/card-dev.mjs --main` moves the
  main checkout to origin/main and restarts it. If anything in the main checkout is changed, or it's on a branch, it's
  left alone and the script says so.
- `node scripts/card-dev.mjs --stop` stops a card's dev server, before its worktree is removed.

The servers run on their own, so they outlive the session, and log to `app/data/dev-server.log`.

### Evidence

Posted by `/pickup` when it hands a card to review, and repeated in the PR description:

- the PR and its latest commit;
- **each acceptance criterion, with its proof**: the tests that cover it and their result, commands run and what they
  showed, screenshots, or what was checked by hand;
- **what wasn't checked, and why**, such as screenshot tests when Docker wasn't running, or anything that can only be
  checked on the Pi after release;
- whether the root README changed, and if not, why not;
- for a PR that only changes `docs/`, `design/`, `site/` or Markdown outside `app/`, that CI skipped its checks
  (they show as passed without running), in place of CI being green;
- for a change anyone can see on the screen, **screenshots** of it, and for a UI bug, of it fixed, and the address of
  its dev server.

Unverified is fine if it's said. Claiming something was checked when it wasn't is the one thing that isn't.

### Review

Reviews cost tokens, so they run only when Ross asks for one, on the PRs he chooses. Nothing starts one
automatically, and `/pickup` hands over without one. When he wants a PR reviewed, he runs
`node scripts/review-story.mjs <id>` (or asks a session to), which runs `/review-story` in a new, headless Claude Code
session that didn't write the code:

- It starts in a fresh worktree at the PR's latest commit, with no conversation behind it. It gets only the card number;
  it reads the card and the PR itself. The implementing session can't brief it.
- It can read code and run the checks CI runs, but it has no tools to edit files, commit or push. It's not a sandbox:
  running the PR's tests and `scripts/board.mjs` runs the PR's own code, which is reviewed with that in mind.
- It checks each acceptance criterion against the code and the evidence, re-runs the tests it needs rather than trusting
  the evidence, and looks for bugs.
- It posts a **Review** comment on the card and the PR: a verdict for each criterion (met, not met or unverified),
  findings with files and lines, and the commands it ran.
- It sets the `story-review` status on the commit it reviewed, never on whatever is latest when it finishes: green to
  approve, red for changes. `Protect main` doesn't require it, so it doesn't block a merge by itself; a red review means
  don't merge until it's addressed. It's a status rather than an approval because GitHub won't let Ross approve his own
  PRs.

Ross can also run `/review-story <id>` in a new terminal. Never in the session that wrote the code.

### After the merge

The card stays In review until it's checked where it runs: on the Pi for the Hub, which installs each release itself,
or on the backend after its deploy. Changes under `ansible/` reach the Pi only when the playbook is run; see
[Pi setup](runbooks/pi-setup.md). The **Verified** comment says what was checked and on which release, and the card
moves to Done. Something that only runs in CI or on a PC is Done at merge, saying so. Either way, Ross's dev server is
updated with `node scripts/card-dev.mjs --main`, and the card's is stopped before its worktree is removed.

## Commits and pull requests

- Branches are named `ab<id>-<short-name>`, such as `ab38-ways-of-working`.
- Every commit message and PR description mentions `AB#<id>`, which links them to the card. The PR description uses
  `Fixes AB#<id>` only if merging should close the card, which is only when nothing needs checking after the merge.
- Every PR updates the root README when what the Hub does changes.

## scripts/board.mjs

```
node scripts/board.mjs show <id>                 the card: fields, links and discussion
node scripts/board.mjs next <column> [type]      cards in a column, top priority first
node scripts/board.mjs move <id> <column>        Idea, Refined, Active, In review or Done
node scripts/board.mjs comment <id> < body.html  posts HTML from stdin to the card
node scripts/board.mjs attach <id> <file> [caption]  attaches a screenshot and shows it in a comment
node scripts/board.mjs columns [board]           each board's columns and their rules
node scripts/board.mjs status <commit> <success|failure|pending> <description>
```

It needs the Azure CLI with the `azure-devops` extension, signed in, and `gh`. `attach` also needs a personal access
token in `AZURE_DEVOPS_EXT_PAT`, as only the attachments API takes a file and the Azure CLI can only send JSON. Make one
in Azure DevOps under User settings → Personal access tokens, for the rossgraham organisation only, with **Work Items:
Read & write** and nothing else, then set it for your Windows user:

```
setx AZURE_DEVOPS_EXT_PAT <token>
```

Open a new terminal afterwards. It expires; make a new one when `attach` says it's refused.
