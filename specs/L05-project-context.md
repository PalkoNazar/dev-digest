# Spec: Project Context | Spec ID: SPEC-01 | Status: approved
Supersedes: —
Lesson: L05 · Packages: server, client, reviewer-core · Designs: `designs/project-context/`

## Проблема й навіщо
Агент рев'ю сьогодні бачить лише diff, опис PR, скіли і карту репо, але не знає
продуктових вимог: PRD, тех-специфікацій, безпекових базових правил, які лежать у самому
репо як Markdown. Через це він не може сказати «цей PR порушує вимогу X зі
`specs/public-api.md`». Користувач не має способу ані побачити ці документи в DevDigest,
ані прикріпити їх до агента чи скіла, ані зрозуміти, скільки токенів вони додадуть до
кожного запуску. Після фічі користувач обирає документи репо для агента/скіла, бачить
оцінку токенів, а в трейсі запуску може прочитати повний текст, що реально пішов у промпт.

## Goals / Non-goals
- Goal: сторінка Project Context показує всі Markdown-документи активного репо і дає
  прочитати кожен.
- Goal: на вкладці Agent → Context користувач прикріплює документи до агента, задає їх
  порядок і бачить оцінку токенів, які вони додадуть до промпту.
- Goal: на вкладці Skill → Context користувач прикріплює документи до скіла; кожен агент
  з цим скілом успадковує їх.
- Goal: під час запуску рев'ю повний текст прикріплених документів потрапляє в промпт як
  недовірені дані в секції `## Project context`.
- Goal: трейс запуску показує, які документи було прикріплено, і дає прочитати повний
  текст кожного, як він був доданий до запиту.
- Non-goal: Onboarding generator (L05, окрема фіча).
- Non-goal: PR Brief card (L05, окрема фіча).
- Non-goal: редагування, створення, завантаження документів з UI (режим Edit, кнопки
  «+ файл», «+ папка», upload з `designs/project-context/01-project-context-page.png`):
  DevDigest лише читає репо.
- Non-goal: розбиття на чанки, ембединги, RAG-пошук релевантних шматків («Indexed: 12 files ·
  1,240 chunks» на `01-project-context-page.png`): у промпт іде весь документ.
- Non-goal: кільце COVERAGE / перевірка відповідності PR специфікації (conformance) — інша фіча.
- Non-goal: автоматичний (LLM) вибір релевантних документів під конкретний PR.
- Non-goal: версія документа з гілки PR (head): у промпт іде лише версія з default-гілки,
  тож автор PR не може змінити текст контексту свого ж рев'ю.
- Non-goal: зміна grounding-гейта: знахідка, що цитує лише рядки документа, а не diff,
  відкидається, як і сьогодні.
