# Task 1 Report — Tailwind v4 + shadcn/ui Foundation

Scope: `docs/superpowers/plans/2026-06-23-ui-overhaul-orchestration-view-plan.md`, "Task 1".
Branch: `claude/modest-sammet-5c70c9` (pre-existing worktree, no new branch created).

## Summary

Added Tailwind v4 + shadcn/ui (New York style, slate base, CSS-variable theming) to the
Next.js 15 / React 19 app, with light/dark theming via `next-themes`, a polished shadcn-based
top nav in `app/layout.tsx`, and a `sonner` `<Toaster />`. Legacy bespoke CSS classes used by
not-yet-migrated pages (`/runs/new`, `/runs/[id]`, `/dashboard`, `/datasets*`) are preserved
verbatim in `app/globals.css` below the Tailwind layers, so those pages keep rendering
unchanged until their own migration task.

## Dependency versions added

Runtime (`package.json` `dependencies`):
- `tailwindcss` ^4.3.1
- `@tailwindcss/postcss` ^4.3.1
- `postcss` ^8.5.15
- `tailwind-merge` ^3.6.0
- `clsx` ^2.1.1
- `class-variance-authority` ^0.7.1
- `lucide-react` ^1.21.0
- `next-themes` ^0.4.6
- `gsap` ^3.15.0 (not used in Task 1; reserved for Task 4's OrchestrationCanvas)
- `recharts` ^3.9.0 (not used in Task 1; reserved for Task 7's dashboard charts / chart.tsx wrapper)
- `sonner` ^2.0.7
- Radix UI primitives backing the shadcn components: `@radix-ui/react-slot` ^1.3.0,
  `@radix-ui/react-label` ^2.1.10, `@radix-ui/react-select` ^2.3.1, `@radix-ui/react-tabs`
  ^1.1.15, `@radix-ui/react-separator` ^1.1.10, `@radix-ui/react-tooltip` ^1.2.10,
  `@radix-ui/react-progress` ^1.1.10, `@radix-ui/react-scroll-area` ^1.2.12

Installed in two `npm install` batches (per OneDrive-worktree risk note) — both completed well
under the 600s timeout (30s and 6s respectively). `package-lock.json` updated both times.

## shadcn CLI vs manual decision

Tried `npx --yes shadcn@latest init` first. The currently-resolved `shadcn@latest` is a newer
major version whose `init` command dropped `--base-color`/`--style` in favor of `--preset`
(`base-nova` default) and a `--base <radix|base>` component-library flag — it does not support
specifying "New York + slate" the way the task spec requires, and the project's plan/spec
explicitly call for New York style + slate base. Rather than fight the new preset system or
land on a different default style, I followed the documented fallback: hand-wrote
`components.json`, `lib/utils.ts`, and all 16 `components/ui/*.tsx` files directly, matching the
standard shadcn New York templates (Radix primitives + `cva` + `cn`). This gives exact control
over style/theme and avoids CLI version drift risk for future tasks.

## Files created

- `postcss.config.mjs` — `@tailwindcss/postcss` plugin only (Tailwind v4 style, no
  `tailwind.config.js` content array).
- `components.json` — `style: new-york`, `baseColor: slate`, `cssVariables: true`,
  `rsc: true`, standard `@/components`, `@/lib/utils`, `@/components/ui` aliases.
- `lib/utils.ts` — `cn()` helper (`clsx` + `tailwind-merge`).
- `components/ui/button.tsx`, `card.tsx`, `input.tsx`, `textarea.tsx`, `label.tsx`,
  `select.tsx`, `table.tsx`, `badge.tsx`, `tabs.tsx`, `separator.tsx`, `skeleton.tsx`,
  `tooltip.tsx`, `progress.tsx`, `sonner.tsx`, `scroll-area.tsx`, `chart.tsx` — all 16
  requested components.
- `components/theme-provider.tsx` — thin wrapper around `next-themes`' `ThemeProvider`.
- `components/theme-toggle.tsx` — icon button toggling light/dark via `useTheme()`.

## Files modified

- `app/globals.css` — rebuilt as: `@import "tailwindcss";` → `@custom-variant dark` →
  `:root`/`.dark` oklch token blocks (background/foreground/card/popover/primary/secondary/
  muted/accent/destructive/border/input/ring/chart-1..5/sidebar-*) → `@theme inline` mapping
  those vars into Tailwind's color/radius scale → `@layer base` (border/outline defaults,
  `body` bg/fg) → **all pre-existing legacy classes appended unchanged** (`.shell`, `.topbar`,
  `.brand`, `.nav`, `.button`(+`.primary`/`.danger`), `.container`, `.page-title`, `.grid`
  (+`.two`/`.three`), `.panel`/`.card`, `.stack`, `.form-grid`, `.field`, `.code`,
  `.metric-row`/`.trace-row`, `.metric`, `.muted`, `.badge`(+`.warning`), `.table`,
  `.checkbox-grid`/`.checkbox`, `.label`, and the `@media (max-width: 820px)` block). One
  rename inside the legacy section: the old generic `--muted`/`--accent` CSS variable names
  collided with the new shadcn token names, so the legacy block's own copies were renamed to
  `--muted-legacy` / `--accent-legacy` (used only by the legacy classes) to avoid the shadcn
  tokens being silently overridden by `:root` declaration order. No selectors, layout, or
  values for the legacy classes changed otherwise — pages using them are visually unaffected.
- `app/layout.tsx` — wraps `{children}` in `ThemeProvider` (`attribute="class"`,
  `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`); `<html>` gets
  `suppressHydrationWarning` (required by `next-themes` to avoid hydration mismatch warnings).
  Nav is still a real `<header>` containing the brand link and a `<nav>` with the same four
  links (New Run, Dashboard, Datasets, Export JSON) now styled with Tailwind utility classes
  plus a `<ThemeToggle />`. `<Toaster />` mounted once at the root, outside `.shell` but inside
  `ThemeProvider` (so it can read the theme via `useTheme()`).
- `package.json` / `package-lock.json` — new deps as listed above.

## Leftover legacy classes (intentional, for later tasks)

Per the plan's Task 1 decision ("migrate `layout.tsx` now... keep the legacy utility classes...
later tasks remove their legacy usage"), the following remain in `globals.css` and are still
used by page-level markup, to be migrated in later tasks (7, primarily, and 5/6 partially):
`.container`, `.page-title`, `.grid`/`.two`/`.three`, `.panel`, `.card`, `.stack`, `.form-grid`,
`.field`, `.code`, `.metric-row`/`.trace-row`, `.metric`, `.muted`, `.badge`/`.warning`,
`.table`, `.checkbox-grid`/`.checkbox`, `.button`/`.primary`/`.danger`. `.shell`/`.topbar`/
`.brand`/`.nav` are no longer referenced by `layout.tsx` (nav migrated to Tailwind/shadcn) but
`.shell` is still used as the outer wrapper div in `layout.tsx`, so it stays. `.topbar`/`.brand`/
`.nav` are now dead CSS (no longer referenced anywhere) — left in place rather than deleted, since
removing "unused" legacy CSS was not in scope and a future page migration task may still want the
exact same visual reference.

## Verification

- `npm run typecheck` — **passes**, no output beyond the script header (clean `tsc --noEmit`).
- `npm test` (vitest) — **16/16 tests pass** across 3 files (`tests/metrics.test.ts` 2,
  `tests/workflows.test.ts` 9, `tests/api-contracts.test.ts` 5). ~11.6s wall time.
- `npm run build` — **succeeds**. `next build` compiled in 9.9s, generated all 10 routes
  (5 static, ƒ for the dynamic API/`[id]` routes), and emitted a single CSS bundle
  (`.next/static/css/*.css`, ~38KB) verified to contain both the new oklch shadcn tokens and
  the untouched legacy `.shell{min-height:100vh}` rule — i.e. Tailwind v4 and the legacy
  stylesheet coexist correctly in the production build.
- `npm run lint` (`next lint`) — **fails**, but this is pre-existing and unrelated to this
  task's changes: `Failed to load config "next/core-web-vitals" to extend from. Referenced
  from: C:\...\OrchestraBench\.eslintrc.json`. Root cause: Next.js detects two lockfiles
  (the OrchestraBench repo root's `package-lock.json` and this worktree's own
  `package-lock.json`), infers the **repo root** (one level above the worktree) as the
  workspace root, and then tries to resolve `eslint-config-next` relative to a `.eslintrc.json`
  path that doesn't have that package available in the right place — under ESLint 9 with the
  legacy `.eslintrc.json` format. Confirmed via `git stash` that this failure reproduces
  identically on the **unmodified baseline** (before any Task 1 changes), so it is an
  environment/worktree-layout issue, not something introduced here. `npm run build`'s internal
  lint step hits the same error but does not fail the build (Next.js treats it as a warning
  during `next build`'s "Linting and checking validity of types" phase — the build still
  completed and emitted all pages).

## Concerns / notes for later tasks

1. **Lint is currently non-functional** in this worktree layout for an unrelated, pre-existing
   reason (see above). Task 1's acceptance criterion was "lint + typecheck pass"; typecheck
   passes cleanly, lint cannot run at all (CLI mechanically fails identically with and without
   this change). Recommend a separate, scoped fix (e.g. `outputFileTracingRoot` in
   `next.config.ts`, or migrating off `.eslintrc.json` to flat config as `docs/insights.md`
   already flags) rather than bundling an unrelated infra fix into this task.
2. `recharts` v3 changed several `Tooltip`/`Legend` prop type shapes vs. the recharts v2 API the
   canonical shadcn `chart.tsx` template assumes (`ValueType`/`NameType` are no longer exported
   from the package root; `active`/`payload`/`label` are excluded from `TooltipProps` and only
   available via `TooltipContentProps`). Adjusted `components/ui/chart.tsx` accordingly (local
   `ChartValueType`/`ChartNameType` aliases, `RechartsPrimitive.TooltipContentProps`,
   `RechartsPrimitive.LegendPayload[]` for the legend). Not exercised yet (no chart usage until
   Task 7) — flagging so Task 7's implementer doesn't need to re-derive this.
3. `lucide-react` resolved to `^1.21.0`, a notably different major line than the `^0.4xx` series
   commonly paired with shadcn templates online; the icon API used here (`SunIcon`, `MoonIcon`,
   `ChevronDownIcon`, etc., named exports) is unchanged and compiled/built fine.
4. `.topbar`/`.brand`/`.nav` legacy classes are now unused dead CSS (nav migrated). Left in place
   intentionally — out of scope to prune in this task.
5. No `tailwind.config.ts` was added; Tailwind v4 is config-light by design and none of the
   theme customization needed a config file (the `@theme inline` block in `globals.css` covers
   it). Can be added later if a JS-side config becomes necessary.
