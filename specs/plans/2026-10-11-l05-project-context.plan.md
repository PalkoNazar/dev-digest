# Plan: SPEC-01 Project Context (L05)
Status: ready · Date: 2026-10-11 · Branch: feat/l05-project-context · Packages: reviewer-core, server, client
Spec: `specs/L05-project-context.md` (SPEC-01, approved) · Execution: ask-user · Round: 1

## Goal
When the plan is done, the user can see and read every Markdown document of the active repo on a new Project Context page. They can attach documents to an agent (in order, with token estimates and inherited skill documents) and to a skill on new Context tabs. Every review run injects the full text of the effective document list as untrusted blocks under `## Project context`, with the 20k per-document and 60k total limits. The run trace lists the injected documents and shows each one's injected text. This covers the spec's Goals 1–5; the Non-goals (onboarding, PR brief, editing, RAG, conformance, head-branch versions, MCP tools, CI runner) stay out.

## Context read
- `CLAUDE.md`: contract first, edit both `vendor/shared` copies, adapters only through the container, scope by `workspaceId`, never hand-edit migrations, never weaken `groundFindings` or `INJECTION_GUARD`.
- `INSIGHTS.md` (root), "new fields on the stored trace contract must be nullish": `RunTrace.project_context` is `.nullish()`. This makes AC-55 parse.
- `INSIGHTS.md` (root), "server and reviewer-core `typecheck` skip test files": test steps can't count on typecheck. Only vitest runs prove them.
- `server/INSIGHTS.md`, "don't wrap best-effort pre-work in `RunLogger.step`" and "NEVER store or show a raw LLM provider error": S7 writes its own Live Log lines and redacts errors.
- `server/INSIGHTS.md`, "review it-tests hit REAL GitHub/OpenRouter": the S7 it-test must pass the `MockSecretsProvider` and `MockGitHubClient` overrides.
- `server/INSIGHTS.md`, "`tsx watch` does not restart on reviewer-core edits": restart the server before the smoke.
- `server/INSIGHTS.md`, arch:check baseline entries: never run `arch:baseline`.
- `server/src/modules/AGENTS.md` and `reviews/AGENTS.md`: cross-module data goes through `container.<x>`. Every run exit path must complete. Live Log lines carry paths and counts, never document text. Enrichment is best-effort and never fails a run.
- `repo-intel/AGENTS.md`: the real resync route is `POST /repos/:id/resync`. The incremental pipeline touches `updated_at` even when nothing changed (`pipeline/incremental.ts:6,97`).
- `client/AGENTS.md` and `client/INSIGHTS.md`: next-intl, the `@devdigest/ui` barrel, ICU plural with `t.rich`, no `onError` toast in hooks (the global MutationCache shows it), tests use `fireEvent` with `vi.mock("@/lib/hooks/…")` and `import { describe… } from "vitest"`, vitest can't filter by a bracketed path.
- Spec: every AC from AC-1 to AC-55 (AC-10 is removed) is planned here. Designs 01, 02 and 04 were viewed.
- `.claude/skills/pr-self-review/references/routing.md` is the source of the skills listed on each step.
- The groundwork, checked in the code:
  - `reviewer-core/src/prompt.ts:118-148`: the `specs` slot labels blocks `spec-${i}`. `wrapUntrusted` does **not** escape the label.
  - `run-executor.ts:348`: `specs_read: []`, and `specs` is never passed.
  - `contracts/trace.ts`: has `specs_read` and `prompt_assembly.specs`.
  - `TraceBody.tsx:59-70,113`: has the "Specs read" row and the specs PromptBlock.
  - `client/src/lib/hooks/core.ts:123-136`: `useContextFiles` and `useReindexContext` call routes that don't exist and are used nowhere.
  - `contracts/platform.ts:256-270`: `SpecFile` and `IndexStatus` are unused on the server.
  - `GitClient.showFile` (`simple-git.ts:143`) is safe to use (it validates the ref and path). `GitClient.readFile` reads the filesystem with no `..` check, so the plan doesn't use it.
  - `repo-intel/constants.ts:17`: `EXCLUDED_DIRS` matches AC-1 exactly.
  - Token estimates exist in `client/src/lib/token-estimate.ts` and reviewer-core `estTokens`.
  - `client/src/components/app-shell/helpers.ts:30` already maps `/context` to the nav key `"context"`.
  - The `@devdigest/ui` `Markdown` (react-markdown 9, no rehype-raw) doesn't render raw HTML.
  - Agents and skills are hard-deleted (`agents/repository.ts:90`, `skills/repository.ts:232`), so an FK cascade covers AC-44.
  - The MCP review tool calls the same `POST /pulls/:id/review` (`mcp/src/api/http.ts:115`).
- `git status`: main, with only the untracked `.claude/settings.json`.

## Requirements review
| Req | Finding | Kind | Went to |
|---|---|---|---|
| AC-32, EC-13 | Labels are `spec-i`, not paths, and `wrapUntrusted` puts the label into `source="…"` unescaped. A path with `"`, `>` or a newline could break the delimiter. | conflict with code | S2 (escape the label in `wrapUntrusted`) |
| AC-1, AC-34, AC-41 | Walking the filesystem needs realpath checks and reads the working tree. Git objects (`ls-tree` plus `show HEAD:`) give "default branch as of the last sync" and never follow a symlink on disk. | better way | R1 |
| AC-1 vs AC-41 | Symlinked `.md` files whose target is inside the repo (this repo has `CLAUDE.md` → `AGENTS.md` everywhere) must be listed by AC-1. Symlinks pointing outside must not be. | ambiguity (how) | Q1 (non-blocking, assumed A) |
| AC-26 | A "≈ N tok" on every row means reading every listed document each time a tab opens. | better way | R2 |
| AC-45 | An optimistic update with rollback adds complexity. A non-optimistic save already "returns to the stored state". | simpler | R3 |
| AC-9, AC-27 | The page needs "resync then re-list" and a "last sync" time. The repo-intel resync, the index-state poll and BlastRadiusCard's completion check already exist. | reuse | R4 |
| AC-11–AC-25, AC-30 | Attachment routes could go into the agents and skills modules, or into one module that owns both tables and the run-time resolution. | reuse / simpler | R5 |
| AC-37 | It's not stated whether the truncation marker counts toward the 60,000-character budget. | ambiguity (number) | Q2 (non-blocking, assumed: it does not count) |
| AC-24 | It's not stated whether the skill tab's T applies the AC-36/37 limits. | ambiguity | Q3 (non-blocking, assumed: yes, same function as the run) |
| AC-5 | It's not stated whether disabled agents count toward "Used by N agents". | ambiguity | Q4 (non-blocking, assumed: all workspace agents) |
| NFR Cost | In `map-reduce` mode, reviewer-core sends the same prompt parts (skills today, documents too) with every per-file call, so the cost is k×T, not T. | ambiguity (what, minor) | Risks. Planned as per-call, the same as skills. The default strategy is single-pass. |
| AC-38 | MCP uses the same route and executor, so there is nothing to build. | — | covered by S7 |
| AC-39 | The list is resolved before `reviewPullRequest` and passed by value. It holds by construction. | — | S7 |

