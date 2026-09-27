/**
 * Onion-architecture fitness function for `server/src` (+ reviewer-core, reached via
 * the tsconfig path alias). Rules and rationale: `.claude/skills/onion-architecture/`.
 *
 *   pnpm arch:check     — fails on any NEW violation (known ones are ignored)
 *   pnpm arch:baseline  — rewrite `.dependency-cruiser-known-violations.json`;
 *                         only after FIXING violations — the baseline may only shrink
 *
 * Layers, inside → out:
 *   domain       vendor/shared (Zod contracts + ports), reviewer-core
 *   application  modules/<m>/** except routes.ts and repository* (service, helpers, ports…)
 *   outer ring   modules/<m>/routes.ts (Fastify) · modules/<m>/repository* (Drizzle)
 *                adapters/* (SDKs) · db/* · platform/* · app.ts (composition root)
 *
 * `tsPreCompilationDeps: true` counts `import type` too: a type-only import of
 * `Container` or a Drizzle row is still a dependency on the outer ring.
 */

/**
 * Vendor SDKs / I/O libraries that only `src/adapters/**` may import (Drizzle and
 * postgres have their own rule). Pure in-process computation libraries
 * (graphology, p-queue) are deliberately NOT here: they do no I/O and don't leak a
 * vendor into the core, so application code may use them directly.
 */
const SDKS = [
  'octokit',
  'openai',
  '@anthropic-ai/sdk',
  'simple-git',
  '@ast-grep/napi',
  '@vscode/ripgrep',
  'dependency-cruiser',
  'js-tiktoken',
];
/**
 * Regex for "an import of one of these packages". Matches the resolved form
 * (`node_modules/.pnpm/<pkg>@x/node_modules/<pkg>/…`) AND the unresolved bare name
 * (`<pkg>`, when the package isn't installed where the importer lives). `(/|$)` keeps
 * `fastify` from matching `fastify-sse-v2`; a scope (`@fastify`) matches all its packages.
 */
const pkgPattern = (pkgs) =>
  `(^|node_modules/)(${pkgs.map((p) => p.replace(/[/.]/g, '\\$&')).join('|')})(/|$)`;

/** Delivery-ring packages: only routes.ts / app.ts may import them. */
const FASTIFY_PKGS = ['fastify', 'fastify-type-provider-zod', 'fastify-sse-v2', '@fastify'];

/** Persistence packages: only repositories (and db/, platform/) may import them. */
const DB_PKGS = ['drizzle-orm', 'postgres'];

/**
 * SDKs reviewer-core may import: `openai` backs its OpenRouter provider and the
 * zod → JSON Schema helper (see reviewer-core/AGENTS.md). Every other SDK is banned.
 */
const REVIEWER_CORE_ALLOWED_SDKS = ['openai'];
const REVIEWER_CORE_BANNED_PKGS = [
  ...SDKS.filter((s) => !REVIEWER_CORE_ALLOWED_SDKS.includes(s)),
  ...DB_PKGS,
  ...FASTIFY_PKGS,
];

/** A module's edge: the Fastify plugin + the registry/context helpers it uses. */
const MODULE_EDGE = ['/routes\\.ts$', '^src/modules/(index|_shared/context)\\.ts$'];

/** Persistence files of a module: the only module code allowed to touch Drizzle. */
const MODULE_REPOSITORY = '^src/modules/[^/]+/(repository\\.ts$|repository/)';

