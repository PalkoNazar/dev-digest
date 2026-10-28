# Spec: PR Why + Risk Brief | Spec ID: SPEC-03 | Status: implemented
Supersedes: —
Lesson: L05 · Packages: server, client · Designs: `designs/pr-brief/`

## Проблема й навіщо
A reviewer who opens someone else's PR in DevDigest starts "cold": they don't know why the
change exists, what in it is risky, or which file to read first. Part of the answer already
exists but is scattered: the Intent card (Intent Layer) explains the goal, Smart Diff orders
files by role, Blast radius (L04) shows what else the change can reach. Nothing puts these
facts together or turns them into concrete risks and a reading order. After this feature the
PR Overview tab has one PR Brief block: a short "what and why" summary, Risk areas tied to
files, and a Review focus list of `file:line — why` items that jump into Files changed. The
brief comes from one bounded model call over facts DevDigest already computed, never over
the diff code, and it is cached per head commit so reopening the PR costs nothing.

## Goals / Non-goals
- Goal: the PR Overview tab shows a PR Brief block with a Generate brief action while no
  brief exists for the PR.
- Goal: a generated brief shows a summary (what the PR does and why), Risk areas (each with a
  title, a severity and at least one file) and Review focus (`file:line — reason`, in reading
  order), next to the existing Intent and Blast radius blocks.
- Goal: every file named in Risk areas and Review focus is a changed file of the PR or a file
  of its blast radius map; invented paths never reach the user.
- Goal: activating a Review focus item opens the Files changed tab on that file (and line).
- Goal: the brief is stored per PR with the head commit it was generated for; reopening or
  reloading the PR shows it with zero model calls; a refresh action regenerates it; a brief
  for an older commit is visibly marked stale.
- Goal: a generation makes exactly one model call, on the model chosen in Settings →
  Feature Models → "Risk Brief", with an input budget of 8,000 tokens and no diff hunk
  bodies.
- Goal: when Intent, Blast radius, linked issue, spec documents or the PR description are
  missing, the brief still generates and says explicitly which inputs were missing and why.
- Non-goal: "Prior PRs touching these files" (L04 P3, shown in `designs/pr-brief/01-overview-brief.png`)
  and any PR-history input or block.
- Non-goal: deriving Intent or rebuilding the repo-intel index as part of brief generation
  (each is its own action; doing it here would add model calls or long jobs).
- Non-goal: generating the brief automatically on PR import, on page open, when it turns
  stale after a new commit, or as part of a review run.
- Non-goal: feeding the brief into the reviewer prompt, or filtering findings with it.
- Non-goal: a devdigest-mcp tool for the brief.
- Non-goal: brief in the CI runner (agent-runner arrives in L06) and anything from L06–L08.
- Non-goal: Compose review, Run Review and the review findings shown in
  `designs/pr-brief/02-files-changed-after-focus-click.png` / `05-ac-focus-click-files-changed.png`
  (existing features, unchanged).
- Non-goal: the Graph view toggle of Blast radius and the "MORE SCREENS" nav items in the
  designs (not part of this feature).
- Non-goal: changing the grounding gate `groundFindings` or `INJECTION_GUARD`.

## User stories
- US-1: As a reviewer, I want a PR Brief block on the Overview tab with a Generate brief
  action, so that I can get an orientation for a PR I open cold.
- US-2: As a reviewer, I want a short summary next to the Intent and Blast radius blocks, so
  that I see what the PR does, why, and what it reaches in one place.
- US-3: As a reviewer, I want concrete risks, each tied to a real file, so that I know what
  could go wrong and where.
- US-4: As a reviewer, I want a reading order of `file:line — reason` items that take me to
  the code in Files changed, so that I start with the lines that matter.
- US-5: As a reviewer, I want the brief to come back instantly after a reload, to regenerate
  it on demand, and to see when it is out of date, so that I neither pay twice nor trust an
  old brief.
- US-6: As the repo owner paying for the model, I want one bounded model call per generation
  on the model I chose in Settings, so that the cost is predictable.
- US-7: As a course student, I want the delivery artifacts (spec, plan, verifier report, PR
  with demo) in the PR, so that the homework can be graded.

