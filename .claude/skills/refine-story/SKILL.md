---
name: refine-story
description: Refine a FamilyHub card from Idea or Refining until it meets the Definition of Ready, working it out with Ross. Use when Ross asks to refine, plan or work out a card, an idea or the next thing in the backlog.
argument-hint: '[work item id]'
---

# Refine a story

Follow [docs/ways-of-working.md](../../../docs/ways-of-working.md); it's the source of truth for the board and the
Definition of Ready. Refining is a conversation with Ross: he decides, you research, propose and write it down.

## 1. Pick the card

- With an id (`$ARGUMENTS`), use it.
- Without one, run `node scripts/board.mjs next Refining`, then `next Idea`, and offer the top few. Ask which, unless
  there's only one.
- Read it: `node scripts/board.mjs show <id>`. Read its parent too, and anything it links (ADRs, design notes, mockups).
- If it's in Idea, move it: `node scripts/board.mjs move <id> Refining`.

## 2. Work it out

- Read the code and docs it touches before asking anything you could find out yourself.
- Ask Ross only what's his to decide: scope, behaviour, trade-offs. Ask a few questions at a time, each with a
  recommendation. Use AskUserQuestion when there are clear options.
- Check it against the Definition of Ready, one point at a time:
  - the problem and who it's for;
  - acceptance criteria that can each be tested, each ending "_Checked by:_ unit test / e2e test / screenshot test /
    on the Pi / on the backend / by hand";
  - a mockup if the screen changes (under `design/mockups/`), or why not;
  - whether an ADR is needed;
  - one PR's worth, or split it;
  - nothing it depends on unfinished.
- **A Feature** is refined into User Stories: create each as a child, using the same approach, and refine the first ones
  to Ready. The Feature itself is Ready when its first stories are.
- **A UI bug** needs a screenshot of the problem on the card (`node scripts/board.mjs attach <id> <file> "<caption>"`)
  unless it has no visible symptom.

## 3. Write it on the card

Write the fields as HTML on stdin, with a quoted heredoc so nothing in it is expanded:

```
node scripts/board.mjs set <id> description <<'EOF'
<h3>Problem</h3><p>…</p>
EOF
```

- **description**: Problem, Goals, Non-goals, Decided, Open questions, Links, as `<h3>` headings.
- **acceptance**: a `<ul>` of criteria, each ending with how it's checked.
- **title**: if refining changed what it is.

A child story: `node scripts/board.mjs create "User Story" "<title>" <parent id>` with its description on stdin, then
`set <new id> acceptance`.

## 4. Move it on

- If it meets the Definition of Ready: post a **Refined** comment (what was decided, what Ross answered, what was left
  out and why) with `node scripts/board.mjs comment <id>` reading HTML from stdin, then
  `node scripts/board.mjs move <id> Ready`.
- If not: leave it in Refining and post a comment listing what's still open and who has to answer it.

Tell Ross where it ended up, in a few lines, with the card's link:
`https://rossgraham.visualstudio.com/FamilyHub/_workitems/edit/<id>`.

Never put Household members' names in the repo. The board is private, but keep them off it too unless Ross does.