## Recommendations
### R1 · safer · header: Git objects
List with a new `GitClient.listTree(repo, 'HEAD')` (`git ls-tree -r -l -z --full-tree`) and read with the existing `showFile(repo, 'HEAD', path)`. Keep blobs with modes 100644/100755. Submodules (160000) are dropped. Symlinks (120000) are resolved inside the tree only (see Q1). The service never reads the filesystem, so no on-disk symlink can escape the clone (AC-41). HEAD is the default branch after a clone or `sync()` (`simple-git.ts:97`), which matches AC-34, and `fetchPullHead` never moves it. Trade-off: one new port method and its mock. Uncommitted changes in the clone are invisible, which is fine because the clone is a read-only mirror. → planned as the default in S4–S6.
- accept / reject / edit

### R2 · cheaper · header: Row tokens
The per-row "≈ N tok" is `ceil(blobSize/4)` from `ls-tree -l` for rows that aren't read. Rows in the effective list (which are read anyway for T) use `ceil(chars/4)` of the real text. T (AC-17/24) always comes from the real text after the limits. Trade-off: a non-ASCII document that isn't attached shows a slightly higher row estimate. → planned in S5/S6.
- accept / reject / edit

### R3 · simpler · header: No optimism
The Context tabs save the whole ordered path list with `PUT`. The checkbox shows the server's answer (`setQueryData` on success), and controls are disabled while a save is pending. If a save fails, the cached view is never changed and the global MutationCache shows the toast, which satisfies AC-45. Trade-off: each click waits one local round-trip before the UI updates. → planned in S8/S10.
- accept / reject / edit

### R4 · reuse · header: Resync reuse
Refresh (AC-9) is `useResyncRepoIntel`, then a poll of `useRepoIntelStatus` until `updatedAt` moves, then a refetch of the list. This is BlastRadiusCard's pattern. `resyncFinished` and `RESYNC_TIMEOUT_MS` move to `client/src/lib/repo-resync.ts` because this is their second user. The footer's "last sync" (AC-27) is the index-state `updatedAt`, shown as "never" when it is epoch 0. Trade-off: "last sync" really means the last index-state write. A sync that fails shows up only as a timeout after 120 s. → planned in S8/S9.
- accept / reject / edit

### R5 · reuse · header: One module
A new `server/src/modules/project-context/` owns both attachment tables and every route (`/repos/:id/context…`, `/agents/:id/context`, `/skills/:id/context`). It reads effective skills through `container.agentsRepo.effectiveSkills` (the L02 rule, AC-30) and is exposed as `container.projectContext` for `run-executor.ts`, following the `container.repoIntel` precedent. The agents and skills modules stay untouched, and AC-44 comes from an FK cascade. Trade-off: the agent and skill Context routes live outside their own modules. → planned in S3/S6/S7.
- accept / reject / edit

## Constraints
- Contract first, then server, then client, in both `server/src/vendor/shared` and `client/src/vendor/shared`. Source: `CLAUDE.md` Rules/Gotchas. Exception: `GitClient.listTree` goes only into the server `adapters.ts`, because it is a server-only port and the client copy already lacks `sync` and `diffNameOnly` (root `INSIGHTS.md`, "copies have drifted").
- New `RunTrace` fields are `.nullish()`. Source: root `INSIGHTS.md`.
- Module shape: `routes.ts` → `service.ts` (`…Deps` from `ports.ts`, never `Container`) → `repository.ts`, plus pure `helpers.ts`/`constants.ts`. Modules never import each other, so `EXCLUDED_DIRS` is copied with a comment pointing at `repo-intel/constants.ts`. Source: skill `onion-architecture`, `server/src/modules/AGENTS.md`.
- Drizzle only in `repository.ts`. Attachment rows are scoped through their parent (`agents.workspaceId` / `skills.workspaceId`), and the repo is checked against `workspaceId`. Source: `CLAUDE.md`, skill `onion-architecture` (references/drizzle.md).
- The migration comes only from `pnpm db:generate`, then `pnpm db:migrate`. Two new tables mean no rename prompt. Source: `CLAUDE.md` "Do not touch", `server/INSIGHTS.md` (drizzle-kit prompt).
- `INJECTION_GUARD` text stays byte-identical (AC-33) and `groundFindings` is untouched (Non-goal, EC-19). Escaping the label only strengthens `wrapUntrusted`. Source: `CLAUDE.md`.
- Loading project context never fails a run: on error, log a redacted Live Log line and continue. Log lines carry paths only, never document text, and don't use `RunLogger.step`. Source: `reviews/AGENTS.md`, `server/INSIGHTS.md`.
- Server tests go flat in `server/test/`, and anything that uses `helpers/pg.ts` is named `*.it.test.ts`. reviewer-core runs through npm (`check.sh` handles it). Source: `server/AGENTS.md`, `CLAUDE.md`.
- `pnpm arch:check` stays green and `arch:baseline` is never run. Source: `server/AGENTS.md`, `server/INSIGHTS.md`.
- Client rules:
  - Server calls go only through hooks in `lib/hooks/<domain>.ts`, exported from `lib/hooks/index.ts`. Source: skill `frontend-ui-architecture`.
  - Strings go in `messages/en/*.json`, counts use ICU plural with `t.rich`, and UI comes only from the `@devdigest/ui` barrel. Source: `client/AGENTS.md`, `client/INSIGHTS.md`.
  - A component used by two routes (`/agents/[id]`, `/skills`) goes in `src/components/<kebab>/`. Source: skill `frontend-ui-architecture`.

