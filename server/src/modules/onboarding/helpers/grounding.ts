import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { BASE_PROGRAMS, MAKEFILES } from '../constants.js';
import type { PackageManager, ScriptsByDir } from '../types.js';

/**
 * Grounding of LLM text against the tree at the tour's commit (plan S8, A2, A8).
 * Pure. AC-57, AC-58, AC-62, AC-79, AC-83, EC-6.
 */

// ---------------------------------------------------------------------------
// Markdown links (AC-57, AC-79, A2). R8 rejected: a grounded repo path becomes
// inline code, an ungrounded one is removed and counted — no repo-file link survives.
// The text is parsed with the same CommonMark + GFM grammar the client renders it
// with (react-markdown + remark-gfm), and the original text is spliced by offsets.
// ---------------------------------------------------------------------------

/**
 * URL schemes kept as written: exactly the ones react-markdown's `defaultUrlTransform`
 * lets through. Any other `x:` prefix (`server.ts:42`, `javascript:`) is resolved as a
 * repo path and removed when ungrounded, so no link with another scheme survives (G1).
 */
const SAFE_SCHEME_RE = /^(?:https?|ircs?|mailto|xmpp):/i;
/** A trailing `:<line>` on a `file:line` target. */
const LINE_SUFFIX_RE = /:\d+$/;
/** Link text that names a file: has a `/` or ends in a file extension. */
const PATH_LIKE_TEXT_RE = /\/|\.[A-Za-z][A-Za-z0-9]{0,7}$/;

/** The slice of an mdast node this module reads. */
interface MdNode {
  type: string;
  children?: MdNode[];
  value?: string;
  url?: string;
  identifier?: string;
  alt?: string | null;
  position?: { start: { offset?: number }; end: { offset?: number } };
}

type Target = { kind: 'scheme' } | { kind: 'grounded'; path: string } | { kind: 'ungrounded' };

interface Edit {
  start: number;
  end: number;
  text: string;
}

function parseMarkdown(md: string): MdNode {
  return fromMarkdown(md, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }) as unknown as MdNode;
}

function spanOf(node: MdNode): [number, number] | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start === undefined || end === undefined ? null : [start, end];
}

/**
 * The repo path a target points at, or null when it can't be one (`..` segment,
 * empty). Leading `./` and `/` are stripped; `#…`/`?…` ignored.
 */