## Acceptance criteria (EARS)
Priority tags map to the course criteria: [P1] blocks submission, [P2] mentor-reviewed,
[P3] nice to have.

### Overview: PR Brief block
- AC-1 (US-1) [P1]: WHILE no brief is stored for the PR, the PR Overview tab SHALL show a
  "PR Brief" block containing a "Generate brief" button.
- AC-2 (US-1) [P1]: WHEN the user activates "Generate brief", the client SHALL ask the server
  to generate a brief for the PR.
- AC-3 (US-1): WHILE a generation request for the PR is pending, the PR Brief block SHALL
  keep the generate and refresh controls disabled.
- AC-99 (US-1): WHILE the PR detail or the stored brief is still loading, the PR Brief block
  SHALL show a loading state with the generate and refresh controls disabled.
- AC-4 (US-1) [P3]: WHILE a generation request for the PR is pending, the PR Brief block
  SHALL show a skeleton in place of the summary, Risk areas and Review focus.
- AC-5 (US-2) [P1]: WHEN a brief is available, the PR Brief block SHALL show its summary text.
- AC-6 (US-2) [P1]: WHERE a stored intent exists for the PR, the PR Brief block SHALL show the
  existing Intent block in its left column, below the summary, with Risk areas directly under
  the intent content (layout of `designs/pr-brief/01-overview-brief.png`, Q8 = A).
- AC-7 (US-2) [P1]: WHERE the blast radius of the PR is available, the PR Brief block SHALL
  show the existing Blast radius block in its right column, beside the Intent column.
- AC-80 (US-4) [P1]: The PR Brief block SHALL show Review focus as a full-width section below
  the Intent and Blast radius columns.
- AC-81 (US-3): IF no intent is stored for the PR, THEN the PR Brief block SHALL show Risk
  areas in the left column without the intent content, with the missing-input notice of AC-8.
- AC-82 (US-2): The PR Overview tab SHALL show the existing PR Description section below the
  PR Brief block.
- AC-8 (US-2) [P1]: IF a brief was generated without one or more of its inputs (intent, blast
  radius, linked issue, spec documents, PR description), THEN the PR Brief block SHALL show a
  notice naming each missing input and its reason (e.g. "Intent: not derived yet",
  "Blast radius: index not built").
- AC-9 (US-3) [P1]: The Risk areas list SHALL show every risk with its title and its file
  reference(s) as `path` or `path:line[-line]`.
- AC-10 (US-3) [P1]: The Risk areas list SHALL show each risk's severity as an icon coloured
  per severity (high, medium, low).
- AC-11 (US-3): The Risk areas list SHALL expose each risk's severity as text to assistive
  technology (colour is not the only signal).
- AC-12 (US-3) [P3]: WHEN the user activates a risk's expand control, the Risk areas list
  SHALL show that risk's explanation below its title.
- AC-78 (US-3) [P3]: The risk expand control SHALL expose its expanded or collapsed state to
  assistive technology.
- AC-13 (US-3): IF a brief has no risks, THEN the Risk areas list SHALL show "No notable risks
  flagged."
- AC-14 (US-4) [P1]: The Review focus list SHALL show every item as `path:line — reason`
  (`path — reason` for an item without a line, AC-97), in
  the order the brief returned them, under the heading "Review focus — read these first" with
  the item count.
- AC-15 (US-4): IF a brief has no Review focus items, THEN the Review focus list SHALL show a
  message that no starting points were suggested.
- AC-16 (US-5) [P1]: WHEN the user opens or reloads the PR page and a brief is stored, the PR
  Brief block SHALL show the stored brief without asking the server to generate one.
- AC-17 (US-5) [P1]: WHILE a brief is shown, the PR Brief block SHALL show a refresh control
  with the accessible name "Regenerate brief".
- AC-18 (US-5) [P1]: WHEN the user activates the refresh control, the client SHALL ask the
  server to generate a new brief for the PR.
- AC-19 (US-5) [P2]: WHILE the shown brief was generated for a commit other than the PR's
  current head commit, the PR Brief block SHALL show a "PR changed since this brief was
  generated" badge next to the refresh control.