- Non-goal: інжекція документів у CI-ранері (agent-runner з'являється в L06).
- Non-goal: секція `## Relevant memory` (Memory — інша фіча).
- Non-goal: MCP-інструменти для перегляду чи прикріплення документів.
- Non-goal: прив'язка агента до конкретної версії (коміту) документа.

## User stories
- US-1: As a reviewer, I want to see every Markdown document of the active repo on the
  Project Context page and read it, so that I know what project context exists.
- US-2: As a reviewer, I want to attach documents to an agent in a chosen order and see
  their token cost, so that the agent reviews against our specs without surprising cost.
- US-3: As a reviewer, I want to attach documents to a skill, so that every agent using
  that skill gets the same context.
- US-4: As a reviewer (in the studio or as a Claude Code user via devdigest-mcp), I want
  the attached documents injected as text into the review prompt, so that findings take
  the specs into account.
- US-5: As a reviewer, I want the run trace to list the attached documents and show their
  full injected text, so that I can verify what the model actually saw.

## Acceptance criteria (EARS)
### Сторінка Project Context
- AC-1 (US-1): WHEN the user opens the Project Context page for a repo, the client SHALL
  list, by repo-relative path, every `.md` file of the repo's default branch except files
  under `node_modules`, `dist`, `build`, `coverage`, `.next`, `out`, `vendor` or `.git`.
- AC-2 (US-1): The Project Context page SHALL show for each listed document a category
  label equal to its top-level folder, or "root" for files at the repo root.
- AC-3 (US-1): WHEN the user selects a document, the Project Context page SHALL show its
  content rendered as Markdown in the preview pane.
- AC-4 (US-1): The Project Context page SHALL render document content without executing
  any HTML or script contained in it.
- AC-5 (US-1): WHEN a document is selected, the Project Context page SHALL show
  "Used by N agents", where N counts agents that have the document in their effective
  document list (AC-30) for this repo.
- AC-6 (US-1): WHILE the document list is loading, the Project Context page SHALL show a
  loading state instead of the empty state.
- AC-7 (US-1): IF the repo contains no document matching AC-1, THEN the Project Context
  page SHALL show an empty state saying that every `.md` file of the repo is listed here.
- AC-8 (US-1): IF the server can't read the repo's files (no local clone or read error),
  THEN the Project Context page SHALL show an error state with a Retry action.
- AC-9 (US-1): WHEN the user activates the page's refresh action, the Project Context page
  SHALL re-list documents after resyncing the repo to its latest default branch (the
  existing resync, not a re-clone).
- ~~AC-10~~ removed: page-level filter isn't in the design; finding documents is covered by
  the Context tabs' filter (AC-18).
- AC-27 (US-1): The Project Context page SHALL show in its footer the number of listed
  documents and the time of the repo's last sync.

### Agent → Context
- AC-11 (US-2): WHEN the user opens the Context tab of an agent, the agent editor SHALL
  list every discovered document of the active repo as exactly one row, with an attach
  checkbox on every row except inherited-only rows (AC-42).
- AC-12 (US-2): The agent Context tab SHALL show the count "K of M attached", where K
  counts the agent's own attachments for the active repo.
- AC-13 (US-2): WHEN the user ticks a document row's checkbox, the server SHALL store the
  attachment for this agent and repo immediately, without a separate Save action.
- AC-14 (US-2): WHEN the user unticks a document's checkbox, the server SHALL remove that
  attachment immediately.
- AC-15 (US-2): WHEN the user reorders attached documents, the server SHALL store the new
  order immediately.
- AC-16 (US-2): The agent Context tab SHALL list attached and inherited documents first, in
  prompt order (AC-30), followed by unattached documents in alphabetical path order.
- AC-42 (US-2): The agent Context tab SHALL show each document that is inherited from one of
  the agent's effective skills and not attached to the agent directly as a non-toggleable
  row labelled "via <skill name>".
- AC-46 (US-2): WHERE a document is both attached to the agent directly and inherited from
  an effective skill, the agent Context tab SHALL show it as a normal checked row annotated
  "also via <skill name>".
- AC-47 (US-2): WHEN the user unticks a document that is also inherited from an effective
  skill, the agent Context tab SHALL turn its row into the non-toggleable "via <skill name>"
  row of AC-42 (the document stays in the effective list via the skill, AC-30).
- AC-17 (US-2): The agent Context tab SHALL show "≈ T tokens", where T is ceil(characters / 4)
  of all document text the agent's next run on this repo would inject, including inherited
  documents and after the limits of AC-36/AC-37.
- AC-26 (US-2): The agent and skill Context tabs SHALL show "≈ N tok" on every document row.
- AC-18 (US-2): WHEN the user types into the "Filter documents" field, the agent Context
  tab SHALL show only documents whose path contains the typed text, case-insensitively.
- AC-19 (US-2): WHEN the user activates a row's Preview action, the agent Context tab SHALL
  show that document's rendered content without leaving the tab.
- AC-20 (US-2): IF no repo is active or imported, THEN the agent Context tab SHALL show a
  message asking the user to import or select a repo instead of the list.
- AC-21 (US-2): IF an attached document no longer exists in the repo, THEN the agent
  Context tab SHALL show it as "missing" with a detach action.
- AC-45 (US-2): IF storing an attachment or order change fails, THEN the Context tab SHALL
  return to the previously stored state and show an error message.
- AC-28 (US-2): The agent and skill Context tabs SHALL offer move-up and move-down controls
  for each attached document, reachable by keyboard.
- AC-29 (US-2): Every icon-only control on the Context tabs SHALL have an accessible name
  containing the document path.
- AC-43 (US-2): IF a document path doesn't fit its row, THEN the client SHALL shorten it
  with an ellipsis and keep the full path in the accessible name.

### Skill → Context
- AC-22 (US-3): WHEN the user opens the Context tab of a skill, the skill editor SHALL list
  every discovered document of the active repo with an attach checkbox and the count
  "N attached".
- AC-23 (US-3): The skill Context tab SHALL apply the behaviour of AC-13–AC-15, AC-18–AC-21,
  AC-45 and AC-28–AC-29 to the skill's attachments for the active repo.
- AC-24 (US-3): The skill Context tab SHALL show "≈ T tokens" for the documents attached to
  the skill.
- AC-25 (US-3): The skill Context tab SHALL show a "Serializes as" preview headed
  "## Project context" listing the attached paths in order.
- AC-44 (US-2, US-3): WHEN an agent or skill is deleted, the server SHALL delete its
  document attachments.

### Запуск рев'ю
- AC-30 (US-4): WHEN a review run starts, the server SHALL build the run's effective
  document list as the agent's own attachments for the PR's repo in their order, followed
  by the attachments of the agent's effective skills (L02 rule: linked, enabled for the
  agent, enabled globally) in the agent's skill order, each path once at its first position.