## Affected modules
| Package | File | Action |
|---|---|---|
| server+client | `server/src/vendor/shared/contracts/platform.ts`, `client/src/vendor/shared/contracts/platform.ts` | edit |
| server+client | `server/src/vendor/shared/contracts/trace.ts`, `client/src/vendor/shared/contracts/trace.ts` | edit |
| server | `server/src/vendor/shared/adapters.ts` | edit (GitClient.listTree) |
| reviewer-core | `reviewer-core/src/prompt.ts`, `reviewer-core/src/review/run.ts` | edit |
| server | `server/src/db/schema/context.ts` | edit |
| server | `server/src/db/migrations/<generated>` | generated |
| server | `server/src/adapters/git/simple-git.ts`, `server/src/adapters/mocks.ts` | edit |
| server | `server/src/modules/project-context/{constants,helpers,ports,repository,service,routes}.ts` | new |
| server | `server/src/modules/index.ts`, `server/src/platform/container.ts` | edit |
| server | `server/src/modules/reviews/run-executor.ts` | edit |
| client | `client/src/lib/hooks/context.ts` (new), `client/src/lib/hooks/core.ts`, `client/src/lib/hooks/index.ts`, `client/src/lib/types.ts` | new / edit |
| client | `client/src/lib/repo-resync.ts` (new); `…/BlastRadiusCard/{BlastRadiusCard.tsx,helpers.ts,constants.ts}` | new / edit (promotion) |
| client | `client/src/vendor/ui/nav.ts`, `client/src/vendor/ui/nav.test.ts` | edit |
| client | `client/src/app/repos/[repoId]/context/page.tsx`, `…/context/_components/ProjectContextView/*` | new |
| client | `client/src/components/context-docs/*` | new |
| client | `client/src/app/agents/[id]/_components/AgentEditor/{constants.ts,AgentEditor.tsx}`, `…/AgentEditor/_components/ContextTab/*` | edit / new |
| client | `client/src/app/skills/_components/SkillDetail/{constants.ts,SkillDetail.tsx}`, `client/src/app/skills/_components/SkillContextTab/*` | edit / new |
| client | `…/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`, `…/RunTraceDrawer/_components/SpecsPromptBlock/*` | edit / new |
| client | `client/messages/en/{context,agents,skills,runs}.json` | edit |

## Steps
### S1: Contracts (both copies)
- Package: server+client · Depends on: none · Covers: AC-1, AC-2, AC-5, AC-11–AC-26, AC-40, AC-50–AC-55
- Files: `server/src/vendor/shared/contracts/platform.ts`, `client/src/vendor/shared/contracts/platform.ts`, `server/src/vendor/shared/contracts/trace.ts`, `client/src/vendor/shared/contracts/trace.ts` (all edit)
- Change:
  - `platform.ts`, "Project Context" section. Rework the unused `SpecFile` into `{ path: string, category: string, size: int, tokens: int, used_by: int, content: string.nullish() }` and drop `updated_at`. Leave `IndexStatus` untouched.
  - Add `ContextDocState = z.enum(['attached','inherited','available','missing'])`.
  - Add `ContextDocRow = { path, category, tokens: int, state: ContextDocState, via: z.array(z.string()) }`.
  - Add `ContextAttachments = { repo_id: uuid, rows: ContextDocRow[], attached: int, total: int, tokens: int }`.
  - Add `ContextAttachInput = { repo_id: z.string().uuid(), paths: z.array(z.string().min(1).max(1024)).max(500) }`.
  - `trace.ts`: add `TraceSpecDoc = { path, status: z.enum(['injected','truncated','omitted']), text: z.string().nullish(), tokens: z.number().int().nullish() }` and `RunTrace.project_context: z.array(TraceSpecDoc).nullish()`. Leave `specs_read` as is.
  - Export the types with `z.infer`.
- Skills: zod, onion-architecture, security
- Tests: extend `server/test/contracts.test.ts`. Cases: a RunTrace without `project_context` parses (AC-55); one with truncated and omitted entries parses; `ContextAttachInput` rejects an empty path, a non-uuid `repo_id` and more than 500 paths.
- Tests-first: no
- Done when: both copies are identical for these symbols (`diff` shows only pre-existing drift), and server and client typecheck.

### S2: reviewer-core: path-labelled untrusted spec blocks
- Package: reviewer-core · Depends on: none · Covers: AC-31, AC-32, AC-33, EC-12, EC-13
- Files: `reviewer-core/src/prompt.ts`, `reviewer-core/src/review/run.ts` (edit)
- Change:
  - `PromptParts.specs` and `ReviewInput.specs` become `{ path: string; text: string }[]`.
  - `specsBlock` = `parts.specs.map(s => wrapUntrusted(s.path, s.text)).join('\n\n')`. The order is the list order, and the section position (after Repo skeleton, before Callers and Diff) is unchanged.
  - `wrapUntrusted` escapes the label: `&`→`&amp;`, `"`→`&quot;`, `<`→`&lt;`, `>`→`&gt;`, and CR/LF/tab and other control characters become a space. The content handling of `</untrusted>` stays.
  - `INJECTION_GUARD` is not edited.
  - Update the doc comments ("spec chunks" becomes "attached repo documents").
- Skills: onion-architecture, security, zod (content row only if a schema is added; none expected)
- Tests: extend `reviewer-core/test/prompt.test.ts`. Cases:
  - Two docs render under `## Project context` in order, as `<untrusted source="specs/a.md">`, and the section comes before `## Diff to review`.
  - A path containing `"`, `>` or `\n` yields one `source="…"` attribute with no raw `"`, `<` or newline (EC-13).
  - Content containing `</untrusted>` is neutralised.
  - `specs` undefined, `[]` and absent all produce byte-identical `messages` (AC-33).
  - The existing guard tests stay green.
- Tests-first: yes
- Done when: `./scripts/check.sh reviewer-core server` is green. The server compiles reviewer-core source and `run-executor` doesn't pass `specs` yet.

### S3: DB tables for attachments
- Package: server · Depends on: none · Covers: AC-13–AC-15, AC-23, AC-44, EC-9, EC-21
- Files: `server/src/db/schema/context.ts` (edit), `server/src/db/migrations/*` (generated)
- Change:
  - Add `agentContextDocs` (`agent_context_docs`): `agentId` uuid FK `agents.id` onDelete cascade, `repoId` uuid FK `repos.id` onDelete cascade, `path` text notNull, `order` integer notNull default 0. PK is (agentId, repoId, path), plus an index on (repoId).
  - Add `skillContextDocs` (`skill_context_docs`): the same with `skillId` FK `skills.id` cascade.
  - Import `agents` from `./agents` and `skills` from `./skills`.
  - Run `cd server && pnpm db:generate`, then `pnpm db:migrate`. Ignore the NOTICE noise and trust the exit code.
- Skills: onion-architecture, drizzle-orm-patterns, postgresql-table-design, security
- Tests: none here, because it has no behaviour of its own. The cascade (AC-44) is checked in S6's it-test.
- Tests-first: no
- Done when: one new migration file creates the two tables with the FKs, and `db:migrate` exits 0.

