# Spec: Onboarding Tour | Spec ID: SPEC-02 | Status: approved
Supersedes: —
Lesson: L05 · Packages: server, client · Designs: `designs/onboarding-tour/`

## Проблема й навіщо
A developer who opens an unfamiliar repository in DevDigest gets no orientation. They see
PRs, Project Context documents and the "Indexed" badge, but nothing tells them how the code
is put together, which files matter, how to start it, or what to read first. They piece this
together by hand from the README and by clicking through files, and nothing tells them how
far to trust what they found. After this feature, one action gives them a five-part tour of
the repo. The facts and the reading order are computed from the index, the narrative comes
from one LLM call, and when the index or the LLM falls short the page still shows a
deterministic skeleton with a plain statement of what is missing.

## Goals / Non-goals
- Goal: a tour page for the active repo shows five sections in a fixed order: Architecture
  overview, Critical paths, How to run locally, Guided reading path, First tasks.
- Goal: the facts the tour is built from (stack, structure, HTTP routes, package scripts,
  ranked files, critical dependency chains, README) are collected deterministically from
  repo-intel and the local clone, with no LLM call.
- Goal: the Guided reading path order is computed from the import-graph rank (PageRank), not
  chosen by the model.
- Goal: one generation makes at most one structured LLM call, which turns the facts into the
  five sections. The call count, tokens and cost of each generation are logged.
- Goal: if the index is degraded, no LLM key is configured or the LLM call fails, the page
  shows a deterministic skeleton tour and says plainly why.
- Goal: one tour per repo is stored, for the default branch. It shows the commit it
  describes, says when it is stale, and is only (re)generated when the user asks.
- Goal: every file path the tour links to exists in the repo at the tour's commit.
- Non-goal: "Share link" from `designs/onboarding-tour/01-onboarding-tour-top.png`. DevDigest
  is local-first with one user on one machine, so there is no one to share with and no
  public URL.
- Non-goal: hotness (git churn) in the reading-path rank. The clone is shallow, so repo-intel
  stores hotness = 0 and the rank is PageRank alone. The brief's "PageRank × (1 + hotness)"
  reduces to that for now.
- Non-goal: Project Context (SPEC-01, `specs/L05-project-context.md`). The tour does not
  read or change agent/skill document attachments, and it isn't injected into review prompts.
- Non-goal: PR Brief card (L05, a separate feature).
- Non-goal: changing the add-repository page at `/onboarding`. It keeps its URL and behaviour.
  Only the sidebar highlight conflict is fixed (AC-2).
- Non-goal: tours per branch, per PR or per commit history, and generating a tour
  automatically (on import, on resync or on a schedule).
- Non-goal: a tour built without a local clone (e.g. from the GitHub API).
- Non-goal: indexing languages other than those repo-intel already indexes (JS/TS). Other
  repos get the behaviour of AC-39.
- Non-goal: automatic retries of the LLM call. Regenerate is the retry.
- Non-goal: an in-app source file viewer.
- Non-goal: editing the tour text by hand.
- Non-goal: a devdigest-mcp tool that returns or generates the tour.
- Non-goal: writing the tour into the repo folder. The "Sync generated docs to a folder"
  setting string exists in the client, but this lesson doesn't make it do anything.
- Non-goal: the CI runner (agent-runner arrives in L06).

## User stories
- US-1: As a developer new to a repo, I want a five-part tour of it in DevDigest, so that I
  understand its architecture, how to run it and where to start without reading every file.
- US-2: As a developer new to a repo, I want the reading order computed from how files depend
  on each other, so that I read the foundational files first and the order doesn't depend on
  the model's opinion.
- US-3: As a developer, I want the tour to say plainly when it is a skeleton, built from a
  partial index or older than the code, so that I know how far to trust it.
- US-4: As the repo owner, I want to regenerate the tour when the code changes, so that it
  stays current, and I want no regeneration I didn't ask for, so that I don't pay for it.
