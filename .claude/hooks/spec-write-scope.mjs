#!/usr/bin/env node
// PreToolUse hook (matcher: Write|Edit) for the spec-creator agent. Claude Code has no
// path-scoped Write, so this hook is the write scope: a spec file directly inside one
// of SPEC_DIRS, `*.md`, not a README, and — if it already exists — still a draft.
// Sub-folders (`specs/plans/`, `<pkg>/specs/designs/`) and `e2e/specs/` are outside.
// The agent may never write a status other than `draft`: approval is the user's call.
// Exit 2 blocks the call and shows stderr to the agent.
// Test: node .claude/hooks/spec-write-scope.test.mjs

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

export const SPEC_DIRS = ['specs', 'client/specs', 'server/specs', 'reviewer-core/specs', 'mcp/specs'];
const NON_DRAFT_STATUS = /Status:\s*(approved|implemented|done|in-progress)\b/i;
const DRAFT_HEADER = /Status:\s*draft\b/i;

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

  if (existsSync(target)) {
    const head = readFileSync(target, 'utf8').split('\n').slice(0, 5).join('\n');
    if (!DRAFT_HEADER.test(head)) {
      return `${rel} is not a draft — write a new spec with "Supersedes:" instead of editing it`;
    }
  }

  const written = [ti.content, ti.new_string].filter((s) => typeof s === 'string').join('\n');
  if (NON_DRAFT_STATUS.test(written)) return 'only the user moves a spec past `Status: draft`';
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
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
