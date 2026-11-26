# Games: design notes

A design with the main choices made. No code yet. Mockups: [`canvas.json`](canvas.json) and the `.dc.html` files here, published at https://claude.ai/artifact/4GW8Jr17Wm9SyhrWWu6hnB.

## Decided (24 November 2026)

- **Everyone plays their own game** (boards A–C), not one family board (board D).
- **Streaks, but no Chores Stars.** Finishing a game, solved or not, keeps a Member's streak going, so a hard word never breaks it. A day with no finished game ends it. Games earn no Stars, so they never feel like a chore.
- **A new word at midnight**, the same as the Chores' daily reset. A day's word belongs to that date.
- **The word lists come from [SCOWL](http://wordlist.aspell.net/)** (Spell Checker Oriented Word Lists). See [Where the words come from](#where-the-words-come-from).
- **At the wall only**, not in the family app on phones.
- **The answer list is kept in plain text.** It's visible in the public repo, and that's fine.
- **Rude words stay in the allowed guesses.** They never show unless someone types one, and they're never answers.
- **Members are drawn in their real Household colours.** The mockups give Ross magenta and Sam brown, which aren't Hub colours. The build uses each Member's own colour, so in the sample Household Ross is blue and Sam is orange, the same as the "right place" and "in the word" tiles. That's accepted, and the mockups aren't redrawn: Members only appear as round badges and tinted cards, and results are square tiles with letters.
- **Results and streaks are kept in the Hub's SQLite database**, as Chores are ([ADR 0006](../../../docs/adr/0006-hub-owned-data-in-sqlite.md)).

## The idea

The children love Wordle. A Games Section gives the Hub games the family can play at the wall, starting with **Word of the day**: one five-letter word a day, six goes to find it. Each go colours its letters: the right letter in the right place, a letter that's in the word somewhere else, or a letter that isn't in the word.

It is our own game in the same genre, not a copy of Wordle. It has its own name and its own colours: blue for the right place and orange for in the word. Blue and orange also differ in lightness, so they can be told apart by anyone colourblind.

## How it works at the wall

- **A new tab, Games**, in the bottom bar, after Energy. It lists the games, with one so far (board A).
- **Everyone gets the same word each day**, with a new word at midnight.
- **Who's playing (board A):** a card for each Member says whether they've played today, their result, and their streak once it's two days or more. A tap on your card starts your game, or carries on one you've already started.
- **Playing (board B):** big 104px tiles, and a big on-screen keyboard that colours the letters already tried. A key to the three colours sits above the keyboard for children still learning the game. **Stop for now** leaves the game to come back to.
- **Solved (board C):** "You got it!" with a burst of stars, the number of goes, the streak and how the rest of the family has done today. The word shows while the celebration is open, which is only for the player who just finished. It closes by itself, as the Chores celebration does, and the word is hidden again.
- **No spoilers.** The screen is in the kitchen, where everyone can see it. A finished game shows only its colours, and the celebration hides the word again when it closes.

## Where the words come from

Two lists, both kept in the app:

1. **Answers:** common five-letter words the children will know (PLANT, BEACH, TIGER), enough for a year or two. They start from SCOWL's most common words, and a grown-up reads through them once to take out anything unsuitable or obscure.
2. **Allowed guesses:** a much bigger list of five-letter words from SCOWL's larger sizes, used only to check that a guess is a real word.

Why SCOWL:

- It's open. Ross has read and accepted [its licence](https://github.com/en-wl/wordlist/blob/v2/Copyright) (24 November 2026). Its copyright notice is kept beside the lists.
- It ranks words by size, from common to rare, which gives both lists from one source.
- It has British spellings, which suits a UK Household.

SCOWL comes as a SQLite database. The Hub doesn't ship it, and never reads it when running. Instead:

- **A script in the repo derives the five-letter lists from it.** It leaves out capitalised words (names and places), words with apostrophes or accents, and abbreviations, and it keeps both British and American spellings.
- **Allowed guesses are fully generated:** every five-letter word up to one of SCOWL's larger sizes, so re-running the script recreates the file exactly.
- **Answers start as candidates** from SCOWL's most common sizes, and are then edited by hand. The script never overwrites the answer file. A re-run only reports new candidates, so the hand edits survive.
- **What's committed:** the two word files, the script and SCOWL's copyright notice, not the database.
- **What was used (AB#67):** SCOWL's v2 branch at commit 1e5b7d3 (24 June 2026), through its `scowl_v0` view. The script is `app/scripts/word-lists.mjs`, and the lists and the copyright notice are in `app/src/lib/server/games/words/`.
  - **Allowed guesses (7,051 words):** SCOWL sizes up to 70 (its large spellchecker dictionary), in every dialect, American and British. Size 80 and above adds mostly obscure words.
  - **Answer candidates (1,914 words):** SCOWL's smallest size, 35 (it has nothing smaller). Only a word's own form, so no plurals or tenses, in British spelling, not regional to anywhere but Britain (no Australian slang), and with no usage note such as vulgar, offensive or informal.
  - **Answers (1,461 words, about four years):** the candidates with obscure, adult and gloomy words taken out by hand, such as abhor, death and fetid.
  - Every list leaves out Roman numerals, programmers' slang, abbreviations, non-words and SCOWL's rarer spelling variants.

Not chosen: the New York Times' own Wordle lists. They're widely copied, but they're the NYT's work, and their answers are in American English.

**Today's word is worked out from the date:** the Hub steps through the answer list in a fixed, shuffled order. Everyone gets the same word, it works offline, and it needs no server or API.

## Two layouts

**A–C · Everyone plays their own game (chosen).** Each Member has their own board and their own result.
- Everyone gets to play, at whatever time suits them.
- Streaks and results are per person, kept kind: no league table.

**D · One family board, taking turns (not chosen).** One board for the day. Each go starts by tapping whose go it is, and that person's badge sits beside their guess.
- A game to play together, perhaps at the weekend or after dinner.
- Only six goes between everyone, so a keen child can use them all up before anyone else gets a turn.

## Proposed glossary terms

- **Game**: something to play in the Games Section.
- **Word of the day**: the daily five-letter word game. *Avoid: Wordle.*
- **Go**: one guess at the word.

## Still open

Nothing. The work is split into AB#67 (word lists), AB#68 (playing) and AB#69 (the celebration and streaks).

# Number of the day

The second game (Feature AB#89), designed on 26 November 2026. Boards E–H are on the same canvas.

## Decided (26 November 2026)

- **Our own game in the numbers-game genre**, with its own name and look, not a copy of Countdown. _Avoid:_ Countdown.
- **No clock.** Stop for now, and carry on later, as with Word of the day.
- **The same six numbers and target for everyone**, worked out from the date, with new numbers at midnight. The target is from 101 to 999, and can always be reached exactly (AB#90).
- **The same target for children too.** There's no easier level.
- **Finishing:** make the target, or choose Finish with… to settle on your closest. Either keeps the streak going. Cards show "Got it" or "N away", never the working.
- **One way to reach it**, the solver's, is shown in both endings, to the player who just finished, and only until the celebration closes. It's shown even when it's the same as the player's own.
- **Its own streak, and no Stars**, with the same rules as Word of the day.
- **The Games tab opens on the last game chosen**, which goes back to Word of the day at midnight.

## How it works at the wall

- **Choosing the game (board E):** the Games list has Word of the day and Number of the day. The chosen one is outlined, and "Who's playing?" shows each Member's card for it.
- **Playing (board F):** a big target, then the numbers left as tiles. Tap a number, a sign, then another number. The two numbers go, the answer joins the end of the row, and the step is listed. Tapping a chosen number again puts it down. The bar under the numbers shows the step being made. "Closest so far" shows the nearest number on the board.
- **A step that isn't allowed** changes nothing, and the bar says why: "That gives a fraction", "That would be less than nothing" or "That gives zero".
- **Undo** takes back the last step, and **Start again** goes back to the six numbers.
- **Finish with…** asks "Which number are you finishing with?", and the tiles become the choices.
- **Got it (board G):** the player's steps beside one way to do it, and the same celebration as Word of the day: the chime, a burst of stars and the family's results.
- **N away (board H):** the same layout without the stars, saying how close it was, with "Next time!".

## Proposed glossary terms

Number of the day, Target and Step, added with AB#90.

## Still open

Nothing. The work is split into AB#90 (the draw and solver, done), AB#91 (playing) and AB#92 (the endings and streak).