- AC-83 (US-5, US-6): WHILE the shown brief is stale (AC-19), the client SHALL NOT ask the
  server to generate a brief unless the user activates the refresh control.
- AC-84 (US-6): WHEN a brief is shown, the PR Brief block SHALL show the model, tokens in→out,
  cost, generation time and short head SHA of the call that produced it.
- AC-20 (US-5): IF a generation request fails, THEN the PR Brief block SHALL show the
  server's error message and a Retry action.
- AC-21 (US-5): IF a generation request fails while a previous brief exists, THEN the PR Brief
  block SHALL keep showing the previous brief.
- AC-22 (US-2) [P3]: WHERE the PR has at least one completed review, the PR Brief block SHALL
  show above the summary a verdict banner with the latest review's verdict, findings and
  blocker counts and PR score.
- AC-23 (US-2) [P3]: IF the PR has no completed review, THEN the PR Brief block SHALL show the
  summary without a verdict, counts or score.
- AC-24 (US-1) [P3]: The PR Brief block SHALL take every label and message from the client's
  `brief` message namespace, not from strings written in the component.
- AC-25 (US-3, US-4): IF a file path doesn't fit its row, THEN the PR Brief block SHALL shorten
  it with an ellipsis and keep the full path in its accessible name and tooltip.
- AC-26 (US-1, US-2): The PR Brief block SHALL render every model-written text (summary,
  risk titles and explanations, focus reasons) as plain escaped text, without executing or
  rendering HTML, Markdown or links.

### Navigation to Files changed
- AC-27 (US-4) [P1]: WHEN the user activates a Review focus item whose file is a changed file
  of the PR, the PR page SHALL switch to the Files changed tab and scroll that file's card
  into view.
- AC-28 (US-4) [P1]: WHEN the Files changed tab opens on a file from a Review focus item, the
  Files changed tab SHALL show the file's diff expanded, even when its role group or the file
  is collapsed by default.
- AC-29 (US-4) [P2]: WHEN the Files changed tab opens on a file and line from a Review focus
  item, the Files changed tab SHALL scroll to that line and highlight it.
- AC-30 (US-4) [P2]: IF the target line is not a rendered line of the file's diff, THEN the
  Files changed tab SHALL keep the file in view and show "Line N isn't among the changed lines".
- AC-31 (US-4): The Files changed tab SHALL apply AC-27–AC-30 in both Smart order and
  Original order.
- AC-32 (US-4): The PR page SHALL keep the target file and line in the page URL, so that a
  reload or a copied link opens Files changed on the same file and line.
- AC-85 (US-4): WHEN the user jumps from the PR Brief block to Files changed, the PR page SHALL
  add a browser history entry, so that the browser's Back action returns to the Overview tab.
- AC-33 (US-3) [P3]: WHEN the user activates a risk's file reference whose file is a changed
  file of the PR, the PR page SHALL behave as in AC-27–AC-30.
- AC-34 (US-3, US-4) [P3]: IF the user activates a Review focus item or risk file reference
  whose file is not a changed file of the PR, THEN the PR Brief block SHALL show "File not in
  this PR's diff" and stay on the Overview tab.
- AC-35 (US-4): Every Review focus item SHALL be reachable by keyboard and have the accessible
  name "Open <path> line <N> in Files changed".

### Server: reading the brief
- AC-36 (US-5) [P1]: WHEN the client asks for the brief of a PR, the server SHALL return the
  stored brief without calling a model.
- AC-37 (US-5): IF no brief is stored for the PR, THEN the server SHALL answer "no brief yet"
  as a normal (non-error) response.
- AC-38 (US-5) [P2]: WHEN the server returns a stored brief, the server SHALL say whether the
  brief's head commit differs from the PR's current head commit.
- AC-39 (US-5): IF the PR does not exist in the workspace, THEN the server SHALL answer
  not-found to both reading and generating a brief.

### Server: generating the brief
- AC-40 (US-6) [P1]: WHEN the client asks to generate a brief, the server SHALL build the model
  input from the stored intent, the blast radius summary and its caller files, per-file
  additions/deletions with Smart Diff role, the PR title and description, the linked
  issue(s), the attached spec documents and each PR file's changed line ranges.
