#!/usr/bin/env node
// PreToolUse hook (matcher: Bash) for the read-only agents: planner,
// architecture-reviewer, plan-verifier, researcher — and spec-creator, whose
// Write/Edit go through spec-write-scope.mjs. Their prompts already forbid
// Bash writes, but Bash can still write (`sed -i`, `>`, `git checkout`), so this hook
// enforces it. Exit 2 blocks the call and shows stderr to the agent.
//
// It is a denylist of file-changing commands, not a sandbox: it stops the usual
// ways an agent changes the tree, and it blocks interpreters and `sh -c` so the
// usual ways around it are closed too. Test: node .claude/hooks/readonly-bash.test.mjs

import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MUTATING_CMDS = new Set([
  'rm', 'rmdir', 'mv', 'cp', 'mkdir', 'touch', 'chmod', 'chown', 'chgrp', 'ln',
  'dd', 'truncate', 'tee', 'install', 'patch', 'shred', 'unlink', 'rsync',
  'curl', 'wget', 'docker', 'docker-compose', 'sudo', 'npx',
  'tar', 'zip', 'unzip', 'gzip', 'gunzip', 'split', 'csplit',
  // wrappers that run another command with their own options
  'nice', 'nohup', 'timeout', 'stdbuf', 'setsid', 'chroot', 'ionice', 'script', 'watch', 'flock',
  // interpreters and shells can write anything
  'sh', 'bash', 'zsh', 'eval', 'exec', 'source', '.', 'python', 'python3',
  'node', 'perl', 'ruby', 'php', 'awk', 'gawk', 'xargs',
]);
// Git is an allowlist: anything else — including aliases, which can run `!shell` — is blocked.
const GIT_READ = /^(log|show|diff|status|branch|grep|blame|rev-parse|ls-files|ls-tree|merge-base|cat-file|describe|shortlog|rev-list|name-rev|remote|for-each-ref|show-ref|diff-tree|range-diff|version|help)$/;
const BRANCH_LIST = /^(-[alrv]+|--(list|all|remotes|show-current|contains|no-contains|merged|no-merged|points-at|sort|format|verbose)(=.*)?)$/;
// Env vars that make git (or a pager) run a command.
const EXEC_ENV = /^(GIT_\w*|\w*PAGER|LESSOPEN|LESSCLOSE|EDITOR|VISUAL)=/;
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
    // FOO=1 cmd, env FOO=1 cmd, command cmd, time cmd — in any order.
    // A wrapper option (`env -i`, `command -p`) would otherwise be taken for the command.
    while (words[0] && (/^\w+=/.test(words[0]) || /^(env|command|time)$/.test(words[0].split('/').pop()))) {
      if (EXEC_ENV.test(words[0])) return `\`${words[0].split('=')[0]}\` can make a command run another`;
      const wrapper = words.shift();
      if (!wrapper.includes('=') && words[0]?.startsWith('-')) return `\`${wrapper} ${words[0]}\` — wrapper options are not allowed`;
    }
    const [cmd, sub, ...rest] = words;
    if (!cmd) continue;
    const base = cmd.split('/').pop();

    if (MUTATING_CMDS.has(base)) return `\`${base}\` can change files`;
    if (cmd.startsWith('./') || cmd.startsWith('scripts/')) return 'running repo scripts';
    if (base === 'sort' && words.some((w) => /^-[a-zA-Z]*o|^--output/.test(w))) return '`sort -o`';
    if (base === 'sed' && words.some((w) => /^-[a-zA-Z]*i|^--in-place/.test(w))) return '`sed -i`';
    if (base === 'find' && words.some((w) => /^-(delete|exec|execdir|ok|okdir|fprint\w*|fls)$/.test(w))) {
      return '`find` with -delete/-exec';
    }
    if (base === 'git') {
      // Skip global options, including the ones that take a value (`-C dir`).
      // `-c`/`--config-env` can define aliases or pagers that run shell commands.
      const gitArgs = words.slice(1);
      let i = 0;
      while (gitArgs[i]?.startsWith('-')) {
        if (/^-c$|^--(config-env|exec-path)/.test(gitArgs[i])) return `\`git ${gitArgs[i]}\` can run commands`;
        i += /^-C$|^--(git-dir|work-tree|namespace)$/.test(gitArgs[i]) ? 2 : 1;
      }
      const gitSub = gitArgs[i];
      const subArgs = gitArgs.slice(i + 1);
      if (gitSub && !GIT_READ.test(gitSub)) return `\`git ${gitSub}\` is not a read-only git command`;
      // `git diff/log/show --output=<file>` writes without any shell redirect.
      if (subArgs.some((w) => /^--output(=|$)/.test(w))) return '`git --output` writes a file';
      if (gitSub === 'grep' && subArgs.some((w) => /^-O|^--open-files-in-pager/.test(w))) return '`git grep -O` runs a command';
      if (gitSub === 'branch' && subArgs.length && !subArgs.some((w) => BRANCH_LIST.test(w))) {
        return '`git branch` without a list option creates, moves or deletes a branch';
      }
      if (gitSub === 'remote' && subArgs[0] && !/^(-v|--verbose|show|get-url)$/.test(subArgs[0])) {
        return '`git remote` that changes remotes';
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

// Compare real file URLs: a raw `file://${argv[1]}` misses on paths with spaces or on
// Windows, and a missed check here would let every command through.
const isMain = () => {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1] ?? '')).href;
  } catch {
    return false;
  }
};

if (isMain()) {
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
