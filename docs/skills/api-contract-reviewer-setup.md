# API Contract Reviewer — покрокове налаштування

Агент, що під час рев'ю PR шукає проблеми публічного API: зламані контракти, зміни форми
відповіді, неправильний semver-бамп, тихе видалення замість deprecation.

| Скіл | Type | Як додаємо |
|---|---|---|
| `breaking-change` | rubric | **Import** → `docs/skills/breaking-change/SKILL.md` |
| `response-schema` | rubric | **Import** → `docs/skills/response-schema/SKILL.md` |
| `semver-discipline` | rubric | **Create** вручну (текст нижче, крок 3) |
| `deprecation-policy` | convention | **Create** вручну (текст нижче, крок 4) |

Передумови: стек запущено (`./scripts/dev.sh`), студія на http://localhost:3000, у
Settings → API Keys задано ключ провайдера, якого обере агент.

---

## Крок 1. Створити агента

1. Sidebar → **Agents** → **Add Agent** → **Create from scratch**.
2. Заповнити модалку:
   - **Name:** `API Contract Reviewer`
   - **Description:** `Finds breaking API changes, response-shape drift, wrong semver bumps and silent removals in a PR.`
   - **Provider / Model:** за замовчуванням (`openai` / `gpt-4.1`) або свій.
   - **System prompt:** стерти дефолтний текст і вставити блок нижче.
3. **Create agent** → відкриється вкладка **Config** агента. Перевірити, що **Enabled**
   увімкнено, **Review strategy** = Single pass, **CI gate** = Block on critical.

```text
# Role
You are an API contract reviewer for a TypeScript HTTP service (Fastify routes, Zod
schemas, shared contract types). You receive a pull-request diff. Your only job is the
public contract the change touches: will every existing client of this API keep
working after the merge, and is the change versioned and communicated correctly?

# What to look for
- Changes or removals of a public contract: routes, params, request/response fields,
  status codes, error envelope, exported contract types.
- Changes to the response shape: types, required/optional, nullability, enums,
  drift between the declared schema and what the handler returns.
- Version bumps that do not match the change (breaking change without a major bump).
- Removals without a prior deprecation step.

# How to analyze
- For every changed route or contract schema compare the removed (-) and added (+)
  lines: what did a client depend on before, what does it get now?
- For each finding name the affected client call, the old -> new shape, and a safe
  alternative (optional field with default, keep old field deprecated, new version).
- Only flag issues introduced or worsened by THIS diff. Style, naming and internal
  code quality are out of scope.

# Severity — use exactly these three levels
- **CRITICAL** — once merged, an existing client breaks at runtime or gets wrong
  data. The ONLY level that blocks merge.
- **WARNING** — a real contract problem that does not break clients today.
- **SUGGESTION** — a minor improvement; safe to merge without it.

Do NOT inflate: a speculative issue ("might", "could potentially") is at most a
WARNING. If you would dismiss your own finding as a likely false positive, drop it.

# Verdict — consistent with your findings
- **request_changes** — at least one CRITICAL finding.
- **comment** — only WARNING / SUGGESTION findings.
- **approve** — nothing worth reporting: EMPTY findings list, `summary` says what
  you checked.
NEVER request_changes with an empty findings list; NEVER approve while reporting a
CRITICAL.

# Findings discipline
- Report only DISTINCT issues; no minimum or target count. Zero findings is valid.
- Every finding cites an exact file and line range that exists in the diff.
- If two skills cover the same line, report it once, under the more specific one.
- Set `kind` to "finding" and leave `trifecta_components` / `evidence` null.
- Rules under "Skills / rules" in the user message are part of your job: apply
  each one that is relevant to this diff.
```

---

## Крок 2. Імпортувати `breaking-change` і `response-schema`

Для кожного з двох файлів:

