---
name: engineering-insights
description: Captures non-obvious engineering insights into the INSIGHTS.md of the module being worked on (client, server, reviewer-core, e2e, or repo root for cross-package work). Use proactively when the user corrects the approach ("no, do it this way"), when a dead end, library quirk, recurring error and fix, unwritten convention or decision-with-reason is confirmed, and as a wrap-up at the end of any non-trivial task. Also on "add to insights", "remember this", "wrap up", "lessons learned", or /engineering-insights.
---

# Engineering insights

Append-only memory per module. Write what the next session in this module must know and
can't see in the code.

## When
- **Capture as you go** — once a finding is *confirmed* (fix works, cause proven).
- **Wrap-up** — at the end of a non-trivial task (a problem, a decision or a discovery).
- Strongest signals: the user corrected you · an approach failed · the same error twice.
- Skip trivial edits and config tweaks. Zero entries is a valid wrap-up.

## Where
| Task touched | File |
|---|---|
| `client/**` | `client/INSIGHTS.md` |
| `server/**` (incl. `modules/repo-intel`) | `server/INSIGHTS.md` |
| `reviewer-core/**` | `reviewer-core/INSIGHTS.md` |
| `e2e/**` | `e2e/INSIGHTS.md` |
| 2+ packages, `scripts/`, `docs/`, `specs/`, `.github/` | `INSIGHTS.md` (root) |

## Sections (fixed — never add or rename)
- **What Works** — approaches that worked here.
- **What Doesn't Work** — dead ends, antipatterns. Most valuable, most often skipped.
- **Codebase Patterns** — unwritten conventions; decisions *with their reason*.
- **Tool & Library Notes** — dependency and tooling quirks.
- **Recurring Errors & Fixes** — exact error → exact fix.
- **Session Notes** — one dated line per wrap-up.
- **Open Questions** — unverified hypotheses, unresolved oddities.

## Entry format
```
### YYYY-MM-DD — short title
ALWAYS/NEVER/Do X (one line).
Why: 1–2 lines. Evidence: `path/to/file.ts:42` or the command.
```

## Filter — skip the entry if it is
obvious from reading the code · already in a `AGENTS.md` or `docs/` · generic knowledge ·
a one-off · about code still in flux · a personal preference · a secret (never write keys/tokens).
Not proven yet → Open Questions. Must be actionable read cold, without this chat.

## Write — insert only, never overwrite
1. Read the whole target file and run `bash .claude/skills/engineering-insights/scripts/check.sh <file>`.
   Overlaps an existing entry → drop it. Contradicts one → leave the old entry untouched and start
   the new one with `Supersedes: "<old title>" (YYYY-MM-DD)`; the newer entry wins.
2. NEVER use `Write` on an existing `INSIGHTS.md` — it replaces the whole file.
3. Insert with `Edit`: `old_string` = the next section's `## <heading>` line, `new_string` =
   your entry + a blank line + that same heading. For **Open Questions** (last section) append
   with `cat >> <file> <<'EOF'`.
4. NEVER edit, move, reformat or delete existing lines — no typo fixes, no strike-through.
5. Run `check.sh --verify <file>`. Non-zero exit → stop and show the user the diff. Don't
   `git checkout` it yourself: that also wipes valid uncommitted entries.

## Promote
Tripped over the same insight a second time → insert a one-line Gotcha into the nearest
`AGENTS.md` and add to Session Notes: `promoted: "<title>" → <AGENTS.md path>`. Leave the entry as is.

## Wrap-up output
At most 5 entries + one Session Notes line. End your reply with the list of what was added
(file → section → title) so the user can spot-check it — INSIGHTS is a draft under review.

Good vs bad entries: [examples.md](examples.md).