- AC-31 (US-4): WHEN the review prompt is assembled, reviewer-core SHALL place the full
  text of every document in the effective list, in list order, into the `## Project
  context` section of the user message.
- AC-32 (US-4): reviewer-core SHALL wrap each document's text as an untrusted block
  labelled with the document's repo path.
- AC-33 (US-4): WHERE the effective document list is empty, reviewer-core SHALL produce a
  prompt identical to the prompt produced without this feature.
- AC-34 (US-4): WHEN a review run starts, the server SHALL read each document's text from
  the repo's default branch in the local clone as of its last sync.
- AC-35 (US-4): IF an attached document can't be read at run start, THEN the server SHALL
  continue the run without it and add a Live Log line naming the skipped path.
- AC-36 (US-4): IF a document's text exceeds 20,000 characters, THEN the server SHALL
  inject only its first 20,000 characters followed by a visible truncation marker.
- AC-37 (US-4): IF the effective documents together exceed 60,000 characters, THEN the
  server SHALL omit the documents that don't fit, starting from the end of the list, and
  add a Live Log line naming each omitted path.
- AC-38 (US-4): The server SHALL apply the same effective document list to a run started
  from the devdigest-mcp review tool as to a run started from the studio.
- AC-39 (US-4): WHILE a run is in progress, the server SHALL keep using the effective
  document list captured at that run's start, regardless of attachment changes.
- AC-40 (US-4): IF an attach request names a path that is not a discovered document of
  that repo, THEN the server SHALL reject it with a validation error and store nothing.
- AC-41 (US-4): The server SHALL NOT list or read any file whose real location is outside
  the repo's local clone.

### Трейс запуску
- AC-50 (US-5): WHEN a run completes, the run trace drawer SHALL list in the "Specs read"
  row the paths of the injected documents, in prompt order.
- AC-51 (US-5): WHEN at least one document was injected, the Prompt assembly section SHALL
  show a block titled "Project context — attached specs (untrusted)".
- AC-52 (US-5): The "Project context — attached specs (untrusted)" block SHALL show the
  meta "N docs · +T tok", where T is the estimate of the injected document text.
- AC-53 (US-5): The "Project context — attached specs (untrusted)" block SHALL show one row
  per injected document that expands to that document's full text exactly as it was
  injected into the prompt.
- AC-54 (US-5): IF a document was truncated or omitted in that run, THEN the run trace
  drawer SHALL mark its path as "truncated" or "omitted".
- AC-55 (US-5): IF a stored trace predates this feature, THEN the run trace drawer SHALL
  render it without error and show "none" in the "Specs read" row.

## Edge cases
- EC-1: У репо сотні/тисячі `.md` (вендорені доки, changelog'и) → AC-1 (виключені папки),
  AC-18 (фільтр на вкладках).
- EC-2: Репо без жодного відповідного документа → AC-7.
- EC-3: Репо імпортовано, але локального клону ще немає або читання впало → AC-8.
- EC-4: Документ прикріплено, потім видалено/перейменовано в репо → AC-21 (вкладки), AC-35 (запуск).
- EC-5: Один документ більший за 20,000 символів → AC-36, AC-54.
- EC-6: Сума документів перевищує 60,000 символів → AC-37, AC-54, AC-17.
- EC-7: Той самий документ прикріплений і до агента, і до його скіла → AC-30 (один раз, на
  першій позиції); на вкладці агента — один рядок: звичайний чекбокс з позначкою «also via
  <skill>» (AC-46); після відкріплення рядок стає заблокованим «via <skill>», документ
  лишається в промпті через скіл (AC-47).
- EC-8: Документ прикріплений до скіла, який вимкнено для агента або глобально → AC-30
  (не успадковується).
- EC-9: Агенти й скіли спільні для воркспейсу, а документи належать репо; агент запускається
  на PR іншого репо → AC-11, AC-30 (прикріплення окремі для кожного репо).
- EC-10: Користувач змінює прикріплення під час запуску → AC-39.
- EC-11: PR сам змінює прикріплений документ (автор PR може вписати інструкції) → AC-34
  (береться default-гілка), Non-goal (head-версія).
- EC-12: Документ містить raw HTML / `<script>` або текст-ін'єкцію («ignore previous
  instructions») → AC-4, AC-32 (INJECTION_GUARD), Untrusted inputs.