- US-5: As the user paying for LLM calls, I want every generation to make at most one LLM
  call and log its count and cost, so that I can check what the tour cost.

## Acceptance criteria (EARS)
### Page and navigation
- AC-1 (US-1): The sidebar SHALL show an "Onboarding Tour" item in the WORKSPACE group,
  between Pull Requests and Project Context, that opens `/repos/<active repo id>/tour`.
- AC-2 (US-1): WHILE the add-repository page is open, the sidebar SHALL NOT mark
  "Onboarding Tour" as the active item.
- AC-3 (US-1): IF no repo is imported or selected, THEN the tour page SHALL show a message
  asking the user to import or select a repo, in place of the tour.
- AC-4 (US-1): WHILE the stored tour is loading, the tour page SHALL show a loading state
  instead of the empty state.
- AC-5 (US-1): IF the repo has no stored tour, THEN the tour page SHALL show an empty state
  that names the five sections of AC-6 and offers a Generate action.
- AC-6 (US-1): The tour page SHALL show the sections in this order: Architecture overview,
  Critical paths, How to run locally, Guided reading path, First tasks.
- AC-7 (US-1): The tour page SHALL show an "On this page" list with one entry per section
  of AC-6.
- AC-8 (US-1): WHEN the user activates an "On this page" entry, the tour page SHALL scroll
  to that section and move keyboard focus to its heading.
- AC-9 (US-1): Each section SHALL have a collapse control that is reachable by keyboard and
  exposes its expanded or collapsed state to assistive technology.
- AC-10 (US-1): IF loading the stored tour fails, THEN the tour page SHALL show an error state
  with a Retry action.
- AC-11 (US-3): The tour page header SHALL show the number of source files in the index the
  tour was built from, the short SHA of the commit the tour describes, and the time it was
  generated.

### Generation
- AC-12 (US-1): WHEN the user activates Generate or Regenerate, the server SHALL start one
  generation for the repo in the background and answer the request before the generation
  finishes.
- AC-13 (US-1): WHILE a generation for the repo is running, the tour page SHALL show a
  "Generating…" state and disable Generate and Regenerate.
- AC-14 (US-1): IF a generation request arrives while a generation for the same repo is
  already running, THEN the server SHALL reject it without starting a second generation.
- AC-15 (US-4): WHILE a regeneration is running, the tour page SHALL keep showing the
  previously stored tour.
- AC-16 (US-4): WHEN a generation produces an LLM-written tour, or a skeleton tour while the
  repo has no stored LLM-written tour, the server SHALL store it as the repo's only current
  tour, replacing the previous one.
- AC-77 (US-4): IF a regeneration produces a skeleton tour while the repo has a stored
  LLM-written tour, THEN the server SHALL keep the stored LLM-written tour.
- AC-78 (US-3): WHILE the repo's last regeneration ended as in AC-77, the tour page SHALL show
  "Last regeneration failed: <reason>" above the kept tour, with a reason from AC-46.
- AC-17 (US-1): WHEN a generation finishes while the user is on another page, the tour page
  SHALL show the new tour the next time it is opened, without starting another generation.
- AC-18 (US-1): IF a generation is still marked running 15 minutes after it started (for
  example after a server restart), THEN the server SHALL report it as interrupted.
- AC-19 (US-1): WHILE the latest generation is reported interrupted, the server SHALL accept
  a new generation request for that repo.
- AC-20 (US-5): IF the LLM call gets no answer within 120 seconds, THEN the server SHALL
  build the deterministic skeleton tour as the generation's result, with the reason
  "LLM timed out".
- AC-21 (US-5): IF an LLM answer arrives after its generation has already finished (timeout,
  interruption or a newer generation), THEN the server SHALL NOT store it.
- AC-22 (US-4): WHEN the repo is removed, the server SHALL delete its stored tour.
- AC-23 (US-4): IF the repo is removed while a generation is running, THEN the server SHALL
  NOT store that generation's result.

