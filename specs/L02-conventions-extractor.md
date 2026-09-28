# Conventions Extractor — repo conventions → reviewed candidates → a skill
Status: in-progress · Lesson: L02 (homework) · Packages: server, client

## Goal
The user runs a **conventions scan** on a repo. Code picks sample files, a cheap model
proposes house rules (`category, rule, evidence file:lines, detector`), and code verifies
every candidate: the evidence must exist in the file, and the rule's detector is run over
the whole repo to measure how often the codebase actually follows it. The user sees the
surviving candidates, accepts / rejects / edits them, then turns the accepted ones into a
`convention` skill (editable body + metadata) and links it to agents with the L02
mechanism.

## Scope
- In:
  - `conventions` module: `POST /repos/:id/conventions/extract` (job), list, patch.
  - Sampling by code only: tooling configs + stratified top-ranked files + a few tests.
  - Evidence verification (file in sample, lines exist, snippet matches) — unverified
    candidates are dropped.
  - Adherence (improvement 1): the model gives a ripgrep `pattern` (+ optional
    `counter_pattern`); code counts conforming vs violating files; confidence is computed
    from those counts, not self-reported. Low adherence → dropped.
  - Tooling facts (improvement 2): tsconfig / prettier / editorconfig / eslint / biome
    configs are parsed deterministically; those facts go to the prompt ("don't propose")
    and a candidate that still matches one is flagged `enforced_by`, hidden by default.
  - Server-only improvements (no UI): stratified sampling by layer + test samples (3),
    ≥ 2 evidence files for high confidence (5a), rejected/accepted rules fed back as
    "don't propose again" (7).
  - UI: Conventions page (Skills Lab), candidate cards with accept / reject / inline edit,
    "Create skill" modal (name, description, type, enabled, body, agents to link).
- Out: PR-history mining (4), critic pass (5b), multi-skill split (6), skill eval (8),
  drift detection (9); SSE for scan progress (polling is enough).

## Design

### Data
- `conventions` (exists, never used) gains: `scan_id`, `category`, `evidence` (jsonb
  `[{path, line_start, line_end, snippet}]`, replaces `evidence_path`/`evidence_snippet`),
  `status` (`pending|accepted|rejected`, replaces `accepted`), `edited`, `adherence`,
  `support_files`, `violation_files`, `enforced_by`, `skill_id`, `created_at`, `updated_at`.
  Two migrations (add, then drop) so `drizzle-kit generate` never asks about renames.
- New `convention_scans`: `repo_id`, `status` (`running|done|failed`), `error`,
  `sample_paths`, `model`, `tokens_in/out`, `cost_usd`, `proposed`, `kept`,
  `dropped` (jsonb counts by reason), `started_at`, `finished_at`.
- Re-scan: pending candidates are replaced; accepted/rejected stay; a new candidate whose
  normalized rule equals an existing accepted/rejected one is skipped.

### Pipeline (job `conventions.extract`, no retries — an LLM call must not run 3×)
1. Samples: tooling configs (fixed allowlist, root + one level) + up to 12 source files
   picked round-robin across layers from the top-60 ranked + up to 2 tests. Each file
   truncated (300 lines), lines numbered. `.env*` never read. No samples → scan fails with
   "index the repo first".
2. LLM `completeStructured('ConventionExtraction')`, model from feature model
   `conventions` (default lowered to a cheap one). Files are wrapped as untrusted data.
3. Verify evidence → 4. adherence via `codeIndex.grep` (pattern validated: length cap,
   no leading `-`, compiles; the ripgrep adapter passes it after `-e`/`--`) → 5. tooling
   match → 6. dedupe vs existing → store.

Confidence = adherence × min(1, support_files / 5); capped at 0.69 when evidence spans
< 2 files; no usable detector → min(model confidence, 0.5). Drop when adherence < 0.6
(with ≥ 3 matching files).

### Contracts (`@devdigest/shared`, both copies)
`ConventionCandidate` (extended), `ConventionScan`, `ConventionsList`, `ConventionUpdate`,
`ConventionCategory`, `ConventionEvidence`; `SkillCreate.source` += `extracted`;
`FEATURE_MODELS.conventions` default → cheap model.

### Routes
| Method | Path | |
|---|---|---|
| POST | `/repos/:id/conventions/extract` | start a scan → 202 `ConventionScan`; 409 if one is running |
| GET | `/repos/:id/conventions` | `{ scan, candidates }` (latest scan) |
| PATCH | `/conventions/:id` | `{ status?, rule?, category?, skill_id? }` |

Skill creation reuses `POST /skills` (`type: convention`, `source: extracted`) and
`POST /agents/:id/skills { skill_id }`; the body is built on the client from the accepted
candidates. Name taken → update the existing skill (`PUT /skills/:id`, version bump).

### UI
- Sidebar SKILLS LAB → **Conventions** (`/repos/:repoId/conventions`).
- Header "Conventions in <repo>" · "Detected from N sample files · last scan …" · Re-scan.
- Toolbar: status filter, "Show tooling-enforced", "N of M accepted", Create skill.
- Card: rule (inline edit), category, evidence `path:start-end` + snippet (copy),
  confidence bar, adherence "94% · 212/225 files", Accept / Reject.
- Modal: name, description, type, enabled, body editor (≈ tokens), agents to link.

## Acceptance criteria
- [ ] A scan on an indexed repo produces candidates; each has verified evidence.
- [ ] A candidate whose file/lines/snippet does not exist is never shown.
- [ ] Confidence comes from measured adherence; a rule the repo mostly breaks is dropped.
- [ ] A rule already enforced by a found tooling config is flagged and hidden by default.
- [ ] Accept / reject / edit persist; a re-scan keeps decisions and does not re-propose
      rejected rules.
- [ ] Create skill → a `convention` skill with source `extracted`, linked to the chosen
      agents; an existing name updates that skill (v+1).
- [ ] server + client typecheck and tests pass; `arch:check` adds no violations; both
      shared copies updated.

## Open questions
- Adherence is regex-based (ripgrep): structural rules without a line-level signature get
  no detector and are capped at 0.5. ast-grep patterns would cover more.