- AC-86 (US-2): WHEN the server builds the model input, the server SHALL take as spec
  documents the union of the documents attached to any agent or any skill for the PR's repo,
  each path once, ordered by path (Q1 = A).
- AC-87 (US-2): WHEN the server builds the model input, the server SHALL read each spec
  document from the repo's default branch in the local clone as of its last sync (the rule of
  `specs/L05-project-context.md` AC-34).
- AC-88 (US-2): WHEN the server builds the model input, the server SHALL fetch from GitHub the
  title and body of at most 3 issues linked to the PR (closing-linked first, then mentioned in
  the description), each cut to 3,000 characters (the Intent Layer limits, Q2 = A).
- AC-89 (US-4): WHEN the server builds the model input, the server SHALL describe each
  changed file's changed lines only as new-side line-number ranges, without hunk header text
  (Q4 = A).
- AC-41 (US-6) [P2]: The server SHALL NOT put any line of a diff hunk body into the model
  input.
- AC-42 (US-6) [P2]: The server SHALL make exactly one model call per generation, with no
  schema-repair retry and no transport retry (Q5 = A).
- AC-43 (US-6) [P2]: The server SHALL make the generation call with the provider and model
  resolved from the workspace's "Risk Brief" feature-model setting (its registry default
  when unset).
- AC-44 (US-6) [P2]: The server SHALL keep the model input (system and user messages) at or
  under 8,000 tokens, estimated as ceil(characters / 4) (Q3 = A).
- AC-90 (US-6): The server SHALL send at most the first 4,000 characters of the PR
  description.
- AC-100 (US-6): The server SHALL send at most 30 caller files of the blast radius map.
- AC-101 (US-6): The server SHALL never split a character (e.g. an emoji) when it cuts a text
  for the model input.
- AC-91 (US-6): The server SHALL never shorten the instructions, the intent, the blast radius
  summary or the blast radius stats to fit the budget.
- AC-45 (US-6) [P2]: IF the assembled input would exceed the budget of AC-44, THEN the server
  SHALL shorten inputs in this order until it fits, each step only as far as needed: (1) spec
  documents, removing them from the end of the list, then cutting the last one kept; (2)
  linked issues; (3) PR description; (4) blast radius caller list; (5) changed-file list,
  keeping core files first, then by changed lines, and ending with an "N more files" line.
- AC-92 (US-6): The server SHALL end every input it shortened for the budget with a visible
  truncation marker.
- AC-93 (US-6): IF the input still exceeds the budget after every step of AC-45, THEN the
  server SHALL refuse the generation without a model call, with a message that the PR is too
  large for a brief.
- AC-46 (US-2): IF an input was shortened or left out for the budget, THEN the PR Brief block
  SHALL name it in the notice of AC-8 as "truncated" or "omitted to fit the budget".
- AC-47 (US-6): The server SHALL cap the model's output at 2,000 tokens (Q6 = A).
- AC-94 (US-3, US-4): The server SHALL ask the model for at most 6 risks, at most 8 Review
  focus items, a summary of at most 600 characters, risk titles of at most 120 characters and
  reasons and explanations of at most 300 characters.
- AC-95 (US-3, US-4): IF the model answer has more than 6 risks or more than 8 Review focus
  items after grounding (AC-50–AC-52), THEN the server SHALL keep the first 6 risks and the
  first 8 items instead of rejecting the answer (Q9 = A).
- AC-96 (US-2, US-3, US-4): IF a text in the model answer exceeds its cap of AC-94, THEN the
  server SHALL cut it at the cap and end it with "…" instead of rejecting the answer (Q9 = A).
- AC-48 (US-3, US-4) [P2]: WHEN the model answers, the server SHALL validate the answer
  against the brief structure (summary, risks with title, kind, severity, explanation and file
  references, review focus items with file, line and reason).
- AC-49 (US-6): IF the model answer fails validation, THEN the server SHALL answer the
  generation request with an error saying the model returned an invalid brief.
- AC-79 (US-5): IF a generation fails for any reason, THEN the server SHALL leave the
  previously stored brief and its head commit unchanged.
- AC-50 (US-3) [P1]: The server SHALL remove from each risk every file reference whose path is
  neither a changed file of the PR nor a file of the blast radius map used for that generation.
