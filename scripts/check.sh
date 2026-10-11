#!/usr/bin/env bash
#
# Package checks with compact output — the one verification command for agents
# (implementer, test-writer, plan-verifier) and people.
#
#   ./scripts/check.sh                    # packages changed vs main (commits + tree + untracked)
#   ./scripts/check.sh server client      # these packages
#   ./scripts/check.sh --related server   # unit tests related to the changed files only
#   ./scripts/check.sh --it server        # + Postgres integration tests (*.it.test.ts, Docker)
#   ./scripts/check.sh --base origin/main # compare against another ref
#
# Per package: typecheck · unit tests · arch:check (server). A reviewer-core change also
# typechecks the server (it compiles reviewer-core's source). Packages run in parallel.
# Prints one line per command; a failure adds a short excerpt (tsc errors / failing
# tests), not the full log. Exit 0 = all green, 1 = a check failed, 2 = cannot run
# (missing node_modules, unknown package, bad arguments).
#
# Writes nothing in the repo — logs go to a temp dir that is removed on exit.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KNOWN=(server client reviewer-core mcp e2e)
RELATED=0 IT=0 BASE="" PKGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --related) RELATED=1 ;;
    --it) IT=1 ;;
    --base) BASE="${2:-}"; shift ;;
    -h|--help) sed -n '3,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "check.sh: unknown option $1" >&2; exit 2 ;;
    *) PKGS+=("$1") ;;
  esac
  shift
done

cd "$ROOT" || exit 2

# Files changed on this branch: commits since the merge-base + staged + unstaged + untracked.
changed_files() {
  local base="$BASE"
  if [[ -z "$base" ]]; then
    git rev-parse -q --verify origin/main >/dev/null && base=origin/main || base=main
  fi
  local mb
  mb="$(git merge-base "$base" HEAD 2>/dev/null)" || { echo "check.sh: no merge-base with $base" >&2; exit 2; }
  { git diff --name-only "$mb"; git ls-files -o --exclude-standard; } | sort -u
}
CHANGED="$(changed_files)"

