---
name: flaky-test-hunter
description: When a diff adds or changes tests, flag patterns that make them flaky — real time and sleeps, order dependence, shared mutable state, unseeded randomness, real network.
type: rubric
metadata:
  author: community-example
  version: 1.2.0
---

# Flaky test hunter

A flaky test passes and fails on the same code. Flag, in test files of the diff:

1. **Real time**: `setTimeout`/`sleep` to "wait for" something, `Date.now()` or
   `new Date()` without fake timers, assertions on durations.
2. **Order dependence**: a test that relies on state left by a previous test
   (module-level variables, a DB row inserted in another `it`).
3. **Shared mutable state**: fixtures mutated in place and reused across tests.
4. **Randomness** without a fixed seed (`Math.random`, random ports, uuids asserted by value).
5. **Real network / filesystem** in a unit test.
6. **Async leaks**: a promise not awaited, so the assertion runs before the work ends.

For each finding, name the source of non-determinism and the fix (fake timers,
`beforeEach` reset, seed, mock adapter, `await`).

Severity: **WARNING** by default; **CRITICAL** only if the flake can hide a real
failure (e.g. an assertion that never runs).

To scan a whole repository for these patterns, run `scripts/find-flaky.sh`.