/** Application core of a module = everything that is neither its edge nor its persistence. */
const MODULE_CORE = { path: '^src/modules/', pathNot: [...MODULE_EDGE, MODULE_REPOSITORY] };

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Cycles make layers meaningless; extract the shared piece inward instead.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'shared-is-innermost',
      severity: 'error',
      comment:
        '@devdigest/shared (contracts + ports) is the domain core: it may import only zod ' +
        'and itself — never server code, a framework or an SDK.',
      from: { path: '^src/vendor/shared/' },
      to: { pathNot: ['^src/vendor/shared/', pkgPattern(['zod'])] },
    },
    {
      name: 'reviewer-core-is-pure',
      severity: 'error',
      comment:
        'reviewer-core is the pure review engine: no DB, Fastify, server modules, adapters, ' +
        'filesystem or vendor SDK (except openai for its LLM helpers). Its only side effect ' +
        'is the injected LLMProvider.',
      from: { path: '^\\.\\./reviewer-core/src/' },
      to: {
        path: [
          '^src/(db|modules|platform|adapters)/',
          // these packages aren't installed in reviewer-core, so an import of one stays
          // unresolved (bare name) — pkgPattern matches that form too
          pkgPattern(REVIEWER_CORE_BANNED_PKGS),
          '^(fs|node:fs|fs/promises|node:fs/promises|child_process|node:child_process)$',
        ],
      },
    },
    {
      name: 'drizzle-only-in-repositories',
      severity: 'error',
      comment:
        'Inside modules/, only repository.ts / repository/*.ts may import drizzle-orm or ' +
        'src/db/** (schema, client, rows). Services and routes talk to a repository.',
      from: { path: '^src/modules/', pathNot: MODULE_REPOSITORY },
      to: { path: [pkgPattern(DB_PKGS), '^src/db/'] },
    },
    {
      name: 'sdk-only-in-adapters',
      severity: 'error',
      comment:
        'Third-party SDKs live behind a port in src/adapters/** (wired in platform/container.ts). ' +
        'Modules depend on the port interface, never on the SDK.',
      from: { path: '^src/modules/' },
      to: { path: pkgPattern(SDKS) },
    },
    {
      name: 'modules-use-ports-not-adapters',
      severity: 'error',
      comment:
        'A module never imports src/adapters/** directly — it receives the adapter through ' +
        'its port (injected), so tests can swap it for a mock.',
      from: { path: '^src/modules/' },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'fastify-only-in-routes',
      severity: 'error',
      comment:
        'Fastify is the delivery mechanism: only routes.ts (and _shared/context.ts) may ' +
        'import it. Services take plain inputs and return plain outputs.',
      from: { path: '^src/modules/', pathNot: MODULE_EDGE },
      to: { path: pkgPattern(FASTIFY_PKGS) },
    },
    {
      name: 'no-container-in-core',
      severity: 'error',
      comment:
        'Container is a service locator. Application code gets NARROW dependencies via its ' +
        'constructor ({ agentsRepo, llm }); only routes.ts (the module\'s edge) may read Container.',
      from: MODULE_CORE,
      to: { path: '^src/platform/container\\.ts$' },
    },
    {
      name: 'no-infra-in-core',
      severity: 'error',
      comment:
        'Application code must not import runtime infrastructure (JobRunner, runBus, run-logger) ' +
        'as concrete classes — depend on a small port and let the edge inject it.',
      from: MODULE_CORE,
      to: { path: '^src/platform/(jobs|sse|run-logger|trace-builder)\\.ts$' },
    },
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      comment:
        'A module never imports another module\'s folder. Cross-module data goes through a ' +
        'port exposed on the container (container.agentsRepo, container.repoIntel).',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/', pathNot: ['^src/modules/$1/', '^src/modules/_shared/'] },
    },
    {
      name: 'outer-ring-not-into-modules',
      severity: 'error',
      comment:
        'Adapters, db and platform code must not import feature modules. Only the composition ' +
        'root (platform/container.ts, app.ts) wires modules in.',
      from: { path: '^src/(adapters|db|platform)/', pathNot: '^src/platform/container\\.ts$' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'module-registry-only-from-app',
      severity: 'error',
      comment: 'modules/index.ts is the registry of plugins; only app.ts registers it.',
      from: { pathNot: '^src/app\\.ts$' },
      to: { path: '^src/modules/index\\.ts$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
      extensions: ['.ts', '.js', '.mjs', '.cjs', '.json'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