### S4: GitClient.listTree (adapter + mock)
- Package: server · Depends on: none · Covers: AC-1, AC-34, AC-41, EC-14 (R1)
- Files: `server/src/vendor/shared/adapters.ts` (edit, server copy only, see Constraints), `server/src/adapters/git/simple-git.ts` (edit), `server/src/adapters/mocks.ts` (edit)
- Change:
  - Add `GitTreeEntry { path: string; mode: string; size: number | null }` and `GitClient.listTree(repo: RepoRef, ref: string): Promise<GitTreeEntry[] | null>`.
  - `SimpleGitClient.listTree`: return null when there is no `.git` or `!isSafeRef(ref)`. Run `raw(['ls-tree','-r','-l','-z','--full-tree', ref])`. Parse each NUL record `<mode> <type> <sha> <size>\t<path>` and keep only `type === 'blob'` (symlinks are blobs with mode 120000; submodules are `commit` and get dropped). Git errors propagate.
  - `MockGitClient`: add `MockGitOptions.tree?: GitTreeEntry[]`. By default derive entries from the `filesAtRef` keys (mode `100644`, size = text length). Record calls in a `listed` array.
- Skills: onion-architecture, security
- Tests: new `server/test/git-list-tree.test.ts`, using real git in an `os.tmpdir()` repo built with simple-git and a `-c user.email`/`user.name` commit. The fixture has `README.md`, `docs/a.md`, `node_modules/x/y.md`, a symlink `CLAUDE.md -> README.md` and a symlink `out.md -> /etc/hosts`. Cases:
  - All entries come back with their modes, and symlinks have `120000`.
  - `showFile(repo,'HEAD','out.md')` returns the link text `/etc/hosts`, not that file's content.
  - A repo with no clone returns null.
- Tests-first: yes
- Done when: the test passes and `./scripts/check.sh server` is green.

### S5: project-context pure core (helpers + constants)
- Package: server · Depends on: S1 · Covers: AC-1, AC-2, AC-5, AC-16, AC-17, AC-30, AC-36, AC-37, AC-42, AC-46, AC-47, AC-21, EC-1, EC-5–EC-8
- Files: `server/src/modules/project-context/constants.ts` (new), `server/src/modules/project-context/helpers.ts` (new)
- Change:
  - `constants.ts`:
    - `EXCLUDED_DIRS`, a copy with a comment pointing to `repo-intel/constants.ts` and AC-1.
    - `MAX_DOC_CHARS = 20_000` and `MAX_TOTAL_CHARS = 60_000`.
    - `DOC_REF = 'HEAD'`.
    - `truncationMarker(total: number)`, which returns `\n\n[… truncated by DevDigest: first 20,000 of N characters]`.
  - `helpers.ts`, all pure:
    - `discoverDocs(entries, readLink?)`: keeps `/\.md$/i` with no path segment in `EXCLUDED_DIRS` and modes 100644/100755. A 120000 entry is kept only if `resolveTreeLink(linkPath, target)` normalises to a regular blob inside the tree. One hop; a target that leaves the root or is absolute is dropped (Q1 = A).
    - `categoryOf(path)` returns the top folder, or `'root'`.
    - `estTokens(chars)` returns `ceil(chars/4)`.
    - `effectiveDocList(own: string[], skills: {name: string; paths: string[]}[])` returns `{path, own, via: string[]}[]`. Own paths come first in their order, then skill paths in skill order, each path once at its first position; `via` collects every skill name that carries the path.
    - `fitDocs(docs: {path,text}[])` returns `{ injected: {path,text,truncated}[], omitted: string[] }`. A text over 20k becomes `slice(0,20k)` plus the marker. Then the last documents are dropped while the sum of document characters (marker excluded, Q2) is over 60k.
    - `buildAgentRows(discovered, own, effective)` follows the AC-16 order:
      - Effective rows come first, in prompt order.
      - A row that is own and discovered is `attached`, with `via` set to the skills that also carry it (AC-46).
      - A row that is own but not discovered is `missing`.
      - A row that only comes from skills is `inherited` (AC-42).
      - The remaining documents are `available`, sorted alphabetically.
    - `buildSkillRows(discovered, own)` does the same with no inherited rows.
    - `usedByCounts(effectivePathsPerAgent: string[][])` returns a `Map<path, n>`.
- Skills: onion-architecture, security
- Tests: new `server/test/project-context-helpers.test.ts`. Cases:
  - Exclusions at any depth.
  - `.md` filter.
  - Symlink inside the tree is kept, symlink outside is dropped, submodule is dropped.
  - Category `root`.
  - Dedupe at the first position, and EC-7 gives `attached` plus `via`.
  - After the own path is removed, the same document is `inherited` (AC-47).
  - 25k text becomes 20k plus the marker with `truncated: true`.
  - [30k, 20k, 15k, 10k] keeps three documents, omits the last, and reports `omitted` in list order.
  - Exactly 3×20k truncated documents fit.
  - Row ordering and alphabetical tail.
  - Used-by counts.
- Tests-first: yes
- Done when: the helper tests pass and the new module has no imports outside shared and its own files.

