# client/src/vendor

Vendored packages resolved by path alias (not npm deps).

- `ui/` — `@devdigest/ui` design system. Read `ui/README.md` before adding components:
  layers (primitives · kit · charts · shell), one file per component, barrel export,
  theming via CSS variables in `ui/styles.css`.
- `shared/` — `@devdigest/shared` Zod contracts, a COPY of `server/src/vendor/shared`.

## Rules
- Contract changes start in the server copy, then are mirrored here.
  Check drift: `diff -r ../server/src/vendor/shared src/vendor/shared` (from client/).
- New UI component → its layer folder + export from `ui/index.ts`.
