// Shared helpers for the pr-self-review scripts. Node built-ins only — these scripts run
// from a git hook and from any worktree, so they cannot depend on a package's node_modules.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync,
  readlinkSync, realpathSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: opts.cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', opts.quiet ? 'ignore' : 'pipe'],
  });
}

export function tryGit(args, opts = {}) {
  try {
    return git(args, { ...opts, quiet: true }).trim();
  } catch {
    return null;
  }
}

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

export function repoRoot(cwd) {
  return git(['rev-parse', '--show-toplevel'], { cwd }).trim();
}

/**
 * Verdicts live in the git COMMON dir, not the working tree: every worktree of the clone
 * sees the same verdicts (review in one, push from another), and nothing can be committed.
 */
export function stateDir(cwd) {
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd }).trim();
  const dir = path.join(common, 'devdigest-self-review');
  mkdirSync(path.join(dir, 'verdicts'), { recursive: true });
  mkdirSync(path.join(dir, 'cache'), { recursive: true });
  mkdirSync(path.join(dir, 'runs'), { recursive: true });
  return dir;
}

/**
 * Hash of the committed diff `mergeBase..sha`. The pre-push hook recomputes it for the
 * pushed sha, so both sides must call exactly this function.
 */
export function committedDiffHash(mergeBase, sha, cwd) {
  const patch = git(
    ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '--binary',
      '--src-prefix=a/', '--dst-prefix=b/', mergeBase, sha],
    { cwd },
  );
  return sha256(patch);
}

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

// ---------- globs ----------

/** Minimal glob → RegExp: `**` any depth, `*` one segment, `?`, `{a,b}`. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        re += '(?:.*/)?';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      const alts = glob.slice(i + 1, end).split(',').map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&'));
      re += `(?:${alts.join('|')})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

// ---------- routing ----------

/** Split a markdown table row on unescaped pipes; `\|` becomes a literal `|`. */
function splitRow(line) {
  const cells = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (line[i] === '|') {
      cells.push(cur.trim());
      cur = '';
    } else cur += line[i];
  }
  cells.push(cur.trim());
  return cells.slice(1, -1);
}

const ticked = (cell) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

export function loadRouting(file = path.join(SKILL_DIR, 'references', 'routing.md')) {
  const text = readFileSync(file, 'utf8');
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('| `')) continue;
    const [globs, skills, group, content] = splitRow(line);
    rows.push({
      globs: ticked(globs),
      patterns: ticked(globs).map(globToRegExp),
      skills: ticked(skills),
      group: group.trim(),
      content: ticked(content ?? '')[0] ? new RegExp(ticked(content)[0]) : null,
    });
  }
  const never = [];
  const neverSection = text.split('## Never routed')[1]?.split('\n## ')[0] ?? '';
  for (const name of ticked(neverSection)) never.push(name);
  return { rows, never };
}

export const EXCLUDED = [
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)(dist|\.next|build|coverage|node_modules)\//,
  /^server\/src\/db\/migrations\//,
];

export function route(filePath, addedText, routing) {
  const skills = new Set();
  const groups = new Set();
  for (const row of routing.rows) {
    if (!row.patterns.some((p) => p.test(filePath))) continue;
    if (row.content && !row.content.test(addedText)) continue;
    for (const s of row.skills) skills.add(s);
    groups.add(row.group);
  }
  return { skills: [...skills].sort(), groups: [...groups].sort() };
}

// ---------- unified diff (-U0) ----------

/**
 * Parse `git diff -U0 -M` output into files with added lines (new-side numbers + text)
 * and removed line texts. Enough for grounding and the deterministic checks.
 */
export function parseUnifiedDiff(patch) {
  const files = [];
  let cur = null;
  let newLine = 0;
  let inHunk = false;
  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      cur = { path: m ? m[2] : line, oldPath: m ? m[1] : null, status: 'M', binary: false, added: [], removed: [] };
      files.push(cur);
      inHunk = false;
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('@@')) {
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      newLine = m ? Number(m[1]) : 0;
      inHunk = true;
    } else if (!inHunk) {
      if (line.startsWith('new file mode')) cur.status = 'A';
      else if (line.startsWith('deleted file mode')) cur.status = 'D';
      else if (line.startsWith('rename from ')) cur.status = 'R';
      else if (line.startsWith('Binary files ')) cur.binary = true;
    } else if (line.startsWith('+')) cur.added.push({ line: newLine++, text: line.slice(1) });
    else if (line.startsWith('-')) cur.removed.push(line.slice(1));
  }
  return files;
}

export function packageOf(filePath) {
  const top = filePath.split('/')[0];
  return ['server', 'client', 'reviewer-core', 'e2e', 'mcp'].includes(top) ? top : 'root';
}

/**
 * Read a working-tree file WITHOUT following symlinks — the only way these scripts read
 * repo files. A symlink (`notes.md -> ~/.devdigest/secrets.json`) would otherwise pull a
 * file from outside the repo into collect.json, the cache and the reviewer's context.
 *
 * → { kind: 'file', buf } | { kind: 'symlink', target } (the link text, as git stores it)
 *   | null (missing, not a regular file, or its directory resolves outside the repo).
 */
export function readWorkingFile(root, rel) {
  const abs = path.join(root, rel);
  let dir;
  let realRoot;
  try {
    realRoot = realpathSync(root);
    dir = realpathSync(path.dirname(abs));
  } catch {
    return null;
  }
  // O_NOFOLLOW only guards the last path segment; a symlinked parent dir is checked here.
  if (dir !== realRoot && !dir.startsWith(realRoot + path.sep)) return null;
  const file = path.join(dir, path.basename(abs));
  try {
    if (lstatSync(file).isSymbolicLink()) return { kind: 'symlink', target: readlinkSync(file) };
  } catch {
    return null;
  }
  let fd;
  try {
    // O_NOFOLLOW: a file swapped for a symlink after the lstat above fails with ELOOP
    // instead of being followed. O_NONBLOCK: a FIFO can't hang the hook.
    fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  } catch {
    return null;
  }
  try {
    return fstatSync(fd).isFile() ? { kind: 'file', buf: readFileSync(fd) } : null;
  } finally {
    closeSync(fd);
  }
}

/** Text of a regular working-tree file; null for symlinks, missing or special files. */
export function readWorkingText(root, rel) {
  const r = readWorkingFile(root, rel);
  return r?.kind === 'file' ? r.buf.toString('utf8') : null;
}

/** For files outside the repo (e.g. ~/.devdigest/secrets.json) — never for repo paths. */
export function readFileOrNull(file) {
  try {
    return existsSync(file) ? readFileSync(file, 'utf8') : null;
  } catch {
    return null;
  }
}

export const SEVERITIES = ['critical', 'major', 'minor', 'nit'];
export const severityRank = (s) => {
  const i = SEVERITIES.indexOf(s);
  return i === -1 ? SEVERITIES.length : i;
};