### Deterministic facts and ranking
- AC-24 (US-1): WHEN a generation starts, the server SHALL collect the repo's facts (detected
  stack, top-level structure, HTTP routes, package scripts, lockfile, compose services,
  presence of `.env.example`, ranked files, critical dependency chains, repo map and README)
  from repo-intel and the local clone without any LLM call.
- AC-25 (US-2): The server SHALL order the Guided reading path by the repo-intel file rank
  (PageRank over the import graph), highest first.
- AC-89 (US-2): The Guided reading path section SHALL say that its order comes from
  import-graph importance.
- AC-26 (US-2): The server SHALL leave tests, configs, type declaration files, migrations and
  generated folders out of the Guided reading path.
- AC-27 (US-2): The Guided reading path SHALL list at most 10 files.
- AC-28 (US-2): The server SHALL keep the reading-path files and their order as computed in
  AC-25–AC-27, whatever the LLM output says.
- AC-29 (US-1): The Critical paths section SHALL list at most 5 entries, each showing the
  root file of one repo-intel critical dependency chain with the rest of that chain
  ("→ a.ts → b.ts") as secondary text.
- AC-70 (US-1): The Critical paths section SHALL show for each entry the number of indexed
  files that import its root file, computed from the index.
- AC-76 (US-1): WHERE the shown tour is LLM-written, the Critical paths section SHALL show
  the LLM's one-line description for each entry.
- AC-30 (US-1): IF repo-intel finds no dependency chain for the repo, THEN the Critical paths
  section SHALL say that no import chains were found and list no entries.

### The one LLM call
- AC-31 (US-5): WHERE an LLM key for the provider chosen for "Onboarding Tour" in Settings →
  Feature Models is configured, the server SHALL make exactly one LLM call per generation,
  using that provider and model.
- AC-88 (US-5): IF the LLM call fails, THEN the server SHALL NOT retry it within the same
  generation.
- AC-32 (US-5): The server SHALL NOT make an LLM call when the tour page is opened, reloaded
  or polled.
- AC-33 (US-5): The server SHALL limit the LLM input of one generation to 12,000 tokens,
  cutting the lowest-ranked facts first.
- AC-85 (US-5): The server SHALL send at most the first 4,000 characters of the README to
  the LLM.
- AC-87 (US-5): The server SHALL limit the LLM output of one generation to 4,000 tokens.
- AC-34 (US-5): WHEN a generation finishes, the server SHALL write one log line with the repo,
  the number of LLM calls made (0 or 1), the model, input tokens, output tokens and cost in USD.
- AC-35 (US-5): The server SHALL store the model, input tokens, output tokens and cost in USD
  with each tour.
- AC-36 (US-1): WHEN the LLM output passes validation, the tour page SHALL show each
  section's narrative text from that output.
- AC-37 (US-1): WHERE the LLM output contains a diagram for the Architecture overview, the
  tour page SHALL render it as a diagram.
- AC-38 (US-1): IF the Architecture overview diagram fails to render, THEN the tour page SHALL
  show the section's text without the diagram and without an error block.
- AC-90 (US-1): The First tasks section SHALL show the LLM-written Markdown text for that
  section, with file links subject to AC-57 and AC-79.
- AC-91 (US-1): The server SHALL ask the LLM to write the tour text in English.

### Skeleton fallback and honest status
- AC-39 (US-3): IF the repo's clone holds no file of a language repo-intel indexes, THEN the
  server SHALL make the LLM call over the tree, manifests and README with an empty reading
  path and no critical paths, whatever the index status (this takes precedence over AC-75).
- AC-40 (US-3): WHILE the shown tour was built as in AC-39, the tour page SHALL say that the
  repo's languages are not indexed and that the reading path and critical paths are
  therefore empty.
- AC-41 (US-3): IF no LLM key is configured for the "Onboarding Tour" provider, THEN the
  server SHALL build the deterministic skeleton tour, with zero LLM calls, as the
  generation's result.