### S6: project-context module: ports, repository, service, routes, container
- Package: server · Depends on: S1, S3, S4, S5 · Covers: AC-1–AC-9 (server side), AC-11–AC-17, AC-21–AC-24, AC-26, AC-40, AC-41, AC-44, EC-3, EC-4, EC-9, EC-20, EC-21 (R1, R2, R5)
- Files: `server/src/modules/project-context/ports.ts`, `repository.ts`, `service.ts` and `routes.ts` (all new); `server/src/modules/index.ts` (edit, one import plus one entry); `server/src/platform/container.ts` (edit)
- Change:
  - `ports.ts`:
    - `ContextRepo`. Every method is scoped by `workspaceId`, with child rows joined through `agents`/`skills`:
      - `findRepo(ws, repoId) → {id, owner, name} | null`
      - `agentExists(ws, id)` and `skillExists(ws, id)`
      - `agentDocs(ws, agentId, repoId) → string[]` and `skillDocs(ws, skillId, repoId) → string[]`
      - `setAgentDocs(ws, agentId, repoId, paths)` and `setSkillDocs(…)`, each one transaction: delete, then insert with `order` = index
      - `skillDocsFor(ws, skillIds, repoId) → Map`
      - `agentIds(ws)`
      - `agentDocsByRepo(ws, repoId) → Map`
    - `EffectiveSkillsSource { effectiveSkills(agentId): Promise<{id: string; name: string}[]> }`.
    - `DocSource { listTree; showFile }`.
    - `ProjectContextDeps { repo, skills, git }`.
  - `service.ts` (`ProjectContextService`):
    - `listDocs(ws, repoId): SpecFile[]`. Throws NotFoundError for an unknown repo. Throws `ConflictError` ("no local clone yet, import or resync the repo") when `listTree` returns null (AC-8). A git error becomes `ExternalServiceError` with a redacted message. `tokens` follow R2, and `used_by` comes from every agent's effective list for this repo (Q4).
    - `readDoc(ws, repoId, path)` returns a `SpecFile` with `content` read through `showFile(DOC_REF)`. A path that wasn't discovered gives NotFoundError (AC-41).
    - `agentView(ws, agentId, repoId): ContextAttachments`, where `tokens` (T) = the sum of `estTokens` over `fitDocs` of the effective list's texts (AC-17), and `attached` = the count of own rows, missing ones included (AC-12).
    - `setAgentDocs(ws, agentId, repoId, paths)` validates that the agent and repo exist in the workspace, that there are no duplicates, and that each path is discovered **or already stored** for this owner and repo, so missing documents survive a reorder until they are detached. Otherwise it throws `ValidationError` and stores nothing (AC-40, EC-20). It returns the fresh view.
    - `skillView` and `setSkillDocs` mirror these (T uses `fitDocs` too, Q3).
    - `forRun(ws, agentId, repoId)` returns `{ injected, omitted, skipped }`. It reads every effective path at `DOC_REF`; `null` or an error puts the path in `skipped` (AC-35), and the rest go through `fitDocs`.
  - `repository.ts` (`ProjectContextRepository implements ContextRepo`, Drizzle only).
  - `routes.ts`, each handler doing `getContext` and then one service call, with response schemas from S1:
    - `GET /repos/:id/context` returns `SpecFile[]`.
    - `GET /repos/:id/context/file?path=` returns a `SpecFile`.
    - `GET /agents/:id/context?repo_id=` and `PUT /agents/:id/context` (body `ContextAttachInput`) return `ContextAttachments`.
    - `GET /skills/:id/context?repo_id=` and `PUT /skills/:id/context` return `ContextAttachments`.
    - The query schemas are local to `routes.ts`, like blast's `RepoPullNumberParams`.
  - `container.ts`: a lazy getter `projectContext` builds `new ProjectContextService({ repo: new ProjectContextRepository(this.db), skills: this.agentsRepo, git: this.git })`, and routes use `app.container.projectContext`.
- Skills: onion-architecture, fastify-best-practices (routes.ts), drizzle-orm-patterns (repository.ts), zod, security
- Tests:
  - New `server/test/project-context-service.test.ts`, with hand-written fakes plus `MockGitClient`. Cases:
    - A null tree gives ConflictError (AC-8).
    - `../../etc/passwd` and an undiscovered path give ValidationError and `setAgentDocs` is not called (AC-40).
    - A stored missing path is accepted on reorder.
    - `forRun` skips an unreadable path (AC-35), reads with ref `'HEAD'` (checked through `MockGitClient.shown`, AC-34), never lists or reads an outside symlink (AC-41), and inherits from a skill but not from a disabled one (the fake `effectiveSkills` already applies the L02 rule, EC-8).
    - `used_by` counts.
  - New `server/test/project-context.it.test.ts`, using `buildApp` with pg and `MockGitClient` `filesAtRef`. Cases:
    - `PUT` then `GET` the agent view keeps the order (AC-13–AC-15).
    - A skill attachment appears on the agent view as `inherited` with `via` (AC-42) and as `attached` with `via` when also attached directly (AC-46).
    - Attachments are separate per repo (EC-9).
    - `DELETE /agents/:id` and `DELETE /skills/:id` remove their rows (AC-44).
    - An agent from another workspace or an unknown agent gives 404.
    - A bad path gives 422.
- Tests-first: yes (the service test, which covers AC-35, AC-40, AC-41 and EC-8). The it-test is written by the implementer.
- Done when: `./scripts/check.sh --it server` is green, including arch:check with no new violations.

### S7: Inject into review runs and the trace
- Package: server · Depends on: S2, S6 · Covers: AC-30, AC-31, AC-34–AC-39, AC-50, AC-53, AC-54 (data), EC-10, EC-17, EC-18, EC-22
- Files: `server/src/modules/reviews/run-executor.ts` (edit)
- Change:
  - Add a private `loadProjectContext(workspaceId, agent, repoId, runLog)` that calls `this.container.projectContext.forRun(...)` inside try/catch. On error it logs `Project context unavailable (<redactSecrets msg>) — reviewing without it` and returns empty.
  - Info lines (paths only):
    - one per skipped path: `Project context: skipped <path> (not readable)`
    - one per omitted path: `Project context: omitted <path> (over the 60,000-character budget)`
    - a summary: `Project context: N doc(s) — +T tokens`, or `Project context: none attached`
  - Call it in `runOneAgent` after `loadSkills`, so the list is captured once per run (AC-39).
  - Pass `...(ctx.injected.length > 0 ? { specs: ctx.injected.map(d => ({ path: d.path, text: d.text })) } : {})`.
  - Trace:
    - `specs_read` = the injected paths in order.
    - `project_context` = the injected entries (`status` `'truncated'` or `'injected'`, `text` as injected, `tokens` = `ceil(len/4)`), followed by the omitted entries (`status: 'omitted'`, `text: null`, `tokens: null`).
  - `traceFromBuffer` stays as is (failed runs show `none`).
  - No MCP change: the MCP tool posts to the same route (AC-38).
- Skills: onion-architecture, security
- Tests: extend `server/test/reviews.it.test.ts` (with the `MockSecretsProvider` and `MockGitHubClient` overrides). Cases:
  - Attach `specs/a.md`, a 25k `docs/big.md` and a path that is then missing from `filesAtRef`. The run's trace has `specs_read` = [a, big] in order, `big` with status `truncated`, and `prompt_assembly.user` containing `## Project context` and `<untrusted source="specs/a.md">`. The log has the "skipped" line, and no log line contains document text.
  - With no attachments, `prompt_assembly.specs` is null and `specs_read` is `[]`.
- Tests-first: yes
- Done when: `./scripts/check.sh --it server` is green.

