#!/usr/bin/env bash
# Read-only helper for the engineering-insights skill. Never writes to the file.
#   check.sh <INSIGHTS.md>           entry count per section + existing titles (dedupe aid)
#   check.sh --verify <INSIGHTS.md>  exit 1 if git shows any existing line deleted/changed
set -euo pipefail

# ~100 entries per module file: past this, signal-to-noise drops (MindStudio: consolidate at 80–100).
MAX_ENTRIES=100

if [[ "${1:-}" == "--verify" ]]; then
  file="${2:?usage: check.sh --verify <file>}"
  if ! git ls-files --error-unmatch -- "$file" >/dev/null 2>&1; then
    echo "OK: $file is untracked (nothing existing to overwrite)"; exit 0
  fi
  removed="$(git diff -U0 HEAD -- "$file" | grep -E '^-' | grep -vE '^--- ' || true)"
  if [[ -n "$removed" ]]; then
    echo "FAIL: existing lines were deleted or changed in $file:" >&2
    echo "$removed" >&2
    exit 1
  fi
  echo "OK: $file has additions only"; exit 0
fi

file="${1:?usage: check.sh <file> | check.sh --verify <file>}"
[[ -f "$file" ]] || { echo "No such file: $file" >&2; exit 2; }

awk -v max="$MAX_ENTRIES" '
  /^## /  { section = substr($0, 4); if (!(section in count)) { order[++n] = section; count[section] = 0 } next }
  /^### / { count[section]++; total++; titles[total] = "[" section "] " substr($0, 5) }
  END {
    print "Entries per section:"
    for (i = 1; i <= n; i++) if (order[i] !~ /^[0-9]{4}-/) printf "  %-26s %d\n", order[i], count[order[i]]
    printf "Total sectioned entries: %d\n", total
    if (total > max) printf "WARN: more than %d entries - ask the user to consolidate or split into INSIGHTS-<domain>.md\n", max
    print "Existing titles:"
    for (i = 1; i <= total; i++) print "  " titles[i]
  }' "$file"

# Legacy entries (before sections) use top-level "## YYYY-MM-DD" headings.
legacy="$(grep -E '^## [0-9]{4}-[0-9]{2}-[0-9]{2}' "$file" || true)"
if [[ -n "$legacy" ]]; then
  echo "Legacy entries:"
  echo "$legacy" | sed 's/^## /  /'
fi