- AC-42 (US-3): IF the LLM call fails, THEN the server SHALL build the deterministic skeleton
  tour as the generation's result.
- AC-43 (US-3): IF the LLM output does not match the tour structure, THEN the server SHALL
  build the deterministic skeleton tour for all five sections as the generation's result.
- AC-44 (US-3): IF the repo's index is partial when a generation starts, THEN the server
  SHALL make the LLM call over the facts the partial index provides.
- AC-75 (US-3): IF the repo's index is degraded, failed or switched off when a generation
  starts, THEN the server SHALL build the deterministic skeleton tour, with zero LLM calls,
  as the generation's result.
- AC-68 (US-3): The server SHALL store with each tour the index status and reason it was
  built from.
- AC-45 (US-3): The deterministic skeleton tour SHALL contain: for Architecture overview, the
  detected stack and the top-level folders with their indexed file counts; for Critical paths,
  the entries of AC-29 and AC-70 without descriptions; for How to run locally, the steps of
  AC-81; for Guided reading path, the files of AC-25–AC-27 without reasons; for First tasks, a
  note that tasks need the LLM.
- AC-46 (US-3): WHILE the shown tour is a skeleton, the tour page SHALL show a status banner
  that names the reason: no LLM key, LLM error, LLM timed out, invalid LLM output, or index
  degraded, failed or switched off.
- AC-47 (US-3): WHILE the shown tour was built from a partial index, the tour page SHALL show
  a status banner that names the index status and its reason.
- AC-48 (US-3): IF the skeleton reason is a missing LLM key, THEN the status banner SHALL
  link to the Settings section where keys are added.
- AC-49 (US-3): The server SHALL pass provider error text through secret redaction before it
  is stored, logged or shown.
- AC-50 (US-3): The tour page SHALL keep showing a stored tour's skeleton or index status until
  a later generation replaces that tour, including across server restarts and repo resyncs.

### Clone and index states
- AC-51 (US-3): IF the repo has no local clone, THEN the server SHALL refuse to start a
  generation and say that the clone is not ready.
- AC-84 (US-3): WHILE the repo has no local clone, the tour page SHALL offer the existing
  Resync action in place of Generate.
- AC-52 (US-3): WHILE the repo's clone or index job is running, the tour page SHALL disable
  Generate and say that indexing is in progress.
- AC-53 (US-3): IF the index left source files out (over the 5,000-file or 400 KB-per-file
  limit), THEN the tour page header SHALL show "N of M source files indexed".

### Staleness and regeneration
- AC-54 (US-4): The server SHALL store with each tour the commit the repo's index was at when
  the generation started.
- AC-55 (US-4): IF the repo's index is at a different commit than the shown tour, THEN the
  tour page SHALL show a "Stale" notice with both short SHAs and a Regenerate action.
- AC-56 (US-4): The server SHALL NOT start a generation without an explicit user action.

### Grounding and untrusted content
- AC-57 (US-1): The server SHALL remove from the LLM output every file link and every
  reading-path or critical-path entry whose path is not a file in the repo at the tour's
  commit.
- AC-79 (US-1): The tour page SHALL show a file path in section text as a link only when the
  path passed AC-57, and as plain code otherwise.
- AC-80 (US-3): IF removing ungrounded items leaves a section without content, THEN the
  server SHALL use that section's deterministic skeleton (AC-45) in its place.
- AC-58 (US-3): IF the server removed ungrounded items from the LLM output, THEN the tour page
  SHALL show how many were removed.
- AC-59 (US-1): The server SHALL send repo-authored text (README, manifests, paths, symbol
  names, route strings, script strings) to the LLM only as untrusted data behind
  `INJECTION_GUARD`.
- AC-60 (US-1): The tour page SHALL render tour text as Markdown without executing any HTML
  or script it contains.