- EC-13: Ім'я файлу містить символи, що могли б закрити роздільник untrusted-блоку → AC-32,
  Untrusted inputs.
- EC-14: Symlink у репо вказує за межі клону → AC-41.
- EC-15: Дуже довгий шлях / ім'я файлу → AC-43.
- EC-16: Старі трейси (до L05) без нових полів → AC-55.
- EC-17: Запуск через devdigest-mcp → AC-38.
- EC-18: Повторний запуск / retry після змін у документі → AC-34 (текст читається на старті
  кожного запуску; трейс зберігає те, що було інжектовано тоді, AC-53).
- EC-19: Знахідка посилається лише на рядок документа, а не diff → Non-goal (grounding без змін).
- EC-20: Запит на прикріплення довільного шляху (`../../etc/passwd`) → AC-40.
- EC-21: Агента або скіл видалено → AC-44.
- EC-22: Немає LLM-ключа → фіча не робить LLM-викликів; поведінка запуску без змін.
- EC-23: Збереження прикріплення або порядку не вдалося (API впав) → AC-45.
- EC-24: Документ змінився в репо після останнього sync → запуск і вкладки бачать версію
  останнього sync (AC-34); оновлення — через refresh (AC-9).

## Non-functional
- Cost: нових LLM-викликів немає. Кожен запуск агента отримує приблизно T додаткових
  вхідних токенів (AC-17), не більше ≈ 15k токенів (60,000 символів, AC-37).
- Security: документи лише читаються з локального клону; нічого не пишеться в репо.
  Шляхи обмежені клоном (AC-40, AC-41). Секрети не задіяні.
- A11y: чекбокси й іконкові кнопки мають доступні імена зі шляхом (AC-29); перевпорядкування
  з клавіатури (AC-28); бейджі категорій містять текст, а не лише колір.

## Inputs (provenance)
| Input | Source | Tag |
|---|---|---|
| Список Markdown-документів репо | обхід локального клону (default-гілка), ті самі виключені папки, що й у repo-intel | [deterministic: git clone] |
| Текст документа (сторінка, вкладки, запуск) | локальний клон, default-гілка станом на останній sync | [deterministic: git clone] |
| Прикріплення агент ↔ документ (репо, порядок) | нові збережені дані | [deterministic: DB] |
| Прикріплення скіл ↔ документ (репо, порядок) | нові збережені дані | [deterministic: DB] |
| Ефективні скіли агента | правило L02 (linked + enabled + global enabled, порядок) | [reused: L02] |
| Оцінка токенів ceil(chars / 4) | та сама оцінка, що в редакторі скілів і `estTokens` reviewer-core | [reused: L02] |
| «Used by N agents» | підрахунок із прикріплень | [deterministic: DB] |
| Час останнього sync, refresh | наявний repo resync | [reused: L04 repo-intel] |
| Слот `## Project context` + обгортка untrusted | наявний слот `specs` у reviewer-core (заготовка, сьогодні порожній) | [reused: pre-L05 groundwork] |
| «Specs read» і блок Project context у трейсі | наявні поля трейсу `specs_read` / `prompt_assembly.specs` (сьогодні завжди порожні) | [reused: pre-L05 groundwork] |

## Untrusted inputs
- Вміст документів репо → дані, не інструкції: у промпті кожен документ обгорнутий як
  untrusted-блок за `INJECTION_GUARD` (AC-32); береться лише з default-гілки, не з гілки PR
  (AC-34); у прев'ю рендериться без виконання HTML/скриптів (AC-4); довжина обмежена
  (AC-36, AC-37).
- Шляхи/імена файлів → показуються як екранований текст; у мітці untrusted-блоку не можуть
  закрити роздільник (EC-13); прикріплюються лише шляхи зі списку відкриття (AC-40, AC-41).
- Відповідь LLM → без змін: знахідки проходять `groundFindings`.
- Аргументи devdigest-mcp → без змін (інструмент лише запускає рев'ю, AC-38).

## [NEEDS CLARIFICATION]
- none