- AC-51 (US-3) [P1]: The server SHALL drop every risk left with no file reference after AC-50.
- AC-52 (US-4) [P1]: The server SHALL drop every Review focus item whose file is neither a
  changed file of the PR nor a file of the blast radius map used for that generation.
- AC-53 (US-3, US-4): IF the blast radius is missing or degraded for a generation, THEN the
  server SHALL ground risks and Review focus items against the PR's changed files only.
- AC-54 (US-4): IF a Review focus item's line on a changed file of the PR lies outside every
  changed line range of that file, THEN the server SHALL keep the item and mark it "line
  outside the changed lines" (Q4 = A).
- AC-97 (US-4): IF a Review focus item points to a file that is only in the blast radius map
  and its line is not a caller line of that file in the map, THEN the server SHALL keep the
  item without a line, shown as `path — reason`.
- AC-98 (US-4): WHERE a Review focus item is marked as in AC-54, the Review focus list SHALL
  show the hint "line outside the changed lines" next to it.
- AC-55 (US-3, US-4): The server SHALL compare paths exactly after removing a `:line` or
  `:line-line` suffix and a leading `./`.
- AC-56 (US-3, US-4): The PR Brief block SHALL show how many risks and Review focus items were
  removed because their file is not in the PR or its blast radius.
- AC-57 (US-5) [P1]: WHEN a generation succeeds, the server SHALL store the brief for the PR
  together with the head commit SHA it was generated for, replacing the previous brief.
- AC-58 (US-5): IF the client disconnects before a generation finishes, THEN the server SHALL
  still finish and store the brief.
- AC-59 (US-6): IF a second generation request for the same PR arrives while one is in
  progress, THEN the server SHALL answer it with the result of the in-progress generation,
  without a second model call.
- AC-60 (US-6): IF the PR has no changed files loaded, THEN the server SHALL refuse the
  generation without a model call, with a message that the PR's files must be resynced.
- AC-61 (US-2) [P1]: IF no intent is stored for the PR, THEN the server SHALL generate the
  brief without it and record "intent: not derived yet".
- AC-62 (US-2): IF the stored intent was derived for another head commit, THEN the server
  SHALL use it and record "intent: derived for an older commit".
- AC-63 (US-2) [P1]: IF the blast radius is unavailable or degraded, THEN the server SHALL
  generate the brief without it (or with the partial map) and record the blast radius reason.
- AC-64 (US-2): IF the linked issue can't be read (no GitHub token, not found, fetch failed),
  THEN the server SHALL generate the brief without it and record the reason.
- AC-65 (US-2): IF no spec document is attached for the repo or a document can't be read,
  THEN the server SHALL generate the brief without it and record the reason.
- AC-66 (US-2): IF the PR description is empty, THEN the server SHALL generate the brief and
  record "PR description: empty".
- AC-67 (US-6): IF no API key is configured for the "Risk Brief" provider, THEN the server
  SHALL refuse the generation without a model call, with a message naming the provider and
  Settings → Feature Models.
- AC-68 (US-6): IF the model call fails or does not answer within 90 s, THEN the server SHALL
  answer the generation request with an error whose provider text has been redacted.
- AC-69 (US-6) [P2]: WHEN a generation's model call ends, the server SHALL write one log line
  with the provider, model, estimated input tokens, tokens in and out, cost and outcome, and
  no PR, issue, document or model text.
- AC-70 (US-6): The server SHALL send the PR title, description, linked issue text, spec
  document text, file paths, intent text and blast radius text to the model only as untrusted
  data behind `INJECTION_GUARD`.
- AC-71 (US-3, US-4) [P2]: The shared brief contract SHALL carry the summary and the Review
  focus items (file, line, reason) identically in the server and client copies.

### Delivery (course process)
- AC-72 (US-7) [P1]: The feature PR SHALL contain this spec and its Development Plan, written
  by `spec-creator` and `implementation-planner`.
- AC-73 (US-7) [P1]: The feature PR SHALL be open with an implementation description and a
  1–3 minute demo video following the "Як перевірити" scenario.
- AC-74 (US-7) [P2]: The feature branch SHALL commit the spec and the plan before the first
  feature-code commit.
