import type { SampleFile, ToolingFact } from '../types.js';

/**
 * Tooling facts — what the repo's configs already enforce, parsed deterministically.
 * A rule a formatter or linter already enforces is worthless in a review skill (the
 * tool catches it first), so these facts are (a) listed in the prompt as "don't
 * propose" and (b) matched against every candidate that is proposed anyway.
 */

type Tool = ToolingFact['tool'];

/** Formatting topics and the phrases that identify them in a rule. */
const FORMAT_TOPICS: Record<string, string[]> = {
  quotes: ['single quote', 'double quote', 'quote style', 'quotes for strings'],
  semicolons: ['semicolon'],
  indentation: ['indent', 'tab width', '2 spaces', '4 spaces', 'two spaces', 'four spaces'],
  'line length': [
    'line length',
    'max line',
    'print width',
    'characters per line',
    'column limit',
    'line width',
    '80 char',
    '100 char',
    '120 char',
  ],
  'trailing commas': ['trailing comma'],
  'arrow parens': ['arrow function paren', 'parentheses around arrow', 'arrow parens'],
  'bracket spacing': ['bracket spacing', 'spaces inside braces', 'spaces inside curly'],
};

const EDITORCONFIG_TOPICS: Record<string, [string, string[]]> = {
  indent_style: ['indentation', FORMAT_TOPICS.indentation!],
  indent_size: ['indentation', FORMAT_TOPICS.indentation!],
  max_line_length: ['line length', FORMAT_TOPICS['line length']!],
  insert_final_newline: ['final newline', ['final newline', 'trailing newline', 'newline at end']],
  trim_trailing_whitespace: ['trailing whitespace', ['trailing whitespace']],
  end_of_line: ['line endings', ['line ending', 'crlf']],
};

const TSCONFIG_TOPICS: Record<string, [string, string[]]> = {
  strict: [
    'strict type checking',
    ['strict mode', 'strict typescript', 'implicit any', 'noimplicitany', 'strictnullchecks', 'strict null'],
  ],
  noImplicitAny: ['no implicit any', ['implicit any', 'noimplicitany']],
  noUncheckedIndexedAccess: [
    'unchecked indexed access',
    ['nouncheckedindexedaccess', 'unchecked index', 'indexed access'],
  ],
  noUnusedLocals: ['unused locals', ['unused local', 'unused variable', 'unused import']],
  noUnusedParameters: ['unused parameters', ['unused parameter']],
  verbatimModuleSyntax: ['type-only imports', ['import type', 'type-only import', 'verbatimmodulesyntax']],
  noImplicitReturns: ['implicit returns', ['implicit return']],
  noFallthroughCasesInSwitch: ['switch fallthrough', ['fallthrough', 'fall through']],
  noImplicitOverride: ['override keyword', ['override keyword', 'noimplicitoverride']],
  exactOptionalPropertyTypes: ['exact optional properties', ['exactoptionalpropertytypes']],
};

/** Phrases for common lint rules whose names don't appear in how people state them. */
const LINT_RULE_KEYWORDS: Record<string, string[]> = {
  'no-console': ['console.log', 'console.'],
  'prefer-const': ['prefer const', 'const instead of let', 'use const'],
  'no-var': ['instead of var', 'never use var', 'avoid var'],
  eqeqeq: ['===', 'strict equality'],
  curly: ['curly braces'],
  'no-explicit-any': ['explicit any', '`any`', 'any type'],
  'consistent-type-imports': ['import type', 'type-only import'],
  'no-floating-promises': ['floating promise', 'unhandled promise'],
  'no-unused-vars': ['unused variable', 'unused import'],
  'exhaustive-deps': ['dependency array', 'exhaustive deps'],
  'rules-of-hooks': ['rules of hooks'],
  order: ['import order', 'order imports', 'sort imports', 'imports sorted'],
  'no-non-null-assertion': ['non-null assertion'],
  semi: FORMAT_TOPICS.semicolons!,
  quotes: FORMAT_TOPICS.quotes!,
  indent: FORMAT_TOPICS.indentation!,
  'max-len': FORMAT_TOPICS['line length']!,
  noExplicitAny: ['explicit any', '`any`', 'any type'],
  noConsole: ['console.log', 'console.'],
  useImportType: ['import type', 'type-only import'],
};

