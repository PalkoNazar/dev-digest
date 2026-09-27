---
name: corner-cases
description: When a diff adds or changes a function with tests, check that the tests hit its boundaries — empty, zero, negative, limit and limit ± 1, null/undefined — and flag the missing ones.
type: rubric
---

# Corner cases

Read the changed function's inputs and the thresholds in its body, then check the
tests against this list:

| Input kind | Must be tested |
|---|---|
| number with a threshold `x > N` / `x >= N` | exactly `N`, `N - 1`, `N + 1` |
| number in general | `0`, a negative, a fractional value when money is involved |
| string | `''`, whitespace only, very long |
| array / collection | empty, one element, duplicates |
| optional / nullable | `undefined` and `null` |
| dates / time | boundaries of the period, time zones if the code uses them |

- A threshold comparison (`>` vs `>=`) whose boundary value is **not** asserted is a
  finding — off-by-one bugs live exactly there. Cite the comparison line.
- Only report boundaries the code actually has; don't ask for a `null` test on a
  parameter the type system forbids from being null.

Severity: **WARNING** for a missing boundary on a comparison that decides the result;
**SUGGESTION** otherwise.
