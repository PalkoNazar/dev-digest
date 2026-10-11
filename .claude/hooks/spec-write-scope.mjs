#!/usr/bin/env node
// PreToolUse hook (matcher: Write|Edit) for the spec-creator agent. Claude Code has no
// path-scoped Write, so this hook is the write scope: a spec file directly inside one
// of SPEC_DIRS, `*.md`, not a README, and — if it already exists — still a draft.
// Sub-folders (`specs/plans/`, `<pkg>/specs/designs/`) and `e2e/specs/` are outside.
// The file the call produces must still say `Status: draft` (once, in its header):
// approval is the user's call. Exit 2 blocks the call and shows stderr to the agent.
// Test: node .claude/hooks/spec-write-scope.test.mjs

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SPEC_DIRS = ['specs', 'client/specs', 'server/specs', 'reviewer-core/specs', 'mcp/specs'];
const HEADER_LINES = 5;

// Resolves symlinks of the deepest existing ancestor, so a linked folder can't
// smuggle a write out of the repo.
function realish(p) {
  let head = p;
  const tail = [];
  while (!existsSync(head)) {
    tail.unshift(path.basename(head));
    const up = path.dirname(head);
    if (up === head) return p;
    head = up;
  }
  return path.join(realpathSync(head), ...tail);
}

// The header must carry exactly one Status field, and it must be `draft`.
function isDraft(text) {
  const head = text.split('\n').slice(0, HEADER_LINES).join('\n');
  const statuses = [...head.matchAll(/Status:\s*([^\s|·]*)/gi)].map((m) => m[1].toLowerCase());
  return statuses.length === 1 && statuses[0] === 'draft';
}

// Content of the file after the call, the way the Edit tool would produce it.
function resultingContent(ti, current) {
  if (typeof ti.content === 'string') return ti.content;
  if (typeof ti.old_string !== 'string' || typeof ti.new_string !== 'string') return null;
  if (current === null || !current.includes(ti.old_string)) return current;
  return ti.replace_all ? current.split(ti.old_string).join(ti.new_string) : current.replace(ti.old_string, () => ti.new_string);
}

/**
 * @param {{ tool_name?: string, tool_input?: Record<string, unknown> }} input
 * @param {string} root repo root (CLAUDE_PROJECT_DIR)
 * @returns {string | null} reason to block, or null to allow
 */
export function check(input, root) {
  const ti = input.tool_input ?? {};
  const filePath = typeof ti.file_path === 'string' ? ti.file_path : '';
  if (!filePath) return 'no file_path';

  const realRoot = realish(path.resolve(root));
  const target = realish(path.resolve(realRoot, filePath));
  const rel = path.relative(realRoot, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return `${filePath} is outside the repo`;

  const dir = path.dirname(rel).split(path.sep).join('/');
  if (!SPEC_DIRS.includes(dir)) return `${rel} is not directly inside ${SPEC_DIRS.join(', ')}`;
  const base = path.basename(rel);
  if (!base.endsWith('.md')) return `${rel} is not a .md file`;
  if (base.toLowerCase() === 'readme.md') return 'spec folder READMEs are not specs';

  const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
  if (current !== null && !isDraft(current)) {
    return `${rel} is not a draft — write a new spec with "Supersedes:" instead of editing it`;
  }
  const next = resultingContent(ti, current);
  if (next === null) return 'cannot tell what the file will contain';
  if (!isDraft(next)) return 'the spec header must keep exactly one `Status: draft` — only the user approves';
  return null;
}

// Compare real file URLs: a raw `file://${argv[1]}` misses on paths with spaces or on
// Windows, and a missed check here would let every write through.
const isMain = () => {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1] ?? '')).href;
  } catch {
    return false;
  }
};

if (isMain()) {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    process.exit(0); // not our input shape — let the normal permission flow decide
  }
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const reason = check(input, root);
  if (reason) {
    process.stderr.write(
      `Blocked by spec write scope: ${reason}. spec-creator writes only draft specs ` +
        `(*.md directly in ${SPEC_DIRS.join(', ')}); report anything else to the calling session.\n`,
    );
    process.exit(2);
  }
}