### S8: Client data layer + resync helper promotion
- Package: client · Depends on: S1, S6 · Covers: AC-9, AC-13–AC-15, AC-45 (R3, R4)
- Files: `client/src/lib/hooks/context.ts` (new), `client/src/lib/hooks/core.ts` (edit: delete `useContextFiles`, `useReindexContext` and the now-unused imports), `client/src/lib/hooks/index.ts` (edit: `export * from "./context"`), `client/src/lib/types.ts` (edit: re-export the new types), `client/src/lib/repo-resync.ts` (new), `…/BlastRadiusCard/{helpers.ts,constants.ts,BlastRadiusCard.tsx}` (edit: move out `resyncFinished` and `RESYNC_TIMEOUT_MS`, import from `@/lib/repo-resync`; move their test cases too, if `helpers.test.ts` has any)
- Change:
  - `useContextDocs(repoId)` → `["context", repoId]`.
  - `useContextDoc(repoId, path)` → `["context-doc", repoId, path]`, enabled only when a path is set.
  - `useAgentContext(agentId, repoId)` and `useSkillContext(skillId, repoId)`.
  - `useSetAgentContext(agentId, repoId)` and `useSetSkillContext(...)`: `PUT` with `{ repo_id, paths }`, `scope: { id: 'agent-context-<id>' }`. `onSuccess` does `setQueryData` with the returned view and invalidates `["context", repoId]` (used_by). No `onMutate` and no `onError` toast.
- Skills: frontend-ui-architecture, react-best-practices, react-testing-library (test), typescript-expert (content row), security
- Tests: new `client/src/lib/hooks/context.test.tsx`. Cases:
  - The set mutation sends the PUT body and writes the response into the cache.
  - On a rejected PUT the cached view stays unchanged (AC-45).
- Tests-first: yes
- Done when: the client typecheck passes, nothing references the deleted hooks, and the BlastRadiusCard tests are green.

### S9: Nav item + Project Context page
- Package: client · Depends on: S8 · Covers: AC-1–AC-9, AC-27, EC-2, EC-3, EC-12
- Files:
  - `client/src/vendor/ui/nav.ts` and `nav.test.ts` (edit)
  - `client/src/app/repos/[repoId]/context/page.tsx` (new)
  - `client/src/app/repos/[repoId]/context/_components/ProjectContextView/{ProjectContextView.tsx,index.ts,styles.ts,helpers.ts,ProjectContextView.test.tsx}` (new; `helpers.ts` only if it has content)
  - `client/messages/en/context.json` (edit: replace the stale `.devdigest/specs/`, chunks and edit keys)
- Change:
  - Add the nav item `{ key: "context", label: "Project Context", icon: <an existing IconName, e.g. "FileText" — unverified>, href: "/repos/:repoId/context" }` under WORKSPACE after Pull Requests.
  - The page reads `repoId` and renders `ProjectContextView`, following the conventions page.
  - The view shows:
    - a list of paths with a category badge (text) (AC-1, AC-2)
    - on select, a preview pane with `<Markdown>` from `@devdigest/ui` (no raw HTML, AC-3/AC-4)
    - "Used by N agents" from `used_by`, as an ICU plural (AC-5)
    - a Skeleton while loading (AC-6)
    - an EmptyState with the AC-7 text
    - an ErrorState with Retry → `refetch` (AC-8)
    - a refresh button: resync, wait with `resyncFinished` and the timeout, then `refetch` (AC-9)
    - a footer with the count and last sync from `useRepoIntelStatus(repoId).updatedAt`, shown as "never" at epoch 0 (AC-27)
    - a friendly empty state from `useRepoNotFound`, like the other repo pages.
- Skills: frontend-ui-architecture, react-best-practices, next-best-practices, react-testing-library (test), security
- Tests: `ProjectContextView.test.tsx` (mocks `@/lib/hooks/context` and `@/lib/hooks/repo-intel`). Cases:
  - Loading shows no empty state.
  - The empty-state text.
  - Error, then Retry calls refetch.
  - A `README.md` row is labelled `root` and `specs/x.md` is labelled `specs`.
  - "Used by 2 agents".
  - Content with `<script>` and `<img onerror>` renders no `script` or `img` element.
  - The footer count.
  - Also, `nav.test.ts` asserts that `context` is in WORKSPACE.
- Tests-first: no
- Done when: the client tests pass and `/repos/<id>/context` is highlighted in the sidebar.

### S10: Shared context-docs panel
- Package: client · Depends on: S8 · Covers: AC-11, AC-18, AC-19, AC-21, AC-26, AC-28, AC-29, AC-42, AC-43, AC-46, AC-47 (render), EC-15
- Files: `client/src/components/context-docs/{ContextDocsPanel.tsx,index.ts,helpers.ts,styles.ts,ContextDocsPanel.test.tsx,helpers.test.ts}` and `client/src/components/context-docs/_components/DocPreviewModal/{DocPreviewModal.tsx,index.ts}` (all new); `client/messages/en/context.json` (edit)
- Change:
  - `ContextDocsPanel({ repoId, view, pending, onChange(paths) })`.
  - "Filter documents" input that matches the path case-insensitively (AC-18).
  - One row per `view.rows` entry:
    - a checkbox on `attached` and `available` rows only; `inherited` rows show "via <skills>" and can't be toggled (AC-42), and `attached` rows with `via` show "also via <skills>" (AC-46)
    - the path with ellipsis, its full text in `title`/the accessible name (AC-43)
    - a category Badge (text)
    - "≈ N tok" (AC-26)
    - a `missing` badge plus a Detach button (AC-21)
    - move-up and move-down buttons on attached rows (AC-28)
    - a Preview button that opens `DocPreviewModal` (`useContextDoc` plus `Markdown` in the `Modal` from `@devdigest/ui`, AC-19)
  - Every icon-only control's `aria-label` contains the path (AC-29), and controls are disabled while `pending`.
  - `helpers.ts`: `filterRows`, `ownPaths(rows)`, `togglePath`, `movePath(paths, path, -1|1)`, `detachPath`.
- Skills: frontend-ui-architecture, react-best-practices, react-testing-library (test), security
- Tests:
  - `helpers.test.ts` covers filter, toggle, move at the bounds and detach.
  - `ContextDocsPanel.test.tsx` covers: an inherited row has no checkbox and shows "via X"; detach on a missing row calls `onChange` without that path; move-down sends the swapped order; button names include the path; ticking an available row appends it.
- Tests-first: no
- Done when: the tests pass, and the component imports only from `@/lib`, `@devdigest/ui` and `@devdigest/shared`.

