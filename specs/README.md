# specs/ — feature specifications

What we are building, written BEFORE the code. One feature per file.
Cross-package features live here; single-package ones in `<package>/specs/`.

Naming: `L01-cost-badge.md`, `L02-conventions-extractor.md`, … (lesson id + slug),
or `YYYY-MM-DD-slug.md` for non-course work.

## Template

```markdown
# <Feature>
Status: draft | in-progress | done · Lesson: Lxx · Packages: server, client

## Goal
One paragraph: the user-visible outcome.

## Scope
- In: …
- Out: …

## Design
Contracts (`@devdigest/shared`), routes, tables, UI entry points.

## Acceptance criteria
- [ ] …

## Open questions
```