function repoPathOf(target: string): string | null {
  let p = target.replace(/[#?].*$/, '');
  for (;;) {
    if (p.startsWith('./')) p = p.slice(2);
    else if (p.startsWith('/')) p = p.slice(1);
    else break;
  }
  if (p === '') return null;
  try {
    p = decodeURIComponent(p);
  } catch {
    // keep the raw text; a malformed escape just won't match a file
  }
  if (p.split('/').some((s) => s === '..')) return null;
  return p;
}

function resolveTarget(url: string, fileSet: ReadonlySet<string>): Target {
  if (SAFE_SCHEME_RE.test(url)) return { kind: 'scheme' };
  const path = repoPathOf(url);
  if (path === null) return { kind: 'ungrounded' };
  if (fileSet.has(path)) return { kind: 'grounded', path };
  // `file:line` — the path without the line suffix, like a `#L10` fragment (G1).
  const file = path.replace(LINE_SUFFIX_RE, '');
  return file !== path && fileSet.has(file) ? { kind: 'grounded', path: file } : { kind: 'ungrounded' };
}

function inlineCode(path: string): string {
  return path.includes('`') ? `\`\` ${path} \`\`` : `\`${path}\``;
}

/** A text value as literal Markdown: nothing in it can open a link or emphasis. */
function escapeText(value: string): string {
  return value.replace(/[\\[\]*_`<!]/g, '\\$&');
}

/** Escapes the raw `[`/`]` of a source slice (existing escapes are kept). */
function escapeBrackets(src: string): string {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (c === '\\') {
      out += src.slice(i, i + 2);
      i++;
    } else {
      out += c === '[' || c === ']' ? `\\${c}` : c;
    }
  }
  return out;
}

function plainText(node: MdNode): string {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value ?? '';
  if (node.type === 'image' || node.type === 'imageReference') return node.alt ?? '';
  return (node.children ?? []).map(plainText).join('');
}

/** Link text re-emitted as safe Markdown: formatting kept, no link syntax left. */
function renderInline(node: MdNode, src: string): string {
  const span = spanOf(node);
  switch (node.type) {
    case 'text':
      return escapeText(node.value ?? '');
    case 'image':
    case 'imageReference':
      return escapeText(node.alt ?? '');
    case 'inlineCode':
      return span ? src.slice(span[0], span[1]) : escapeText(node.value ?? '');
  }
  const children = node.children ?? [];
  if (!span) return children.map((c) => renderInline(c, src)).join('');
  if (children.length === 0) return escapeBrackets(src.slice(span[0], span[1]));
  const first = spanOf(children[0]!);
  const last = spanOf(children[children.length - 1]!);
  const open = first ? src.slice(span[0], first[0]) : '';
  const close = last ? src.slice(last[1], span[1]) : '';
  return open + children.map((c) => renderInline(c, src)).join('') + close;
}

/** The text an ungrounded link or image leaves behind: none when it names a path. */
function leftoverText(node: MdNode, src: string): string {
  if (PATH_LIKE_TEXT_RE.test(plainText(node).trim())) return '';
  return node.type === 'image' || node.type === 'imageReference'
    ? escapeText(node.alt ?? '')
    : (node.children ?? []).map((c) => renderInline(c, src)).join('');
}

/** Node types whose source must never be bracket-escaped (code, raw HTML, kept links). */
const VERBATIM_TYPES = new Set(['code', 'inlineCode', 'html', 'footnoteReference']);

/** Escapes the raw `[`/`]` of `src` outside the given (sorted, disjoint) spans. */
function escapeOutside(src: string, keep: readonly [number, number][]): string {
  let out = '';
  let at = 0;
  for (const [start, end] of keep) {
    if (start < at) continue;
    out += escapeBrackets(src.slice(at, start)) + src.slice(start, end);
    at = end;
  }
  return out + escapeBrackets(src.slice(at));
}

function sortedSpans(spans: [number, number][]): [number, number][] {
  return spans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
}

function definitionsOf(tree: MdNode): Map<string, MdNode> {
  const definitions = new Map<string, MdNode>();
  const collect = (node: MdNode) => {
    if (node.type === 'definition' && node.identifier && !definitions.has(node.identifier)) {
      definitions.set(node.identifier, node);
    }
    node.children?.forEach(collect);
  };
  collect(tree);
  return definitions;
}

/**
 * One grounding pass over BOM-free Markdown. When anything is rewritten, every raw
 * `[`/`]` outside the rewritten spans, code, raw HTML and kept (scheme) links is
 * escaped, so the splice can't pair leftover brackets into a new link.
 */
function groundOnce(md: string, fileSet: ReadonlySet<string>): { md: string; removed: number } {
  const tree = parseMarkdown(md);
  const definitions = definitionsOf(tree);
  const edits: Edit[] = [];
  const verbatim: [number, number][] = [];
  let removed = 0;

  const replace = (node: MdNode, text: string) => {
    const span = spanOf(node);
    if (span) edits.push({ start: span[0], end: span[1], text });
  };
  const keepVerbatim = (node: MdNode) => {
    const span = spanOf(node);
    if (span) verbatim.push(span);
  };

  const walk = (node: MdNode): void => {
    switch (node.type) {
      case 'link':
      case 'image': {
        const target = resolveTarget(node.url ?? '', fileSet);
        if (target.kind === 'scheme') {
          // Kept as written; an image inside it is still grounded.
          const span = spanOf(node);
          const children = node.children ?? [];
          if (!span || children.length === 0) return keepVerbatim(node);
          const first = spanOf(children[0]!);
          const last = spanOf(children[children.length - 1]!);
          if (first) verbatim.push([span[0], first[0]]);
          if (last) verbatim.push([last[1], span[1]]);
          break;
        }
        if (target.kind === 'grounded') replace(node, inlineCode(target.path));
        else {
          removed++;
          replace(node, leftoverText(node, md));
        }
        return;
      }
      case 'linkReference':
      case 'imageReference': {
        const def = node.identifier ? definitions.get(node.identifier) : undefined;
        if (!def) break;
        const target = resolveTarget(def.url ?? '', fileSet);
        if (target.kind === 'scheme') return keepVerbatim(node);
        // An ungrounded reference is counted once, at its definition.
        replace(node, target.kind === 'grounded' ? inlineCode(target.path) : leftoverText(node, md));
        return;
      }
      case 'definition': {
        const target = resolveTarget(node.url ?? '', fileSet);
        if (target.kind === 'scheme') return keepVerbatim(node);
        if (target.kind === 'ungrounded') removed++;
        replace(node, '');
        return;
      }
      case 'footnoteDefinition': {
        // Keep the `[^id]:` label; the body is walked.
        const span = spanOf(node);
        const first = node.children?.[0] ? spanOf(node.children[0]) : null;
        if (span) verbatim.push([span[0], first ? first[0] : span[1]]);
        break;
      }
      default:
        if (VERBATIM_TYPES.has(node.type)) return keepVerbatim(node);
    }
    node.children?.forEach(walk);
  };
  walk(tree);

  if (edits.length === 0) return { md, removed };
  const keep = sortedSpans([...edits.map((e): [number, number] => [e.start, e.end]), ...verbatim]);
  // Escape outside every kept span, then splice the edits (offsets are unchanged
  // inside kept spans, so splice from a map of edit start → escaped-text position).
  let out = '';
  let at = 0;
  const byStart = new Map(edits.map((e) => [e.start, e]));
  for (const [start, end] of keep) {
    if (start < at) continue;
    out += escapeBrackets(md.slice(at, start));
    const edit = byStart.get(start);
    out += edit && edit.end === end ? edit.text : md.slice(start, end);
    at = end;
  }
  out += escapeBrackets(md.slice(at));
  return { md: out, removed };
}

/** Whether a renderer would still show any link, image or definition to a non-safe-scheme target. */
function hasLiveRepoLink(md: string): boolean {
  const tree = parseMarkdown(md);
  const definitions = definitionsOf(tree);
  const schemeless = (url: string | undefined) => !SAFE_SCHEME_RE.test(url ?? '');
  const live = (node: MdNode): boolean => {
    if (node.type === 'link' || node.type === 'image' || node.type === 'definition') {
      if (schemeless(node.url)) return true;
    }
    if (node.type === 'linkReference' || node.type === 'imageReference') {
      const def = node.identifier ? definitions.get(node.identifier) : undefined;
      if (def && schemeless(def.url)) return true;
    }
    return (node.children ?? []).some(live);
  };
  return live(tree);
}

/** Last resort: no unescaped bracket outside code blocks, so nothing can be a link. */
function escapeAllBrackets(md: string): string {
  const blocks: [number, number][] = [];
  const collect = (node: MdNode) => {
    if (node.type === 'code') {
      const span = spanOf(node);
      if (span) blocks.push(span);
      return;
    }
    node.children?.forEach(collect);
  };
  collect(parseMarkdown(md));
  return escapeOutside(md, sortedSpans(blocks));
}

/** Passes after the first only clean up links the previous splice made live. */
const MAX_GROUNDING_PASSES = 3;

/**
 * Grounds LLM Markdown (AC-57, AC-79, A2):
 * - a link, image or reference to a file in `fileSet` becomes inline code of the path;
 * - a `file:line` target is grounded by its file part (the line suffix is dropped);
 * - one to anything else without a safe scheme is removed — its text stays as plain text
 *   unless it names a path — and counted; a definition with such a target is removed
 *   and counted once;
 * - links with a safe scheme (http, https, irc, ircs, mailto, xmpp), code spans and
 *   code blocks are left as written.
 * Fails closed: the output is re-parsed and grounded again while any schemeless link
 * (any target without a safe scheme) is still live (≤ 3 passes); if one survives, every bracket outside code blocks is
 * escaped. `removed` counts every link removed across passes. Unchanged input is returned
 * byte-identical; a leading BOM is kept (micromark skips it, which shifts offsets).
 */
export function groundMarkdown(
  md: string,
  fileSet: ReadonlySet<string>,
): { md: string; removed: number } {
  const bom = md.startsWith('﻿') ? '﻿' : '';
  const first = groundOnce(bom ? md.slice(1) : md, fileSet);
  let text = first.md;
  let removed = first.removed;
  for (let pass = 1; pass < MAX_GROUNDING_PASSES && hasLiveRepoLink(text); pass++) {
    // A later pass only sees links the previous splice made live (e.g. a code span
    // split by a GFM table), so its removals are new ones, not recounts.
    const next = groundOnce(text, fileSet);
    text = next.md;
    removed += next.removed;
  }
  if (hasLiveRepoLink(text)) text = escapeAllBrackets(text);
  return { md: bom + text, removed };
}

// ---------------------------------------------------------------------------
// Run steps (AC-62, AC-83, A8). R6 rejected: only the program and the existence
// of named scripts and files are checked.
// ---------------------------------------------------------------------------

export interface RunStepContext {
  pm: PackageManager | null;
  scriptsByDir: ScriptsByDir;
  fileSet: ReadonlySet<string>;
}

/** Package-manager commands that never name a script. */
const PM_BUILTINS = new Set(['install', 'i', 'ci', 'add', 'exec', 'dlx']);
/** npm runs a script without `run` only for these. */
const NPM_BARE_SCRIPTS = new Set(['start', 'test', 'stop', 'restart']);
/** Flags whose value picks the package directory. */
const DIR_FLAGS = new Set(['--dir', '-C', '--prefix']);
/**
 * Flags whose value names one workspace package: the value must be a package directory
 * (a key of `scriptsByDir` — the facts carry no package names) and the script must
 * exist in THAT package (G2).
 */
const WORKSPACE_VALUE_FLAGS = new Set(['--filter', '-F', '--workspace']);
/** Flags that run in every workspace package: the script may live in any package. */
const WORKSPACE_BARE_FLAGS = new Set(['-r', '--recursive', '--workspaces', '-ws']);
const PATH_LIKE_ARG_RE = /\/|\.[A-Za-z][A-Za-z0-9]*$/;

function normDir(d: string): string {
  let p = d;
  while (p.startsWith('./')) p = p.slice(2);
  p = p.replace(/\/+$/, '');
  return p === '' ? '.' : p;
}

/** A token without its surrounding matching quotes (`".env.example"` → `.env.example`). */
function unquote(token: string): string {
  const m = /^(['"])(.*)\1$/.exec(token);
  return m ? m[2]! : token;
}

/** A value that names a path (has a `/` or a file extension) must be a file of the tree. */
function pathValueExists(value: string, fileSet: ReadonlySet<string>): boolean {
  const v = unquote(value);
  return !PATH_LIKE_ARG_RE.test(v) || fileSet.has(normDir(v));
}

/** Operands and flags' inline `=value`s that name paths must exist (quotes stripped). */
function pathArgsExist(args: readonly string[], fileSet: ReadonlySet<string>): boolean {
  return args.every((raw) => {
    const a = unquote(raw);
    if (!a.startsWith('-')) return pathValueExists(a, fileSet);
    const eq = a.indexOf('=');
    return eq < 0 || pathValueExists(a.slice(eq + 1), fileSet);
  });
}

function hasScript(scripts: ScriptsByDir, dir: string, name: string): boolean {
  const s = scripts[dir];
  return !!s && Object.hasOwn(s, name);
}

function validPmCommand(pm: PackageManager, args: readonly string[], ctx: RunStepContext): boolean {
  let dir = '.';
  let anyPackage = false;
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i]!;
    if (!a.startsWith('-')) break;
    const [flag, inline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, null];
    // npm `-w <name>` picks a workspace; pnpm `-w` is the bare "workspace root" flag.
    const takesWorkspace = WORKSPACE_VALUE_FLAGS.has(flag) || (pm === 'npm' && flag === '-w');
    if (DIR_FLAGS.has(flag) || takesWorkspace) {
      const value = inline ?? args[++i];
      if (value === undefined) return false;
      dir = normDir(unquote(value));
      // a named package must be a package directory of the tree (G2)
      if (takesWorkspace && !Object.hasOwn(ctx.scriptsByDir, dir)) return false;
    } else if (WORKSPACE_BARE_FLAGS.has(flag)) {
      anyPackage = true;
    }
  }
  const word = args[i];
  if (word === undefined) return pm === 'yarn'; // a bare `yarn` installs
  const scriptExists = (name: string) =>
    anyPackage
      ? Object.keys(ctx.scriptsByDir).some((d) => hasScript(ctx.scriptsByDir, d, name))
      : hasScript(ctx.scriptsByDir, dir, name);

  // Arguments after the script name (and after `--`) reach the script: files must exist.
  if (word === 'run' || word === 'run-script') {
    const rest = args.slice(i + 1);
    const at = rest.findIndex((a) => !a.startsWith('-'));
    const name = rest[at];
    return name !== undefined && scriptExists(name) && pathArgsExist(rest.slice(at + 1), ctx.fileSet);
  }
  const after = args.slice(i + 1);
  if (PM_BUILTINS.has(word)) return pathArgsExist(after, ctx.fileSet);
  if (pm === 'npm' && !NPM_BARE_SCRIPTS.has(word)) return false;
  return scriptExists(word) && pathArgsExist(after, ctx.fileSet);
}

/**
 * Whether an LLM run step may be shown (AC-62, AC-83): the program is allowed,
 * named scripts exist in the picked `package.json` (`--filter`/`--workspace <dir>`
 * picks one package; `-r`/`--recursive`/`--workspaces` accepts any package), `node`'s
 * entry script and path-like arguments — quoted or a flag's `=value` — are files of
 * the tree (except `cp`'s destination, Q1). A token starting with `#`
 * and the rest of the line are a comment.
 */
export function validateRunStep(cmd: string, ctx: RunStepContext): boolean {
  // A `#` starts a comment only at the start of a token (`a.js#x` is one argument).
  const all = cmd.trim().split(/\s+/).filter(Boolean);
  const comment = all.findIndex((t) => t.startsWith('#'));
  const tokens = comment < 0 ? all : all.slice(0, comment);
  const [program, ...args] = tokens;
  if (!program) return false;

  if (program === 'docker') {
    if (args[0] !== 'compose') return false;
    return pathArgsExist(args.slice(1), ctx.fileSet);
  }
  if (ctx.pm && program === ctx.pm) return validPmCommand(ctx.pm, args, ctx);
  if (!(BASE_PROGRAMS as readonly string[]).includes(program)) return false;

  switch (program) {
    case 'make':
      return MAKEFILES.some((f) => ctx.fileSet.has(f));
    case 'cp': {
      const operands = args.filter((a) => !a.startsWith('-'));
      if (operands.length < 2) return false;
      return pathArgsExist(operands.slice(0, -1), ctx.fileSet);
    }
    case 'node': {
      // the first operand is the entry script: it must be a file of the tree (G2)
      const entry = args.find((a) => !a.startsWith('-'));
      if (entry === undefined || !ctx.fileSet.has(normDir(unquote(entry)))) return false;
      return pathArgsExist(args, ctx.fileSet);
    }
    default: // npx
      return pathArgsExist(args, ctx.fileSet);
  }
}