- AC-61 (US-1): The tour page SHALL render diagrams with script execution and HTML labels
  disabled.
- AC-62 (US-1): The server SHALL keep an LLM-proposed run step only if its program is the
  repo's package manager, `node`, `npx`, `docker compose`, `make` or `cp`.
- AC-83 (US-1): The server SHALL keep an LLM-proposed run step only if every package script
  and file it names exists in the repo at the tour's commit.
- AC-81 (US-1): The server SHALL build deterministic run steps from the facts: install with
  the package manager of the lockfile, copy `.env.example` to `.env` when `.env.example`
  exists, `docker compose up -d` when a compose file exists, and run the `dev` or else the
  `start` script when one exists.
- AC-82 (US-1): IF every LLM-proposed run step was removed by AC-62 or AC-83, THEN the How to
  run locally section SHALL show the deterministic steps of AC-81.

### Actions on items
- AC-63 (US-1): WHEN the user activates a run step's copy control, the tour page SHALL copy
  exactly that step's command text to the clipboard.
- AC-64 (US-1): WHEN a command is copied, the tour page SHALL announce "Copied" to assistive
  technology.
- AC-65 (US-1): The tour page SHALL show critical-path and reading-path files as path text
  without an "Open" action.
- AC-66 (US-1): Every icon-only control on the tour page SHALL have an accessible name that
  contains the file path or the command it acts on.
- AC-67 (US-1): IF a file path doesn't fit its row, THEN the tour page SHALL shorten it in the
  middle with an ellipsis and keep the full path in the accessible name and a tooltip.

## Edge cases
- EC-1: The repo has more source files than the index limit (5,000), e.g. the design's
  "index of 12,450 files" → AC-53, AC-11.
- EC-2: One source file is larger than the per-file index limit (400 KB) → left out of the
  index and counted in AC-53.
- EC-3: The repo is not JS/TS (Python, Go, …), so the import graph is empty → AC-39, AC-40.
- EC-4: A monorepo with many `package.json` files and many scripts → AC-33 (lowest-ranked
  facts cut first), AC-62, AC-83.
- EC-5: A flat repo with no import edges → AC-30; the reading path still lists files in rank
  order → AC-25.
- EC-6: The LLM output names a file that isn't in the repo → AC-57, AC-79, AC-58.
- EC-7: The LLM output is not valid JSON or misses a section → AC-43 (whole-tour skeleton).
- EC-8: The LLM call times out and its answer arrives later → AC-20, AC-21.
- EC-9: The user double-clicks Generate, or clicks it in two tabs → AC-13, AC-14.
- EC-10: The server restarts during a generation → AC-18, AC-19.
- EC-11: The user leaves the page while generation runs → AC-17.
- EC-12: The repo was resynced after the tour was generated → AC-55.
- EC-13: A regeneration fails after a good LLM tour was stored → AC-77, AC-78.
- EC-14: The README or a source comment contains a prompt-injection attempt → AC-59, AC-57,
  AC-62, AC-83.
- EC-15: The repo contains a committed `.env` file → AC-24 (its contents are not among the
  collected facts; only the presence of `.env.example` is).
- EC-16: A very long file path or command → AC-67.
- EC-17: The LLM writes a diagram that doesn't render → AC-38.
- EC-18: The repo is removed during a generation → AC-23.
- EC-19: The add-repository page lives at `/onboarding`, and the sidebar already marks every
  path containing "/onboarding" as "Onboarding Tour" → AC-1, AC-2.
- EC-20: The repo has no history to compute hotness from (the clone is shallow) → Non-goal
  (hotness).
- EC-21: The user adds an LLM key after a skeleton was stored → AC-50 (the skeleton stays
  until Regenerate).