### S11: Agent and Skill Context tabs
- Package: client · Depends on: S10 · Covers: AC-11–AC-17, AC-20, AC-22–AC-25, AC-45, AC-47
- Files:
  - `client/src/app/agents/[id]/_components/AgentEditor/{constants.ts,AgentEditor.tsx}` (edit)
  - `…/AgentEditor/_components/ContextTab/{ContextTab.tsx,index.ts,styles.ts,ContextTab.test.tsx}` (new)
  - `client/src/app/skills/_components/SkillDetail/{constants.ts,SkillDetail.tsx}` (edit)
  - `client/src/app/skills/_components/SkillContextTab/{SkillContextTab.tsx,index.ts,helpers.ts,styles.ts,SkillContextTab.test.tsx}` (new)
  - `client/messages/en/{agents,skills,context}.json` (edit)
- Change:
  - Agent: add `{ key: "context", labelKey: "editor.tabs.context", … }` to `TABS` and render `ContextTab` for `tab === "context"`. `ContextTab` uses `useActiveRepo()`; with no repo it shows the import-or-select message (AC-20). The header shows "K of M attached" (AC-12) and the panel uses `useSetAgentContext`. The footer shows "≈ T tokens" (AC-17) and the "Injected as an untrusted block" note from design 02.
  - Skill: add `context` to `DETAIL_TABS` and render `SkillContextTab`, which shows "N attached" (AC-22), the panel, "≈ T tokens" (AC-24) and a "Serializes as" block. `helpers.ts` `serializesAs(paths)` returns `## Project context` followed by one line per attached path, in order (AC-25).
- Skills: frontend-ui-architecture, react-best-practices, next-best-practices, react-testing-library (test), security
- Tests:
  - `ContextTab.test.tsx`: no active repo shows the message and no list; "2 of 7 attached"; "≈ 317 tokens"; after a mocked save returns a view where the row is `inherited`, it shows "via X" (AC-47).
  - `SkillContextTab.test.tsx`: the "Serializes as" text and the order.
  - Extend the existing `AgentEditor.test.tsx` and `SkillDetail.test.tsx` only if they assert the tab list.
- Tests-first: no
- Done when: `?tab=context` opens each tab and the client tests are green.

### S12: Run trace: Specs read + Project context block
- Package: client · Depends on: S1 · Covers: AC-50–AC-55, EC-16
- Files: `…/RunTraceDrawer/_components/TraceBody/TraceBody.tsx` (edit), `…/RunTraceDrawer/_components/SpecsPromptBlock/{SpecsPromptBlock.tsx,index.ts}` (new), `…/RunTraceDrawer/RunTraceDrawer.test.tsx` (edit), `client/messages/en/runs.json` (edit)
- Change:
  - The "Specs read" row shows `specs_read` with a "truncated" tag taken from `project_context`, then omitted paths with an "omitted" tag. With nothing to show it displays `none` (AC-50, AC-54, AC-55).
  - Replace the `prompt_assembly.specs` PromptBlock with `SpecsPromptBlock`. It renders only when `project_context` has injected entries.
  - The block title comes from `trace.prompt.specs` = "Project context — attached specs (untrusted)" (AC-51). The meta is "N docs · +T tok", an ICU plural where T sums `tokens` (AC-52).
  - Each injected document is one expandable row showing its `text` in a `<pre>`, exactly as stored (AC-53), with its status tag.
- Skills: frontend-ui-architecture, react-best-practices, next-best-practices, react-testing-library (test), security
- Tests: extend `RunTraceDrawer.test.tsx`. Cases:
  - A legacy trace (no `project_context`, `specs_read: []`) renders, with "none" and no block.
  - A trace with 2 injected documents (one truncated) and 1 omitted shows the block title, "2 docs · +N tok", the expanded row text and the truncated and omitted tags.
- Tests-first: yes
- Done when: the client tests are green.

## Runs
| Run | Steps | Ends green on |
|---|---|---|
| R1 | S1–S4 | `./scripts/check.sh server reviewer-core client` |
| R2 | S5–S7 | `./scripts/check.sh --it server` |
| R3 | S8–S12 | `./scripts/check.sh client` |

## Contract changes
The order is: shared, server copy (S1); shared, client copy (S1, same step); reviewer-core `PromptParts`/`ReviewInput.specs` type (S2); server (S4–S7); client (S8–S12). `GitClient.listTree` is server copy only (see Constraints).

## Verification
- `./scripts/check.sh server client reviewer-core` covers typecheck, unit tests and arch:check.
- `./scripts/check.sh --it server` runs the Postgres it-tests (the attachment tables and the review run).
- `server/test/git-list-tree.test.ts` needs a `git` binary. It is included in the server unit run.
- Smoke, run by the calling session. Restart `./scripts/dev.sh` first (the tsx watch misses reviewer-core edits) and run `pnpm db:migrate`. On the DevDigest repo:
  1. Open `/repos/<id>/context`. `AGENTS.md` and `CLAUDE.md` (an in-tree symlink) should be listed, and nothing under `node_modules` or `client/src/vendor`. Open a document and check the Markdown preview.
  2. On Agents → <agent> → Context, attach two documents, reorder them and check "≈ T tokens".
  3. Attach one document to a skill the agent has enabled, and check the agent tab shows "via <skill>".
  4. Run the review on an open PR. In the trace, Specs read should list the paths in order, the "Project context — attached specs (untrusted)" block should show "N docs · +T tok", and each row should expand to the full text. Check the Live Log has the `Project context:` line.