- AC-75 (US-7) [P2]: The feature PR description SHALL contain a cross-model review note naming
  the model that reviewed the plan and what it found.
- AC-76 (US-7) [P2]: The feature PR SHALL include the final `plan-verifier` report with no
  open requirements.
- AC-77 (US-7) [P3]: The feature PR SHALL include the `workflow-retro` result and a cost report
  of the run.

## Edge cases
- EC-1: Double click on Generate brief, or two tabs generate at once → AC-3, AC-59.
- EC-2: User navigates away or closes the tab during generation → AC-58; on return the stored
  brief is shown (AC-16).
- EC-3: Server restarts during generation → nothing is stored; the client gets an error
  (AC-20) and the previous brief stays (AC-21, AC-79).
- EC-31: Model call or validation fails while an older brief is stored → AC-79, AC-21.
- EC-4: New commit pushed after the brief was generated → AC-38, AC-19, AC-83 (badge only,
  no automatic call); auto-regeneration → Non-goal.
- EC-5: Intent never derived (`designs/pr-brief/01-overview-brief.png` assumes it exists) →
  AC-61, AC-8; deriving it here → Non-goal.
- EC-6: Intent derived for an older commit → AC-62.
- EC-7: repo-intel index missing, partial, too large or flag off → AC-63, AC-53, AC-8.
- EC-8: No GitHub token / linked issue not found → AC-64.
- EC-9: No spec documents attached through Project Context → AC-65; which documents count →
  AC-86; the same document attached to several agents or skills → once (AC-86).
- EC-10: Empty PR description → AC-66.
- EC-11: PR with hundreds of files or a huge blast map → AC-44, AC-45, AC-90, AC-92, AC-46;
  still too large after every step → AC-93.
- EC-32: More than 3 linked issues, or a very long issue body → AC-88.
- EC-33: Model returns more items than the caps, or over-long texts → AC-94, AC-95, AC-96.
- EC-12: Model invents a path, or a path from the PR description / spec docs that is not in
  the PR → AC-50–AC-52, AC-56.
- EC-13: Every risk or every focus item is removed by grounding → AC-13, AC-15, AC-56.
- EC-14: Model returns a line outside the changed lines, or a line of a file it never saw
  numbers for → AC-89, AC-54, AC-98, AC-97, AC-30.
- EC-15: Focus item points to a blast-only file (a caller not changed in the PR) → AC-34.
- EC-16: Focus item points to a file in a collapsed role group (docs, boilerplate) or a file
  over the auto-expand size → AC-28.
- EC-17: File with no patch (binary, too large for GitHub) → AC-30 (file in view, line note).
- EC-18: Renamed file referenced by its old path → not a changed path → dropped (AC-50, AC-52).
- EC-19: Path contains `:` or a line range (`ratelimit.ts:12-18` in `01-overview-brief.png`)
  → AC-55.
- EC-20: Model answer is malformed JSON or misses fields → AC-48, AC-49; no repair retry (AC-42),
  the user retries by hand (AC-20).
- EC-21: No LLM key for the chosen provider → AC-67.
- EC-22: LLM timeout or provider error that echoes the key → AC-68 (redacted).
- EC-23: PR body or spec text contains instructions to the model ("ignore previous …") →
  AC-70.
- EC-24: Model text contains HTML/Markdown/links → AC-26.
- EC-25: No review run yet, so no verdict or score for the banner of `01-overview-brief.png`
  → AC-23.