- EC-22: Repo-intel is switched off globally → AC-75, AC-46.
- EC-23: The repo has no README → AC-24 (facts without README text).
- EC-24: The clone failed (e.g. a private repo without a GitHub token) → AC-51, AC-84.
- EC-25: "Share link" button in `01-onboarding-tour-top.png` → Non-goal.
- EC-26: The design doesn't show the First tasks section → AC-90, AC-45.
- EC-27: The starter's onboarding prompt template and UI strings name a different set of
  sections (`routes_and_apis`, "key modules", "conventions & gotchas") → AC-6 and AC-5 are
  authoritative; the old set is not kept.
- EC-28: A regeneration on a degraded index while an LLM-written tour is stored → AC-75
  builds a skeleton, AC-77 keeps the stored tour, AC-78 says why.
- EC-29: "Open" buttons in `01-onboarding-tour-top.png` → AC-65 (no Open action), AC-67.

## Non-functional
- Cost: at most 1 LLM call per generation (AC-31, AC-88); 0 LLM calls on page views (AC-32);
  LLM input ≤ 12,000 tokens and output ≤ 4,000 tokens per generation (AC-33, AC-87).
- Perf: opening the page reads the stored tour and does no fact collection. The LLM call
  times out after 120 s (AC-20).
- Security: provider errors redacted (AC-49); repo text only behind `INJECTION_GUARD` (AC-59);
  copyable commands restricted (AC-62, AC-83).
- A11y: section state, copy feedback and icon controls are exposed to assistive technology
  (AC-9, AC-64, AC-66); status banners use text, not colour alone.

## Inputs (provenance)
| Input | Source | Tag |
|---|---|---|
| Index status, source files indexed / left out, indexed commit | repo-intel index state | [deterministic: repo-intel] |
| Ranked files (reading path) | repo-intel file rank (PageRank over the import graph) | [deterministic: repo-intel] |
| Critical dependency chains | repo-intel critical paths (top-ranked roots, ≤ 2 hops) | [deterministic: repo-intel] |
| Importer count per critical-path root | repo-intel import graph | [deterministic: repo-intel] |
| HTTP routes (≤ 50 sent to the LLM) | repo-intel per-file endpoint facts, test files excluded | [deterministic: repo-intel] |
| Repo skeleton | repo-intel repo map (≤ 1,500 tokens) | [deterministic: repo-intel] |
| Signatures of the top 30 ranked files | repo-intel symbols | [deterministic: repo-intel] |
| Detected stack, package scripts, lockfile, compose services, `.env.example` presence | manifests and files in the local clone | [deterministic: git clone] |
| Top-level structure | git tree of the clone | [deterministic: git] |
| README text (≤ 4,000 chars) | local clone | [deterministic: git clone] |
| Section narratives, reading-path reasons, critical-path descriptions, first tasks, architecture diagram, proposed run steps | one structured call with the facts above | [new: 1 LLM call per generation] |
| Model choice for "Onboarding Tour" | Settings → Feature Models (exists) | [reused: L02 feature models] |
| LLM key | `~/.devdigest/secrets.json` / env via the secrets adapter | [reused: starter] |
| Tokens, cost | LLM adapter response + pricing | [reused: L01 cost badge] |
| Repo name, default branch, clone state | repos | [reused: starter] |

The narrative needs the LLM: no deterministic source can explain what a module is for or
suggest first tasks. Everything that can be computed (order, chains, counts, paths, run
steps) is computed and only described or checked around the model.

## Untrusted inputs
- README, manifests, compose files, script strings, file paths, symbol names and route
  strings come from the repo → sent to the LLM only as data behind `INJECTION_GUARD` (AC-59);
  README capped at 4,000 chars (AC-85) and the whole input at 12,000 tokens (AC-33).
- LLM output → validated against the tour structure (AC-43); paths grounded against the repo
  at the tour's commit (AC-57, AC-79); run steps checked (AC-62, AC-83); rendered as Markdown
  without HTML/script (AC-60); diagrams rendered in strict mode (AC-61); stored and shown as
  text only.
- Provider error text → redacted before storing, logging or showing (AC-49).

## [NEEDS CLARIFICATION]
- none