## Acceptance criteria
Traceability only, by id from the spec.
- [ ] AC-1 → S4, S5, S6, S9 · check: `project-context-helpers.test.ts` exclusions; `git-list-tree.test.ts`
- [ ] AC-2 → S5, S9 · check: helpers `categoryOf`; `ProjectContextView.test.tsx` "root"
- [ ] AC-3 → S6, S9 · check: `ProjectContextView.test.tsx` preview
- [ ] AC-4 → S9 · check: `ProjectContextView.test.tsx` no script/img elements
- [ ] AC-5 → S5, S6, S9 · check: helpers `usedByCounts`; service test; view "Used by 2 agents"
- [ ] AC-6 → S9 · check: view loading case
- [ ] AC-7 → S9 · check: view empty case
- [ ] AC-8 → S6, S9 · check: service ConflictError; view Retry
- [ ] AC-9 → S8, S9 · check: smoke (resync then re-list); `resyncFinished` tests
- [ ] AC-27 → S9 · check: view footer case
- [ ] AC-11 → S5, S6, S10, S11 · check: panel test (one row per document, no checkbox on inherited rows)
- [ ] AC-12 → S6, S11 · check: `ContextTab.test.tsx` "2 of 7 attached"
- [ ] AC-13, AC-14, AC-15 → S6, S8, S10 · check: `project-context.it.test.ts` PUT/GET order; `context.test.tsx`
- [ ] AC-16 → S5 · check: helpers row ordering
- [ ] AC-42, AC-46 → S5, S6, S10 · check: helpers; it-test "via"; panel test
- [ ] AC-47 → S5, S11 · check: helpers (inherited after removal); `ContextTab.test.tsx`
- [ ] AC-17 → S5, S6, S11 · check: service T after `fitDocs`; ContextTab "≈ T tokens"
- [ ] AC-26 → S6, S10 · check: panel "≈ N tok"
- [ ] AC-18 → S10 · check: `helpers.test.ts` filter
- [ ] AC-19 → S10 · check: panel Preview opens the modal
- [ ] AC-20 → S11 · check: `ContextTab.test.tsx` no repo
- [ ] AC-21 → S5, S6, S10 · check: helpers `missing`; service keeps a stored missing path; panel detach
- [ ] AC-45 → S8 · check: `context.test.tsx` failed PUT leaves the cache unchanged
- [ ] AC-28, AC-29, AC-43 → S10 · check: panel test (move buttons, aria-labels with the path, title)
- [ ] AC-22, AC-23, AC-24, AC-25 → S6, S10, S11 · check: `SkillContextTab.test.tsx`; it-test skill PUT/GET
- [ ] AC-44 → S3, S6 · check: `project-context.it.test.ts` delete cascade
- [ ] AC-30 → S5, S6, S7 · check: helpers `effectiveDocList`; service (disabled skill not inherited)
- [ ] AC-31, AC-32, AC-33 → S2, S7 · check: `reviewer-core/test/prompt.test.ts`; `reviews.it.test.ts`
- [ ] AC-34 → S4, S6 · check: service test (ref `HEAD`)
- [ ] AC-35 → S6, S7 · check: service skipped; `reviews.it.test.ts` log line
- [ ] AC-36, AC-37 → S5, S7 · check: helpers `fitDocs`; `reviews.it.test.ts` truncated
- [ ] AC-38 → S7 · check: same route as the studio (`mcp/src/api/http.ts:115`); `reviews.it.test.ts`
- [ ] AC-39 → S7 · check: by construction (resolved before `reviewPullRequest`, passed by value)
- [ ] AC-40 → S6 · check: service ValidationError, nothing stored; it-test 422
- [ ] AC-41 → S4, S5, S6 · check: `git-list-tree.test.ts`; helpers outside symlink dropped; `readDoc` 404
- [ ] AC-50–AC-54 → S1, S7, S12 · check: `RunTraceDrawer.test.tsx`; `reviews.it.test.ts`
- [ ] AC-55 → S1, S12 · check: `contracts.test.ts`; `RunTraceDrawer.test.tsx` legacy trace

## Risks
- **Map-reduce cost.** In `map-reduce` each per-file call carries the full documents, so the cost is k×T. Mitigation: this is the same as skills today, and the default strategy is single-pass. Flagged in the review table; a spec decision if it matters.
- **Trace size.** Each run's trace stores the injected text up to 3× (`prompt_assembly.user`, `.specs` and `project_context`), up to about 180k characters. Mitigation: acceptable for a local single user (jsonb, one row per run).
- **Tab latency.** Every tab open runs `ls-tree` plus reads of the effective documents. Mitigation: R2 avoids reading the other documents, and the effective list is capped by the 60k budget.
- **Silent sync failure.** `resyncRepo` writes no state when the sync fails, so the page only learns of it from the 120 s timeout. Mitigation: show the timeout message (R4).
- **Container edge.** `container.ts` → `modules/project-context/*` adds a composition-root edge. This is the same shape as `repoIntel`, so arch:check is expected to stay green (unverified until R2).

## Out of scope
- Onboarding generator, PR Brief, editing, uploading or creating documents, chunking/embeddings/"Indexed: N chunks", coverage/conformance, LLM selection of documents, head-branch versions, `## Relevant memory`, MCP tools, the CI runner (L06). These are the spec's Non-goals.
- `IndexStatus`, the stale `messages/en/context.json` keys beyond those this page needs, and other drift between the shared copies.
- Module docs (`server/src/modules/project-context/AGENTS.md` plus a `CLAUDE.md` symlink, and route-map updates) are left to doc-writer after the last run.

## Needs research
- None.

## INSIGHTS discrepancies
- `server/src/modules/repos/service.ts:84` mentions `POST /repos/:id/reindex`. This is already recorded in `repo-intel/AGENTS.md` (the real route is `/resync`), so it is not new.
- The doc comment in `client/src/lib/hooks/repo-intel.ts:2-6,29` refers to a `hooks/context.ts` and a `ProjectContextView` that don't exist. S8/S9 create both, so the comment becomes true. This is not an INSIGHTS entry.

## Open questions
- Blocking: none.
- Non-blocking (assumption taken):
  - **Q1** (symlinked docs) → assumed A in S5.
  - **Q2** (marker vs budget) → assumed "the marker doesn't count" in S5.
  - **Q3** (skill T applies the limits) → assumed yes in S6.
  - **Q4** (used_by counts disabled agents) → assumed yes in S6.

### Q1 · header: Symlinks
How should `.md` symlinks in the repo be listed (AC-1 vs AC-41)?
- A) Resolve them inside the git tree, one hop. A link to a regular `.md` blob in the repo is listed and read from its target; a link outside the repo, an absolute link or a chain is dropped. (Recommended: this matches AC-1 literally and this repo's `CLAUDE.md` → `AGENTS.md`.)
- B) Skip every symlink. This is simpler, but `CLAUDE.md` files disappear, which deviates from AC-1 (a spec change goes to spec-creator).

### Q2 · header: Budget
Does the truncation marker count toward the 60,000-character total (AC-37)?
- A) No. The budget counts document characters only, so three truncated 20k documents fit exactly. (Recommended)
- B) Yes. Then three truncated documents exceed the budget and the third is omitted.

## Execution mode
### QX · header: Execution
Should this plan run in multi-agent or single-agent mode?
- A) Multi-agent (Recommended): 3 runs touching three packages, a `@devdigest/shared` contract in both copies, a DB schema plus migration, a new adapter method, and the reviewer-core untrusted-wrapping code next to `INJECTION_GUARD`. These are the cases where independent architecture and correctness review pays off.
- B) Single-agent: one implementer runs all three runs and its own checks, with one correctness-reviewer at the end. It's cheaper and faster, but nobody independently reviews the contract, migration or prompt-injection changes.