- EC-26: Very long paths or titles → AC-25.
- EC-27: Zero changed files loaded (known past bug: empty `pr_files`) → AC-60.
- EC-28: The cost line "$0.014 8.2K→1.3K" in `01-overview-brief.png` has no stated source
  (brief call or latest review?) → AC-84 (the brief's own call), the verdict banner shows no
  cost.
- EC-29: Brief open before the PR detail (head SHA, files) or the stored brief has loaded →
  AC-99.
- EC-30: PR Description section that the Overview tab shows today is not in the designs → it
  stays below the PR Brief block (AC-82).
- EC-34: Back button after a jump from Review focus → AC-85; reload on Files changed → AC-32.

## Non-functional
- Cost: exactly 1 model call per generation (AC-42); 0 model calls on page open, reload or
  reading the brief (AC-16, AC-36), on a stale brief (AC-83), on a refused generation
  (AC-60, AC-67, AC-93) and on a duplicate request (AC-59); input ≤ 8,000 tokens (AC-44),
  output ≤ 2,000 tokens (AC-47); ≤ 3 GitHub issue reads per generation (AC-88).
- Perf: reading a stored brief does no fact collection and no model call (AC-36). The model
  call times out after 90 s (AC-68).
- Security: untrusted inputs only behind `INJECTION_GUARD` (AC-70); provider errors redacted
  (AC-68); no PR/issue/doc/model text and no secrets in logs (AC-69); paths grounded (AC-50–
  AC-52); output rendered as plain text (AC-26).
- A11y: severity as text, not colour alone (AC-11); keyboard-reachable focus items with
  descriptive names (AC-35); expand state announced (AC-78); full paths in accessible names
  (AC-25).

## Inputs (provenance)
| Input | Source | Tag |
|---|---|---|
| Intent (summary, in scope, out of scope, confidence, head commit) | stored PR intent (Intent Layer, `specs/2026-09-29-intent-layer.md`) | [reused: Intent Layer] |
| Blast radius summary, stats, changed symbols, caller files, degraded reason | blast radius map from the repo-intel index (`specs/L04-blast-radius.md`) | [deterministic: repo-intel] [reused: L04] |
| Changed files with additions / deletions | PR detail (GitHub, stored PR files) | [reused: starter] |
| Smart Diff role per file | Smart Diff grouping (deterministic, no LLM) (`specs/2026-10-04-smart-diff.md`) | [reused: Smart Diff] |
| Changed line ranges per file (numbers only) | parsed from the stored patch hunk headers; header text and bodies never sent (AC-89) | [deterministic: git / GitHub patch] |
| PR title, description, head SHA | stored PR | [reused: starter] |
| Linked issue(s) | GitHub issues: ≤ 3, closing-linked first then mentioned, ≤ 3,000 chars each, fetched per generation (AC-88) | [deterministic: GitHub API] |
| Spec documents | union of Project Context attachments of all agents and skills for the repo, read from the default branch of the local clone (AC-86, AC-87, `specs/L05-project-context.md`) | [reused: L05 Project Context] |
| Summary, risks, review focus | one structured call over the facts above | [new: 1 LLM call per generation] |
| Model choice | Settings → Feature Models → "Risk Brief" | [reused: feature models] |
| LLM key | `~/.devdigest/secrets.json` / env via the secrets adapter | [reused: starter] |
| Tokens, cost | LLM adapter response + pricing | [reused: L01 cost badge] |
| Verdict, findings / blocker counts, PR score (P3 banner) | latest completed review | [reused: starter reviews] |
| Grounding set (PR files ∪ blast map files) | the two inputs above | [deterministic: DB + repo-intel] |

The model is needed only for judgement in prose: naming risks, ranking where to start and
explaining why. Everything that can be computed (stats, roles, callers, paths, staleness,
grounding) is computed and passed in or checked afterwards. The model never reads diff code,
which keeps the input small and bounded, and keeps attacker-controlled code out of the prompt.

## Untrusted inputs
- PR title and description, linked issue text → data behind `INJECTION_GUARD` (AC-70);
  shortened by the budget (AC-45).
- Spec document text (repo files) → data behind `INJECTION_GUARD`; shortened by the budget.
- File paths, symbol names, endpoint and cron strings from the PR and repo-intel → data
  behind `INJECTION_GUARD`.
- Intent text (output of an earlier model call over the same untrusted inputs) → data behind
  `INJECTION_GUARD`.
- Model output → validated against the brief structure (AC-48); file paths grounded against
  PR files ∪ blast map (AC-50–AC-52); lines checked against changed ranges and caller lines
  (AC-54, AC-97); item counts and text lengths capped (AC-94–AC-96); rendered as escaped plain text
  (AC-26); never executed or used as a URL.
- Provider error text → redacted before storing, logging or showing (AC-68).

## [NEEDS CLARIFICATION]
- none
