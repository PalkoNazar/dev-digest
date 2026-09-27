# L02 control experiment — the same agent without and with skills

Goal: show that a skill changes what an agent catches, and that you can see it in the
run trace. One agent (Test Quality Reviewer), one PR, two runs (skills off → skills on).

The agent's base prompt is deliberately short (`docs/agent-prompts/test-quality-reviewer.md`):
the detailed rubric lives in the skills (`docs/skills/`).
Results depend on the model — a small/cheap model shows the contrast most clearly;
a frontier model may catch part of it even without skills. Run it twice if a result
looks borderline.

## 0. Prepare a demo repo

Use a scratch GitHub repo (or a fork) that DevDigest has imported — **not**
`dev-digest` itself, so the fixtures don't end up in the product. The fixtures are
plain TypeScript files; the repo does not need to build.

## A. Test Quality — happy-path test only

PR content: `test-quality/src/pricing/discount.ts` + `discount.test.ts`.
`applyDiscount` has four branches (the `subtotal <= 0` guard, the member discount at
`>= 100`, the `WELCOME10` coupon, the `Math.max(0, …)` clamp); the test covers one.

```bash
git switch -c exp/discount-tests main
mkdir -p src/pricing && cp <dev-digest>/docs/experiments/L02-skills/test-quality/src/pricing/* src/pricing/
git add src/pricing && git commit -m "feat(pricing): member discount + WELCOME10 coupon"
git push -u origin exp/discount-tests   # open the PR on GitHub
```

1. DevDigest → the demo repo → Pull Requests → sync → open the PR.
2. **Without skills**: Agents → Test Quality Reviewer → Skills → untick every skill
   (or detach them). Run Review → Test Quality Reviewer.
   Expected: approve / only generic remarks; the untested branches are missed.
3. **With skills**: tick `branch-coverage`, `corner-cases` (and the others). Run again.
   Expected findings on `discount.ts` / `discount.test.ts`:
   - the `RangeError` guard, the `WELCOME10` coupon and the non-member path are never
     executed by a test (`branch-coverage`);
   - the `>= 100` boundary (`100` vs `99.99`) and the `0` clamp are not asserted
     (`corner-cases`).

## B. Look at the trace

PR page → Agent runs → open the run (drawer):
- **Configuration → Skills**: the skills the run used, with versions (`none` for the
  run without skills).
- **Prompt assembly → Skills / rules**: the rendered blocks (`### <name>`, description,
  body), and `N skills · +T tok` — the tokens the skills added to the prompt.
- **Log**: `Skills: 2 attached (branch-coverage v1, corner-cases v1) — +T tokens`, or
  `Skills: none enabled for this agent`.

A skill switched off (on the Skills page or per agent) is absent from all three.
