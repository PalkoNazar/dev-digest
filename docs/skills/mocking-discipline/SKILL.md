---
name: mocking-discipline
description: When a test in the diff mocks something, flag mocks of the code under test, assertions that only check a mock was called, and mocks that make the test pass whatever the code does.
type: convention
---

# Mocking discipline

Mock only what sits at the edge of the unit: network, clock, filesystem, randomness,
another service. In this codebase every outside dependency goes through an adapter
that has a mock in `adapters/mocks.ts` — use that, not ad-hoc `vi.mock` of internals.

Flag:
- **Mocking the unit under test** (or a pure helper it calls) — the test then checks
  the mock, not the code.
- **Assert-on-mock only**: `expect(fn).toHaveBeenCalled()` with no assertion on the
  result or state that the caller cares about.
- **Over-permissive mocks**: a mock that returns the expected value for any input,
  so a wrong argument would still pass.
- **Leaking mocks**: `vi.mock` / spies not restored between tests.

Severity: **WARNING** when the mock hides the behaviour the diff changes;
**SUGGESTION** otherwise.