if [[ ${#PKGS[@]} -eq 0 ]]; then
  for p in "${KNOWN[@]}"; do
    grep -q "^$p/" <<<"$CHANGED" && PKGS+=("$p")
  done
  if [[ ${#PKGS[@]} -eq 0 ]]; then
    echo "check.sh: no package changed — nothing to check"
    exit 0
  fi
fi
for p in "${PKGS[@]}"; do
  [[ " ${KNOWN[*]} " == *" $p "* ]] || { echo "check.sh: unknown package '$p' (known: ${KNOWN[*]})" >&2; exit 2; }
done
# reviewer-core is compiled by the server: its change needs the server typecheck too.
if [[ " ${PKGS[*]} " == *" reviewer-core "* && " ${PKGS[*]} " != *" server "* ]]; then
  SERVER_TYPECHECK_ONLY=1
  PKGS+=(server)
else
  SERVER_TYPECHECK_ONLY=0
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/devdigest-check.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# Changed source/test files of one package, relative to it — input for `vitest related`.
pkg_changed() {
  grep "^$1/" <<<"$CHANGED" | sed "s#^$1/##" | grep -E '\.(ts|tsx|mts|js|mjs)$' | while read -r f; do
    [[ -f "$ROOT/$1/$f" ]] && echo "$f"
  done
}

# Each job: "<pkg>|<label>|<command>"
JOBS=()
add() { JOBS+=("$1|$2|$3"); }
pm() { [[ "$1" == reviewer-core || "$1" == e2e ]] && echo npm || echo pnpm; }

for p in "${PKGS[@]}"; do
  m="$(pm "$p")"
  tc="$m run -s typecheck"
  add "$p" typecheck "$tc"
  [[ "$p" == e2e ]] && continue
  [[ "$p" == server && $SERVER_TYPECHECK_ONLY -eq 1 ]] && continue

  excl=""
  [[ "$p" == server ]] && excl="--exclude '**/*.it.test.ts'"
  runner="$m exec vitest"
  [[ "$m" == npm ]] && runner="npx --no-install vitest"
  if [[ $RELATED -eq 1 ]]; then
    files="$(pkg_changed "$p" | tr '\n' ' ')"
    if [[ -n "${files// }" ]]; then
      add "$p" "tests (related)" "$runner related --run --passWithNoTests --reporter=dot $excl $files"
    else
      add "$p" "tests (related)" "echo 'no changed files'"
    fi
  else
    add "$p" tests "$runner run --passWithNoTests --reporter=dot $excl"
  fi
  [[ "$p" == server ]] && add "$p" arch:check "pnpm run -s arch:check"
  [[ "$p" == server && $IT -eq 1 ]] && add "$p" "integration (*.it.test.ts)" "pnpm exec vitest run --reporter=dot .it.test"
done

# Missing node_modules → cannot run (never reported as green).
missing=0
for p in "${PKGS[@]}"; do
  if [[ ! -d "$ROOT/$p/node_modules" ]]; then
    echo "✗ $p — no node_modules: cd $p && $( [[ $(pm "$p") == npm ]] && echo 'npm ci' || echo 'pnpm install')"
    missing=1
  fi
done
[[ " ${PKGS[*]} " == *" server "* && ! -d "$ROOT/reviewer-core/node_modules" ]] && {
  echo "✗ server needs reviewer-core deps: cd reviewer-core && npm ci"; missing=1; }
[[ $missing -eq 1 ]] && exit 2

# Run jobs: packages in parallel, commands of one package in order (tsc and vitest
# of the same package compete for the same CPU less than you'd think, but keeping
# them serial keeps the per-package log readable).
run_pkg() {
  local pkg="$1" i=0 job label cmd start rc
  for job in "${JOBS[@]}"; do
    [[ "${job%%|*}" == "$pkg" ]] || continue
    i=$((i + 1))
    label="$(cut -d'|' -f2 <<<"$job")"; cmd="$(cut -d'|' -f3- <<<"$job")"
    start=$SECONDS
    (cd "$ROOT/$pkg" && eval "$cmd") >"$TMP/$pkg.$i.log" 2>&1
    rc=$?
    echo "$rc|$((SECONDS - start))|$label|$cmd" >"$TMP/$pkg.$i.res"
  done
}
for p in "${PKGS[@]}"; do run_pkg "$p" & done
wait

# Short failure excerpt: tsc errors, failing tests and assertion lines; else the tail.
excerpt() {
  local log="$1" hits
  hits="$(grep -E 'error TS[0-9]+|^ *(FAIL|×|✗) |AssertionError|Error: |Expected|Received|❯ .*:[0-9]+:[0-9]+|\(from|error [a-z-]+:' "$log" | head -40)"
  if [[ -n "$hits" ]]; then echo "$hits"; else tail -n 25 "$log"; fi
}

fail=0
for p in "${PKGS[@]}"; do
  for res in "$TMP/$p".*.res; do
    [[ -f "$res" ]] || continue
    IFS='|' read -r rc secs label cmd <"$res"
    # arch:check like hard-checks.mjs: only violations from files this branch changed
    # count. A worktree's hoisted node_modules makes 5 baseline entries stop matching
    # (server/INSIGHTS.md) — those are pre-existing, not this change's fault.
    if [[ "$rc" -ne 0 && "$label" == arch:check ]]; then
      froms="$(grep -oE '^ *error [a-z-]+: src/[^ ]+' "${res%.res}.log" | sed -E 's#.*: #server/#' | sort -u)"
      if [[ -n "$froms" ]] && ! grep -qxF -f <(echo "$froms") <<<"$CHANGED"; then
        echo "⚠ $p $label — exit $rc, but only pre-existing violations (no file of this branch) — not counted"
        continue
      fi
    fi
    if [[ "$rc" -eq 0 ]]; then
      summary="$(grep -E '^ *Tests +[0-9]' "${res%.res}.log" | tail -1 | sed 's/^ *//')"
      echo "✓ $p $label (${secs}s)${summary:+ — $summary}"
    else
      fail=1
      echo "✗ $p $label — exit $rc (${secs}s) · cwd $p: $cmd"
      excerpt "${res%.res}.log" | sed 's/^/    /'
    fi
  done
done
exit $fail
