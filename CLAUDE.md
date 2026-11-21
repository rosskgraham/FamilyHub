# FamilyHub

A family wall screen: a SvelteKit app (`app/`) on a Raspberry Pi 5 kiosk (`ansible/`), with a Python backend
(`backend/`) and Azure infrastructure (`infra/`). Start with the root README, the glossary and `docs/adr/`.

## How work is done

Follow [docs/ways-of-working.md](docs/ways-of-working.md). In short:

- The backlog is the private Azure DevOps project FamilyHub. Read and update it with `scripts/board.mjs`.
- `/refine-story`, `/pickup` and `/review-story` are the skills for each stage. Use them.
- Branches are `ab<id>-<short-name>`. Every commit message and PR description mentions `AB#<id>`.
- Every move across the board gets a comment on the card with its evidence. Say what wasn't checked; never claim a check
  that didn't happen.
- Never review work this session wrote. Reviews run in a separate session through `scripts/review-story.mjs`.
- Never merge a PR, and never move a card to Done without checking the change where it runs.
- Every PR updates the root README when what the Hub does changes.
- The repo is public: Household members' names, and anything else private, never go in it. Only Ross's name may.