/** JSON with comments and trailing commas (tsconfig, .eslintrc, biome.jsonc). */
export function parseJsonc(text: string): unknown {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && next === '*') {
      i = text.indexOf('*/', i + 2);
      if (i === -1) break;
      i++;
    } else {
      out += c;
    }
  }
  try {
    return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
  } catch {
    return null;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

function fact(tool: Tool, source: string, topic: string, keywords: string[]): ToolingFact {
  return { tool, source, topic, keywords: keywords.map((k) => k.toLowerCase()) };
}

function formatterFacts(tool: Tool, source: string): ToolingFact[] {
  return Object.entries(FORMAT_TOPICS).map(([topic, kw]) => fact(tool, source, topic, kw));
}

/** "noExplicitAny" → "explicit any"; "prefer-const" → "prefer const". Null if too vague. */
function phraseOf(ruleName: string): string | null {
  const bare = ruleName.slice(ruleName.lastIndexOf('/') + 1);
  const words = bare
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[-\s]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
  if (words[0] === 'no' || words[0] === 'use') words.shift();
  return words.length >= 2 ? words.join(' ') : null;
}

/** A rule name specific enough to look for verbatim ("no-console", not "order"). */
const isDistinctName = (name: string) => /[-A-Z]/.test(name);

function lintRuleFact(tool: Tool, source: string, rule: string): ToolingFact {
  const bare = rule.slice(rule.lastIndexOf('/') + 1);
  const phrase = phraseOf(rule);
  return fact(tool, source, rule, [
    ...(isDistinctName(bare) ? [rule, bare] : []),
    ...(phrase ? [phrase] : []),
    ...(LINT_RULE_KEYWORDS[bare] ?? []),
  ]);
}

/** Enabled rule names of an ESLint JSON config (`rules: { name: "error" | [2, …] }`). */
function eslintJsonRules(config: unknown): string[] {
  if (!isObject(config) || !isObject(config.rules)) return [];
  return Object.entries(config.rules)
    .filter(([, v]) => {
      const level = Array.isArray(v) ? v[0] : v;
      return level !== 'off' && level !== 0;
    })
    .map(([name]) => name);
}

/** Rule names switched on in a JS flat config — best effort, it is code, not data. */
function eslintJsRules(text: string): string[] {
  const re = /['"]((?:@[\w-]+\/)?[a-z][\w-]*(?:\/[\w-]+)?)['"]\s*:\s*(?:\[\s*)?(?:['"](?:error|warn)['"]|[12]\b)/g;
  return [...new Set([...text.matchAll(re)].map((m) => m[1]!))];
}

function fromPackageJson(file: SampleFile): ToolingFact[] {
  const pkg = parseJsonc(file.content);
  if (!isObject(pkg)) return [];
  const out: ToolingFact[] = [];
  if (pkg.prettier !== undefined) out.push(...formatterFacts('prettier', file.path));
  for (const rule of eslintJsonRules(pkg.eslintConfig)) out.push(lintRuleFact('eslint', file.path, rule));
  return out;
}

function fromTsconfig(file: SampleFile): ToolingFact[] {
  const cfg = parseJsonc(file.content);
  const opts = isObject(cfg) && isObject(cfg.compilerOptions) ? cfg.compilerOptions : null;
  if (!opts) return [];
  return Object.entries(TSCONFIG_TOPICS)
    .filter(([option]) => opts[option] === true)
    .map(([, [topic, kw]]) => fact('typescript', file.path, topic, kw));
}

function fromEditorconfig(file: SampleFile): ToolingFact[] {
  const seen = new Set<string>();
  const out: ToolingFact[] = [];
  for (const line of file.content.split('\n')) {
    const key = line.split('=')[0]?.trim().toLowerCase() ?? '';
    const entry = EDITORCONFIG_TOPICS[key];
    if (!entry || seen.has(entry[0])) continue;
    seen.add(entry[0]);
    out.push(fact('editorconfig', file.path, entry[0], entry[1]));
  }
  return out;
}

function fromBiome(file: SampleFile): ToolingFact[] {
  const cfg = parseJsonc(file.content);
  if (!isObject(cfg)) return [];
  const out: ToolingFact[] = [];
  const formatterOff = isObject(cfg.formatter) && cfg.formatter.enabled === false;
  if (!formatterOff) out.push(...formatterFacts('biome', file.path));
  const groups = isObject(cfg.linter) && isObject(cfg.linter.rules) ? cfg.linter.rules : {};
  for (const group of Object.values(groups)) {
    if (!isObject(group)) continue;
    for (const [rule, level] of Object.entries(group)) {
      const value = isObject(level) ? level.level : level;
      if (value !== 'off') out.push(lintRuleFact('biome', file.path, rule));
    }
  }
  return out;
}

/** Every fact the found configs establish (one per tool + source + topic). */
export function toolingFacts(configs: SampleFile[]): ToolingFact[] {
  const out: ToolingFact[] = [];
  for (const file of configs) {
    const name = baseName(file.path);
    if (name === 'package.json') out.push(...fromPackageJson(file));
    else if (name === 'tsconfig.json') out.push(...fromTsconfig(file));
    else if (name === '.editorconfig') out.push(...fromEditorconfig(file));
    else if (name.startsWith('biome.')) out.push(...fromBiome(file));
    else if (name.startsWith('.prettierrc') || name.startsWith('prettier.config.')) {
      out.push(...formatterFacts('prettier', file.path));
    } else if (name.startsWith('.eslintrc') && !/\.c?js$/.test(name)) {
      for (const rule of eslintJsonRules(parseJsonc(file.content))) {
        out.push(lintRuleFact('eslint', file.path, rule));
      }
    } else if (name.startsWith('.eslintrc') || name.startsWith('eslint.config.')) {
      for (const rule of eslintJsRules(file.content)) out.push(lintRuleFact('eslint', file.path, rule));
    }
  }
  const seen = new Set<string>();
  return out.filter((f) => {
    const key = `${f.tool}|${f.source}|${f.topic}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** "prettier (.prettierrc)" — one label per config that produced facts. */
export function toolingLabels(facts: ToolingFact[]): string[] {
  return [...new Set(facts.map((f) => `${f.tool} (${f.source})`))];
}

/** The fact a rule restates, if any → `enforced_by` label "eslint (x): no-console". */
export function matchTooling(rule: string, facts: ToolingFact[]): string | null {
  const text = rule.toLowerCase();
  const hit = facts.find((f) => f.keywords.some((k) => text.includes(k)));
  return hit ? `${hit.tool} (${hit.source}): ${hit.topic}` : null;
}