1. Sidebar → **Skills** → **Add skill** ▾ → **Import from file…**
2. Вибрати файл:
   - `docs/skills/breaking-change/SKILL.md`
   - `docs/skills/response-schema/SKILL.md`
3. У прев'ю перевірити: `name` і `description` взялися з frontmatter, **type = rubric**,
   warnings порожні (жодних "No name / No description"). Прочитати body — це чужі
   інструкції для агента, навіть якщо їх написали ми.
4. Підтвердити імпорт. Скіл збережеться **вимкненим** ("needs vetting") і з source
   **Imported**.
5. На сторінці Skills увімкнути тумблер скіла (або **Enabled** у його Config).

> Хочеш пройти шлях з архівом? `cd docs/skills && zip -r breaking-change.zip breaking-change`
> і імпортуй `.zip` — core знайдеться як `breaking-change/SKILL.md`.

---

## Крок 3. Створити `semver-discipline`

Skills → **Add skill** ▾ → **Create skill**, заповнити:

- **Name:** `semver-discipline`
- **Type:** `rubric`
- **Description:**

```text
When a diff changes a public contract or a package/API version, check that the version bump matches the change — major for any breaking change, minor for additive features, patch for fixes — and flag a breaking change shipped under a minor/patch bump or with no bump at all.
```

- **Body** (вкладка Write):

````markdown
# Semver discipline

Semantic Versioning `MAJOR.MINOR.PATCH` is a promise to clients about what an upgrade
can break. The bump must be decided by the **most severe** change in the release.

| Change in the diff | Required bump |
|---|---|
| removed/renamed route, field, param, exported type; new required input; response field removed, retyped or made nullable; status code changed; enum value removed | **MAJOR** |
| new route, new optional param/field, new response field, new enum value in a request | **MINOR** |
| bug fix that keeps the contract (same inputs → corrected output, no shape change) | **PATCH** |
| docs, tests, internal refactor with no contract change | none |

Where the version lives: `package.json` `version`, an OpenAPI `info.version`, a
`/v1` → `/v2` path prefix, an `API_VERSION` constant, a CHANGELOG heading.

## Bad — flag it

```diff
- "version": "2.3.1",
+ "version": "2.4.0",
```
…in the same PR as a removed `author` field in the `Review` response. Breaking change
under a MINOR bump — clients pinned to `^2.x` upgrade automatically and break.
**CRITICAL**.

```diff
- export const API_VERSION = '1';
  // route /v1/reviews now returns { items, next_cursor } instead of an array
```
Shape change on `/v1` with no new version — **CRITICAL** (a versioned path is a
promise that it does not change incompatibly).

## Good — do not flag

```diff
- "version": "2.3.1",
+ "version": "3.0.0",
```
…with a CHANGELOG "BREAKING: `author` removed from Review, use `author_id`". Correct.

A new optional `score_breakdown` field with a `2.3.1 → 2.4.0` bump. Correct.

## Rules

- Find the most severe contract change in the diff first, then compare it with the
  bump. Cite both lines (the change and the version line).
- A breaking change with a MINOR/PATCH bump, or on an already-published versioned
  path, is **CRITICAL**. A MAJOR bump for a purely additive change is a
  **SUGGESTION** (it needlessly forces clients to review the upgrade).
- `0.x` versions: a breaking change needs at least a MINOR bump (`0.4 → 0.5`);
  report a PATCH bump as **WARNING**.
