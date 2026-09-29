#!/usr/bin/env node
// PreToolUse hook (matcher: Bash) for the read-only agents: planner,
// architecture-reviewer, plan-verifier, researcher. Their prompts already forbid
// writes, but Bash can still write (`sed -i`, `>`, `git checkout`), so this hook
// enforces it. Exit 2 blocks the call and shows stderr to the agent.
//
// It is a denylist of file-changing commands, not a sandbox: it stops the usual
// ways an agent changes the tree, and it blocks interpreters and `sh -c` so the
// usual ways around it are closed too. Test: node .claude/hooks/readonly-bash.test.mjs

import { readFileSync } from 'node:fs';

const MUTATING_CMDS = new Set([
  'rm', 'rmdir', 'mv', 'cp', 'mkdir', 'touch', 'chmod', 'chown', 'chgrp', 'ln',
  'dd', 'truncate', 'tee', 'install', 'patch', 'shred', 'unlink', 'rsync',
  'curl', 'wget', 'docker', 'docker-compose', 'sudo', 'npx',
  // interpreters and shells can write anything
  'sh', 'bash', 'zsh', 'eval', 'exec', 'source', '.', 'python', 'python3',
  'node', 'perl', 'ruby', 'php', 'awk', 'gawk', 'xargs',
]);
const GIT_MUTATING = /^(add|am|apply|checkout|cherry-pick|clean|commit|fetch|gc|init|merge|mv|pull|push|rebase|reset|restore|revert|rm|stash|switch|tag|worktree|update-ref|config|submodule)$/;
const PKG_MUTATING = /^(i|install|add|remove|rm|uninstall|update|up|upgrade|ci|link|unlink|dlx|prune|dedupe|publish|patch)$/;
const SCRIPT_MUTATING = /(^|:)(db:(migrate|generate|push|seed)|arch:baseline|seed|format|fix)$|^lint:fix$/;

export function check(command) {
  // `$(…)` inside double quotes still runs; everywhere else quoted text is data
  // (grep patterns), so it is dropped before looking for redirects and commands.
  if (/"(?:[^"\\]|\\.)*(\$\(|`)(?:[^"\\]|\\.)*"/.test(command)) return 'command substitution inside quotes';
  const unquoted = command.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, ' Q ');

  const noSafeRedirects = unquoted
    .replace(/\d*>&\d/g, ' ')
    .replace(/&?\d*>{1,2}\s*\/dev\/null/g, ' ');
  if (/>/.test(noSafeRedirects)) return 'output redirection into a file';

  // Commands inside $(…), `…` and <(…) are checked like top-level ones.
  const flat = unquoted.replace(/\$\(|<\(|[()`]/g, ' ; ');
  for (const raw of flat.split(/&&|\|\||[;|&\n]/)) {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    while (words[0] && /^\w+=/.test(words[0])) words.shift(); // FOO=1 cmd
    if (words[0] === 'env' || words[0] === 'command' || words[0] === 'time') words.shift();
    const [cmd, sub, ...rest] = words;
    if (!cmd) continue;
    const base = cmd.split('/').pop();

    if (MUTATING_CMDS.has(base)) return `\`${base}\` can change files`;
    if (cmd.startsWith('./') || cmd.startsWith('scripts/')) return 'running repo scripts';
    if (base === 'sed' && words.some((w) => /^-[a-zA-Z]*i|^--in-place/.test(w))) return '`sed -i`';
    if (base === 'find' && words.some((w) => /^-(delete|exec|execdir|ok|okdir|fprint\w*|fls)$/.test(w))) {
      return '`find` with -delete/-exec';
    }
    if (base === 'git') {
      // Skip global options, including the ones that take a value (`-C dir`).
      const gitArgs = words.slice(1);
      let i = 0;
      while (gitArgs[i]?.startsWith('-')) i += /^-(C|c)$|^--(git-dir|work-tree|namespace)$/.test(gitArgs[i]) ? 2 : 1;
      const gitSub = gitArgs[i];
      if (gitSub && GIT_MUTATING.test(gitSub)) return `\`git ${gitSub}\` changes repo state`;
      if (gitSub === 'branch' && words.some((w) => /^-[dDmMcC]$|^--(delete|move|copy)$/.test(w))) {
        return '`git branch` with delete/move';
      }
    }
    if (base === 'pnpm' || base === 'npm' || base === 'yarn') {
      const args = [sub, ...rest].filter((w) => w && !w.startsWith('-'));
      const verb = args[0] === 'run' ? args[1] : args[0];
      if (verb && PKG_MUTATING.test(verb)) return `\`${base} ${verb}\` changes dependencies`;
      if (verb && SCRIPT_MUTATING.test(verb)) return `\`${base} ${verb}\` writes files or the DB`;
    }
    if ((base === 'vitest' || words.includes('vitest')) && words.some((w) => w === '-u' || w === '--update')) {
      return 'snapshot update';
    }
  }
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let command = '';
  try {
    command = JSON.parse(readFileSync(0, 'utf8')).tool_input?.command ?? '';
  } catch {
    process.exit(0); // not our input shape — let the normal permission flow decide
  }
  const reason = check(command);
  if (reason) {
    process.stderr.write(
      `Blocked by read-only guard: ${reason}. This agent is read-only — ` +
        `use read commands (cat, sed -n, rg, git log/show/diff) or report the need instead.\n`,
    );
    process.exit(2);
  }
}
