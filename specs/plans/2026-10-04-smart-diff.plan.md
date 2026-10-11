# Plan: Smart Diff — reviewer-ordered Files changed with inline findings
Status: ready · Date: 2026-10-04 · Branch: feat/smart-diff · Packages: server, client (both `@devdigest/shared` copies)
Spec: `specs/2026-10-04-smart-diff.md`

## Goal
Files changed groups a PR's files by role in a fixed order core → tests → wiring → docs → boilerplate (sticky header: chevron, role color square, label + hint, `● N` files-with-findings only when N>0, "N files"; docs and boilerplate collapsed). The latest review of every agent is shown in the diff: a dot next to the path of every file with a non-dismissed finding; the finding's line gets a left severity stripe + a right label (blocker/warning/suggestion) and under it the same `FindingCard` as on Agent runs (expanded, working Accept/Dismiss); findings whose line is not in the patch go in a block at the end of the file. "Smart order / Original order" restores GitHub's order (default smart, falls back to original while the smart-diff loads or on error). Before any review: "review not run yet" instead of zero counters. The server classifies deterministically via `GET /pulls/:id/smart-diff` — no LLM, no GitHub call.

## Context read
- `CLAUDE.md`: contract first, both shared copies together; every query workspace-scoped; no future-lesson features (pseudocode summaries, PR splits stay out); no prettier (root `INSIGHTS.md`).
- `server/AGENTS.md`, `server/src/modules/AGENTS.md`, `server/src/modules/reviews/AGENTS.md`: thin routes, `getContext` first, Zod `params` on the route; `repository.ts` is a facade over `repository/*.repo.ts` — no new queries needed: `getPull`, `getPrFiles`, `reviewsForPull` exist.
- `server/INSIGHTS.md`: review it-tests hit real GitHub/OpenRouter → reuse `appWith(...)` in `server/test/reviews.it.test.ts:119` (already passes `MockSecretsProvider`/`MockGitHubClient`); arch:check is green on main.
- `server/.dependency-cruiser.cjs`: `MODULE_CORE` = `modules/**` minus routes minus `repository*`; `drizzle-only-in-repositories` forbids `src/db/**` imports from the core → `smart-diff/*.ts` imports only `@devdigest/shared` types. `service.ts` already takes `Container` and imports `db/rows` (frozen known violations — don't add).
- Code checked: `getPrFiles` has no `ORDER BY` and the same select feeds `GET /pulls/:id` (`pulls/routes.ts:276`) → input order = `pr.files` order on the client. `reviewsForPull` returns newest first. Seed review has `agentId: null` (`server/src/db/seed.ts:137-149`) → null is its own bucket. Nothing outside `brief.ts` uses `SmartDiffRole`. `SmartDiffResponse = SmartDiff` exists in both `review-api.ts`. No module route uses a `response:` schema yet; `app.ts:64-65` sets the zod `serializerCompiler`.
- Client: don't grow `page.tsx`; tests use `fireEvent` + `vi.mock("@/lib/hooks/<domain>")`, vitest imports, block-body `beforeEach`; no `notify.error` in mutation hooks; vitest can't filter `[repoId]` paths. Diff-viewer strings come from `useTranslations("shell")`; `src/test/smoke.test.tsx` renders `DiffViewer` with shell messages only. `DiffTab.tsx` has hard-coded strings, no test, comments hidden by default. `useFindingAction` invalidates `["reviews", prId]` only when `prId` is passed. `SEV` is exported from `@devdigest/ui`. `PrDetailHeader` is `position: sticky; top: 0; zIndex: 5`.
- `e2e/specs/05-pr-diff.flow.json` waits for `src/config.ts` on the diff tab — core, expanded → flow still passes.
- The worktree has no `node_modules` → S0.

## Constraints
- Contract changes first, identically in both `brief.ts`; `diff` of the two must be empty.
- `smart-diff/{constants,classify,build}.ts` are pure: imports `@devdigest/shared` (types) and siblings only; no Fastify, Drizzle, `db/**`, `repository*`, `Container` (skill onion-architecture; rules `drizzle-only-in-repositories`, `fastify-only-in-routes`, `no-container-in-core`).
- Thin route: `params: IdParams`, `response: { 200: SmartDiffResponse }`, `getContext`, one service call; missing PR → `NotFoundError` from the service.
- Workspace scope via `repo.getPull(workspaceId, prId)` before reads keyed by `prId` (as `service.ts:166`).
- No new DB queries, tables, migrations. Relative `.js` import suffixes in server code.
- `components/diff-viewer` never imports from `app/**`: findings render through `renderFinding`; its own strings stay in `shell.json → diffViewer`.
- All user-visible strings via next-intl; UI only from the `@devdigest/ui` barrel; colors from `SEV` / CSS vars; components use hooks from `@/lib/hooks/reviews` only; no `user-event`/`msw`.
- `page.tsx` gets at most two extra props on `<DiffTab>`.

## Affected modules
| Package | File | Action |
|---|---|---|
| server + client | `{server,client}/src/vendor/shared/contracts/brief.ts` | edit |
| server | `server/src/modules/reviews/smart-diff/{constants,classify,build}.ts` | new |
| server | `server/src/modules/reviews/{service,routes}.ts` | edit |
| server | `server/test/smart-diff.test.ts` | new |
| server | `server/test/{contracts.test.ts,reviews.it.test.ts}` | edit |
| client | `client/src/lib/hooks/reviews.ts` | edit |
| client | `client/src/lib/smart-diff.ts`, `smart-diff.test.ts` | new |
| client | `client/src/components/diff-viewer/{findings.ts,findings.test.ts,UnmatchedFindings/*,FileCard/FileCard.test.tsx}` | new |
| client | `client/src/components/diff-viewer/{index.ts,DiffViewer/DiffViewer.tsx,FileCard/FileCard.tsx,CodeLine/CodeLine.tsx}` | edit |
| client | `…/DiffTab/RoleGroup/{RoleGroup.tsx,index.ts,constants.ts,styles.ts,RoleGroup.test.tsx}` | new |
| client | `…/DiffTab/{helpers.ts,helpers.test.ts,styles.ts,DiffTab.test.tsx}` | new |
| client | `…/DiffTab/DiffTab.tsx`, `…/pulls/[number]/page.tsx` (2 props) | edit |
| client | `client/messages/en/{prReview,shell}.json` | edit |
| docs | `server/src/modules/reviews/AGENTS.md`, `client/src/components/AGENTS.md` | edit |

`…` = `client/src/app/repos/[repoId]/pulls/[number]/_components`

## Steps

### S0: Install worktree dependencies
- `cd reviewer-core && npm ci`; `cd server && pnpm install --frozen-lockfile`; `cd client && pnpm install --frozen-lockfile` (on `ERR_PNPM_IGNORED_BUILDS` add `--config.strict-dep-builds=false`). Delete any stray `{server,client}/pnpm-workspace.yaml`. Lockfiles unchanged.
- Done when: `git status --short` shows no lockfile/workspace changes; `cd server && pnpm typecheck` runs.

### S1: Contract — `SmartDiffRole` gets 5 values (both copies)
- `SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate'])` in both `brief.ts`; nothing else changes.
- Skills: server copy onion-architecture, zod, security; client copy frontend-ui-architecture, react-best-practices, zod, security.
- Tests: `server/test/contracts.test.ts` — all 5 roles parse (`it.each`); `'misc'` rejected.
- Done when: `diff` of the two `brief.ts` is empty; `diff -rq server/src/vendor/shared client/src/vendor/shared` lists only the pre-existing drift.

### S2: Classifier `classifyFile(path)` (tests first)
- Files: `smart-diff/constants.ts`, `smart-diff/classify.ts`, `server/test/smart-diff.test.ts` (first).
- `constants.ts`: `ROLE_ORDER` (display order core, tests, wiring, docs, boilerplate); `CLASSIFY_RULES: readonly { role; patterns: readonly RegExp[] }[]` (match order boilerplate → tests → wiring → docs; core = fallback; doc comment: the two orders differ on purpose). Anchored regexes, no nested quantifiers, repo-relative path; basename checks on the last segment; `**/` = zero or more segments; `dist/**`, `build/**`, `e2e/**`, `docs/**`, `.github/**`, `.claude/**` are root prefixes.
  - boilerplate: `*.lock`, `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `dist/**`, `build/**`, `**/__snapshots__/**`, `*.snap`, `*.generated.*`, `*.min.js`
  - tests: `**/*.test.ts(x)`, `**/*.it.test.ts`, `**/*.spec.ts`, `**/test/**`, `**/tests/**`, `**/__tests__/**`, `e2e/**`
  - wiring: basename `index.ts`/`index.js`, `*.config.*`, `tsconfig*.json`, `.eslintrc*`, `.env*`, `docker-compose*.yml`, `.github/**`, `.claude/**`
  - docs: `**/*.md`, `docs/**`, `README*`, `CHANGELOG*`, `LICENSE`
- `classify.ts`: `classifyFile(path: string): SmartDiffRole` — first matching rule wins, else `'core'`.
- Skills: onion-architecture, security (no ReDoS-prone regex).
- Tests: `it.each([path, role])` incl. disputed `__tests__/__snapshots__/x.snap` → boilerplate, `.claude/skills/security/SKILL.md` → wiring, `e2e/README.md` → tests; `pnpm-lock.yaml`, `client/package-lock.json`, `Cargo.lock`, `dist/app.js`, `vendor/jquery.min.js`, `src/api.generated.ts` → boilerplate; `server/test/helpers/pg.ts`, `server/test/reviews.it.test.ts`, `client/src/x/Y.test.tsx`, `a/b.spec.ts` → tests; `client/src/components/diff-viewer/index.ts`, `server/vitest.config.ts`, `client/tsconfig.json`, `.env.example`, `docker-compose.yml`, `.github/workflows/ci.yml` → wiring; `README.md`, `docs/agent-prompts/README.md`, `server/src/modules/reviews/AGENTS.md`, `CHANGELOG.md`, `LICENSE` → docs; `server/src/modules/reviews/service.ts`, `client/messages/en/prReview.json`, `src/config.ts` → core. `ROLE_ORDER` equals the 5 roles and each is in `SmartDiffRole.options`.
- Done when: `cd server && pnpm exec vitest run smart-diff` green.

### S3: Pure builders `latestReviewsPerAgent` + `buildSmartDiff` (tests first)
- File: `smart-diff/build.ts`; extend `server/test/smart-diff.test.ts`.
- `latestReviewsPerAgent<R extends { id; kind; agentId: string | null; createdAt: Date }>(reviews): R[]` — `kind === 'review'` only, newest `createdAt` per `agentId` (null its own bucket), order-independent, output newest first. Generic so the core never names a Drizzle row.
- `buildSmartDiff(files: {path, additions, deletions}[], findings: Pick<Finding,'file'|'start_line'>[]): SmartDiff` — `classifyFile` each; groups in `ROLE_ORDER`, empty omitted; input order within a group; `finding_lines` sorted unique `start_line` for `file === path` (else `[]`); no `pseudocode_summary`; `split_suggestion = { too_big: false, total_lines: Σ(add+del), proposed_splits: [] }`.
- Skills: onion-architecture, security, typescript-expert.
- Tests: latest-per-agent (older A dropped, B kept, newer `summary` ignored, two null-agent → newest, unsorted input); build: group order, empty groups omitted, input order kept, `[52,28,52]` → `[28,52]`, unknown-path findings ignored, `total_lines`, `files=[]` → `{groups:[], total_lines:0}`, result passes `SmartDiff.parse`.
- Done when: `pnpm exec vitest run smart-diff` green.

### S4: Service + route `GET /pulls/:id/smart-diff`
- `ReviewService.smartDiffForPull(workspaceId, prId): Promise<SmartDiff>` ("Reads"): `getPull` → NotFound; `Promise.all([getPrFiles, reviewsForPull])`; `latestReviewsPerAgent(rows.map(r => r.review))`; findings of those ids; exclude dismissed (`dismissedAt != null`); map to `{file, start_line}` / `{path, additions, deletions}`; `buildSmartDiff`. New imports only `./smart-diff/build.js` + `SmartDiff` type.
- `routes.ts`: `app.get('/pulls/:id/smart-diff', { schema: { params: IdParams, response: { 200: SmartDiffResponse } } }, …)` → `getContext` → service. JSDoc route list line: `GET /pulls/:id/smart-diff → files grouped by role + latest-review finding lines (no LLM call)`.
- Skills: routes onion-architecture, fastify-best-practices, security; service onion-architecture, security; test security.
- Tests: `reviews.it.test.ts` new `it('smart-diff: …')` with `appWith(REVIEW_FIXTURE)` + `setupRepoAndPr`, extra `t.prFiles` (`pnpm-lock.yaml`, `README.md`, `src/config.test.ts`): (a) before any review → 200, `SmartDiff.parse` ok, groups `['core','tests','docs','boilerplate']`, all `finding_lines` `[]`, `total_lines` right; (b) insert older+newer `review` rows for one seeded agent, a newer `summary`, a dismissed finding → `src/config.ts` `finding_lines` from the newest review only, dismissed excluded; (c) random UUID → 404; (d) other-workspace PR → 404 (skip if a second workspace needs more than one insert). MockLLM call count unchanged.
- Done when: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm arch:check` green (known count unchanged); `pnpm exec vitest run reviews.it` green with Docker.

### S5: Client data — `useSmartDiff` + `lib/smart-diff.ts`
- `useSmartDiff(prId)`: `queryKey ["smart-diff", prId]`, `api.get<SmartDiff>(\`/pulls/${prId}/smart-diff\`)`, `enabled: !!prId`; no polling, no toast.
- `lib/smart-diff.ts`: `latestReviewsPerAgent(reviews: ReviewRecord[])` (mirror of server); `findingsByFile(reviews): Map<string, FindingRecord[]>` (dismissed included); `countsAsFinding(f) = !f.dismissed_at`; `filesWithFindings(paths, byFile): number`.
- Skills: frontend-ui-architecture, react-best-practices, security; tests + react-testing-library.
- Tests: latest-per-agent (null agent, summary ignored, unsorted); grouping; dismissed-only files not counted.
- Done when: `cd client && pnpm exec vitest run smart-diff` green.

### S6: Diff viewer — `DiffFindingApi`, file dot, line marker, inline + unmatched findings
- `findings.ts`: `DiffFindingApi { findings; show; renderFinding(f): ReactNode; severityLabel(s): string }`; `findingKey(f)` = `lineKey("RIGHT", f.start_line)`; `partitionFindings(findings, renderedKeys) → { matched, unmatched }` (modeled on `partitionThreads`); `topSeverity(list)` (most severe non-dismissed, else of all); `fs` styles (stripe, label, dot).
- `FileCard`: optional `findingApi`; `fileFindings` by path; partition against the `renderedKeys` from `keysForLine`; dot after the path when any finding counts (`aria-label`/`title` = `shell: diffViewer.fileHasFindings`), separate from the `MessageSquare` counter, visible even when `show` is false; per-line findings to `CodeLine` like `threadsForLine`; `<UnmatchedFindings>` after `OutdatedComments` when `show`.
- `CodeLine`: props `findings`, `findingApi`; when `show` and findings: left stripe `SEV[top].c`, right label `severityLabel(top)` in `SEV[top].c` on `SEV[top].bg`, then `<div style={cs.thread}>{findings.map(renderFinding)}</div>` before comment threads.
- `UnmatchedFindings`: footer like `OutdatedComments`, title `shell: diffViewer.unmatchedFindingsTitle` `{count}`; null when empty.
- `DiffViewer` passes `findingApi`; `index.ts` exports `type DiffFindingApi`. `shell.json → diffViewer`: `fileHasFindings`, `unmatchedFindingsTitle`. Without `findingApi` rendering is unchanged.
- Skills: frontend-ui-architecture, react-best-practices, security; tests + react-testing-library.
- Tests: `findings.test.ts` (partition matched/unmatched incl. LEFT-only line; `topSeverity` incl. all-dismissed); `FileCard.test.tsx` (dot present / absent for dismissed-only / absent without api; card + label under matching line; unmatched footer with count; `show:false` hides cards/labels/footer but keeps the dot; comment counter still works).
- Done when: `cd client && pnpm exec vitest run FileCard findings smoke` green.

### S7: `DiffTab/RoleGroup`
- `RoleGroup({ role, files, filesWithFindings, commenting?, findingApi? })`, `open` defaults to `!DEFAULT_COLLAPSED.has(role)`. Header = sticky clickable `button` (`top: ROLE_HEADER_STICKY_TOP`, z-index below 5): chevron, role color square, `t(labelKey)` + `t(hintKey)`, right `● N` (N>0 only) + `smartDiff.filesCount`. Body: `<DiffViewer files commenting findingApi />`.
- `constants.ts`: `ROLE_META` (labelKey, hintKey, CSS-var color), `DEFAULT_COLLAPSED = {docs, boilerplate}`, `ROLE_HEADER_STICKY_TOP`.
- `prReview.json → smartDiff`: `testsLabel`, `docsLabel`, `coreHint`…`boilerplateHint`, `filesWithFindings`.
- Skills: frontend-ui-architecture, react-best-practices, next-best-practices, security; tests + react-testing-library.
- Tests: label/hint/"N files"; `● 2` vs none for 0; docs collapsed → click expands; core open.
- Done when: `pnpm exec vitest run RoleGroup` green.

### S8: `DiffTab` — order switch, findings wiring, header, empty state
- Hooks: `usePrComments`, `useCreatePrComment`, `usePrReviews`, `useSmartDiff`, `useFindingAction`. `latest = latestReviewsPerAgent(reviews ?? [])`, `byFile = findingsByFile(latest)`.
- `findingApi.renderFinding = f => <FindingCard f defaultExpanded onAction={a => action.mutate({ findingId: f.id, action: a, prId })} pending={…} repoFullName headSha />`; `severityLabel = s => t(\`smartDiff.severity.${s}\`)`.
- Visibility: `showOverride: boolean | null`, `show = showOverride ?? activeFindingCount > 0`; button toggles, posting sets true; count = comments + active findings; text `smartDiff.showAnnotations` / `hideAnnotations`; `commenting.showComments = show`.
- Order: `"smart" | "original"` state; `effective = order === "smart" && smart.data ? "smart" : "original"`; two ghost buttons in `role="group"`.
- Header: `smartDiff.reviewerOrdered` + `+A −D`. Empty state `smartDiff.noReviewYet` when no latest reviews.
- Smart body: `groupFilesByRole(groups, files).map(g => <RoleGroup … filesWithFindings={…} />)`; Original: `<DiffViewer files commenting findingApi />`.
- `helpers.ts`: `groupFilesByRole(groups, files)` — PrFile by path in group order, unknown paths skipped, orphans appended to core (core created first if absent).
- `page.tsx`: `repoFullName`, `headSha={pr.head_sha}` on `<DiffTab>`.
- `prReview.json → smartDiff`: `smartOrder`, `originalOrder`, `reviewerOrdered`, `noReviewYet`, `showAnnotations`, `hideAnnotations`, `severity: { CRITICAL: "blocker", WARNING: "warning", SUGGESTION: "suggestion" }`.
- If `DiffTab.tsx` grows past ~200 lines → derived values into `DiffTab/useDiffFindings.ts`.
- Skills: frontend-ui-architecture, react-best-practices, next-best-practices, security; tests + react-testing-library.
- Tests: `helpers.test.ts`; `DiffTab.test.tsx` (`vi.mock("@/lib/hooks/reviews")`): (a) group DOM order, lock in collapsed boilerplate; (b) finding on `src/config.ts:11` → core `● 1`, card renders, Accept → `mutate({findingId, action:"accept", prId})`; (c) Original order = `files` order, no headers; (d) smart-diff loading/error → original; (e) no reviews → `noReviewYet`, no `●`; (f) Hide hides the card, count = comments + active findings; (g) dismissed muted, not counted.
- Done when: `cd client && pnpm typecheck && pnpm test` green.

### S9: Docs
- `server/src/modules/reviews/AGENTS.md` Gotcha: Smart Diff (`smart-diff/`, spec) — pure `classifyFile` (rule order vs `ROLE_ORDER`), `GET /pulls/:id/smart-diff` = pr_files + latest `kind='review'` per agent, dismissed excluded, no LLM/GitHub.
- `client/src/components/AGENTS.md`: `diff-viewer/` bullet + optional `DiffFindingApi` (`renderFinding`, `severityLabel`).

## Runs
| Run | Steps | Ends green on |
|---|---|---|
| R0 | S0 | clean `git status` apart from spec/plan; `cd server && pnpm typecheck` runs |
| R1 | S1–S4 | server `pnpm typecheck && pnpm test && pnpm arch:check` · client `pnpm typecheck` · `brief.ts` diff empty |
| R2 | S5–S9 | client `pnpm typecheck && pnpm test` |

## Contract changes
`SmartDiffRole`: `['core','wiring','boilerplate']` → `['core','tests','wiring','docs','boilerplate']` (server copy, then client copy). Reused: `SmartDiff`, `SmartDiffGroup`, `SmartDiffFile`, `SmartDiffResponse`.

## Verification
- server: `pnpm typecheck && pnpm test && pnpm arch:check`
- client: `pnpm typecheck && pnpm test`
- `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` empty
- Manual (`./scripts/dev.sh`, seeded PR #482): groups in order, lock in collapsed boilerplate; CRITICAL on `src/config.ts:12` → stripe, "blocker", card under line 12; Accept/Dismiss work, Dismiss drops `●`; Original order = GitHub; network shows only `GET /smart-diff`; sticky header not hidden under `PrDetailHeader`.
- e2e (optional): `./scripts/e2e.sh`.

## Acceptance criteria
- [ ] Groups in order core → tests → wiring → docs → boilerplate, label + file count (S3, S7, S8)
- [ ] Lock file in boilerplate; docs/boilerplate collapsed (S2, S7, S8)
- [ ] Group header counts files with findings after a review (S5, S8)
- [ ] File dot distinct from the comment counter (S6)
- [ ] Finding card under its line with severity/title/rationale; Accept/Dismiss work (S6, S8)
- [ ] Original order restores GitHub order (S8)
- [ ] Classifier table incl. 3 disputed cases; route passes `SmartDiff.parse`; `brief.ts` identical; no LLM call (S1, S2, S4)

## Risks
- Sticky header overlap with `PrDetailHeader` (sticky top 0, z 5, variable height) — `ROLE_HEADER_STICKY_TOP`, tune manually (unverified).
- First module route with `response:` schema → mismatch = 500; covered by it-test + unit parse.
- Server/client latest-per-agent duplication — same test cases on both sides.
- `useSmartDiff` not refreshed after a run — only `finding_lines` goes stale, the UI doesn't use it.
- Root-prefix globs: `client/dist/x.js` → core (literal approved list).
- Installing deps must not churn lockfiles.

## Out of scope
Pseudocode summaries, PR split suggestions, LLM classification; Agent runs changes, DB/migrations, L08 pre-prompt filter; moving `ReviewService` off `Container`.

## Open questions (non-blocking, assumptions taken)
1. `severityLabel` added to `DiffFindingApi` (diff-viewer reads only `shell`; labels stay in `prReview.json`).
2. Server `finding_lines` excludes dismissed findings (matches the client counters).
3. `lib/smart-diff.ts` kept at the approved location; `groupFilesByRole` in `DiffTab/helpers.ts`.
4. `page.tsx` gets `repoFullName` + `headSha` so FindingCard's file:line link works.
5. File dot and `● N` stay visible when annotations are hidden.