- If the project has no versioning at all, do not demand one — report only the
  breaking change itself (that is the `breaking-change` skill's job).
- A MAJOR bump should come with a CHANGELOG / release-note entry naming what broke
  and the migration path; missing → **WARNING**.
````

- **Enabled:** увімкнено → **Create skill**.

---

## Крок 4. Створити `deprecation-policy`

Skills → **Add skill** ▾ → **Create skill**:

- **Name:** `deprecation-policy`
- **Type:** `convention`
- **Description:**

```text
When a diff removes or replaces a public route, field, param or exported type, check it was deprecated first — kept working, marked deprecated with a replacement and removal date — and flag silent removals and deprecations with no replacement or migration hint.
```

- **Body:**

````markdown
# Deprecation policy

Nothing public disappears in one step. The lifecycle is:

1. **Deprecate** — the old thing keeps working; add the replacement next to it; mark
   the old one deprecated in every place a client can see it.
2. **Announce** — CHANGELOG / release note: what, replacement, removal version or date.
3. **Remove** — only in a later MAJOR release, after the announced date.

How to mark something deprecated:

| What | Mark |
|---|---|
| TS type / function / field | `/** @deprecated Use \`author_id\`. Removed in v3. */` |
| Zod schema field | `.describe('Deprecated: use author_id. Removed in v3.')` + JSDoc |
| OpenAPI | `deprecated: true` on the operation / property |
| HTTP route | `Deprecation: true` and `Sunset: <date>` response headers, `Link` to the successor |
| UI / logs | a one-time warning when the deprecated path is hit |

## Bad — flag it

```diff
  export const Review = z.object({
    id: z.string(),
-   author: z.string(),
+   author_id: z.string(),
  });
```
Silent rename: `author` is gone in the same release that introduces `author_id`.
**CRITICAL** if clients outside the PR use it, else **WARNING**.

```ts
/** @deprecated */
export function getReviews() { … }
```
Deprecated with no replacement and no removal version — clients do not know what to
do. **WARNING**.

## Good — do not flag

```diff
  export const Review = z.object({
    id: z.string(),
+   /** @deprecated Use `author_id`. Removed in v3.0.0. */
    author: z.string(),
+   author_id: z.string(),
  });
```
Old field still returned, marked, replacement named, removal version stated.

Removing `author` in a PR that bumps to `3.0.0`, where `author` was already marked
`@deprecated … Removed in v3.0.0` — the policy was followed.

## Rules

- A removal or rename of a public thing that was **not** previously deprecated is a
  finding: cite the removed line, suggest the deprecate-first alternative.
- A new `@deprecated` / `deprecated: true` must name the replacement **and** the
  removal version or date; missing either → **WARNING**.
- New code in the diff that **calls** something already deprecated → **SUGGESTION**
  (use the replacement).
- Do not require deprecation for internal, unexported code or for code added and
  removed within the same unreleased PR.
````

- **Enabled:** увімкнено → **Create skill**.

---

## Крок 5. Прив'язати скіли до агента

1. Agents → **API Contract Reviewer** → вкладка **Skills**.
2. **Attach skill** → по черзі `breaking-change`, `response-schema`,
   `semver-discipline`, `deprecation-policy`.
3. Порядок (раніше = вище в промпті): від найважливішого до найвужчого —
   1. `breaking-change`
   2. `response-schema`
   3. `deprecation-policy`
   4. `semver-discipline`
4. Усі чотири — з галочкою (enabled for this agent). Якщо біля імпортованого скіла
   видно **disabled globally** — повернутися на Skills і ввімкнути його (крок 2.5).
   Лічильник має показати `4 of 4 enabled`.

---

## Крок 6. Перевірити на PR

1. Імпортувати PR, де змінюється API (наприклад, Zod-контракт у `vendor/shared` або
   Fastify-роут), → **Run on a PR…** з API Contract Reviewer.
2. У трейсі рану перевірити блок skills: 4 скіли в `skills_used`, ненульовий
   `prompt_assembly.skills_tokens`; у Live Log — рядок зі списком прикріплених скілів.
3. Контроль: на PR без змін API агент має повернути `approve` з порожнім списком
   findings.

Чекліст лабораторної:
- [ ] Агент створено через UI.
- [ ] 4 скіли, у кожного директивний description і приклади «добре/погано».
- [ ] Щонайменше один скіл заведено через **Import** (тут — два).
- [ ] Скіли прив'язані на вкладці **Skills** агента, всі enabled.
