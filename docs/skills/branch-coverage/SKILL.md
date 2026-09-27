---
name: branch-coverage
description: When a diff adds or changes a conditional branch in production code, flag every branch that no test in the diff exercises.
type: rubric
---

# Branch coverage

For every changed source file, list the branches the change introduces or alters:
`if` / `else`, `else if`, ternaries, `switch` cases, early `return` / `throw` guards,
`??` / `||` fallbacks, `catch` blocks and loop bodies that may run zero times.

Then pair each branch with the test(s) in the diff that make it run.

- A branch with **no test that reaches it** is a finding. Cite the line of the branch
  in the source file, and name the input that would take it.
- A test that only walks the happy path does **not** cover the guard / error / fallback
  branch next to it — "the function is tested" is not the same as "this branch is tested".
- Error branches count: a `throw`, a rejected promise, a `4xx` reply.

Severity:
- **WARNING** — an untested branch that changes the result (a different value, status
  code, or error).
- **CRITICAL** — an untested branch that handles money, auth, deletion or data loss.
- **SUGGESTION** — an untested branch that only logs or formats.
