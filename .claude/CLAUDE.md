# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

# @rific/core

Required foundation for `@rific/*` packages — a home for cross-cutting utilities every `@rific`-consuming
app can use directly, the same dual role `@tastic/core` plays for `@tastic/*` game packages: other
`@rific` packages can build on it internally, and apps import from it directly too.

Four exports, each extracting one shape duplicated across the fleet:

- `createSettingsContext` — `feedback-press` (sound + haptics), `scroll-view`, and `auto-paper`'s
  `ThemeProvider` each independently hand-roll the same `{settings, set}` Context + `initialValue`/
  `onChange` Provider shape — the app owns persistence, the package just holds live state.
  `@tastic/core`'s own orientation-lock context is the same shape again, one scope over.
- `createSettingsSlice` — the same three packages *also* each hand-roll an equivalent Redux slice
  (`hapticSlice.ts`/`soundSlice.ts`, `scrollViewSlice.ts`, `themeSlice.ts`) with an identical
  `createAction`/`.match()`/if-chain reducer, copy-pasted verbatim across all four files. No
  dependency on `@reduxjs/toolkit` — works with RTK stores, vanilla Redux, or no Redux at all.
- `createModuleConfig` — `drawer`, `scanner`, and `resizable-input` each hand-roll the same
  module-level `let config` / `configureX` / `getXConfig` / `XProvider` singleton for one-time
  optional-peer-module injection (paper, camera, etc.), explicitly self-documented in each package's
  own source as "every @rific package wires up the same way this way."
- `safeBack` (with `configureNavigation`/`getNavigationConfig`) — `game.tsx`, `loadout.tsx`/
  `lobby.tsx`, `achievements.tsx`, and `profiles.tsx` in all 5 `@tastic`-fleet apps (Snake, AirHockey,
  BoxHockey, Pong, LightCycles) each imported an identical `router.canGoBack() ? router.back() :
  router.replace('/')` guard from their own `src/utils/navigation.ts`, dodging expo-router's
  "GO_BACK was not handled by any navigator" toast on a screen reached with no back-stack to pop.
  Built on `createModuleConfig`, same as the three packages above, since a hard
  `import { router } from 'expo-router'` in this package would be its first real dependency beyond
  react/react-native peers — see "New export: safeBack" below for the full design and one deliberate
  deviation from how it was originally proposed.

Plus `OptionalModule<T>` (`= T | undefined`), naming (not implementing anything new for) the
optional-peer-injection convention several packages already follow independently — a shared type to
point a doc comment at instead of re-deriving the Metro/ESM auto-detection reasoning fresh each time.

Part of the `@rific` package ecosystem. Not yet published — see Release below.

## Commands

```bash
npm run lint        # ESLint check
npm run fix         # ESLint --fix
npm run build       # tsup, outputs CJS + ESM + types to dist/
npm run build:watch # tsup --watch
npm test            # Jest
npm run test:watch  # Jest in watch mode
npm run typecheck   # tsc --noEmit
npm run verify      # lint + test + typecheck + build, in that order
```

Always run `npm run lint` before finishing any task.

## Local development (yalc)

Not yet published to the registry — every consumer below is linked via yalc during this pre-release
phase:

```bash
npm run build && yalc publish   # from this package
cd ../react-native-feedback-press && yalc add @rific/core && npm install
```

Re-run `npm run build && yalc push` after any change to propagate it to every linked consumer.

**Current yalc consumers** (all migrated and verified — typecheck/test/lint/build green, public API
unchanged), by which factory they use:

- `createSettingsContext` + `createSettingsSlice`: `@rific/feedback-press`, `@rific/auto-paper`,
  `@rific/scroll-view`
- `createModuleConfig`: `@rific/drawer`, `@rific/scanner`, `@rific/resizable-input`

Once this package has a real npm release, each of those six gets `yalc remove @rific/core`, its
`package.json` peer/dev entry pinned to a real published semver range, and `npm install` — no source
changes needed at that point, only the dependency resolution switches from the local yalc link to
the registry.

## Release

Tag-based, using npm trusted publishing (OIDC, no token required) — same as every other `@rific`/`@tastic`
package:

```bash
npm run release:patch   # npm version patch && git push --follow-tags (or release:minor / release:major)
```

`preversion` runs `npm run verify` first. `publish.yml` fires on `v*` tags and delegates to the shared
reusable workflow (`infinitetoken/Workflows/.github/workflows/npm-publish.yml@v1`) with `id-token: write`
permission for OIDC trusted publishing. Nothing has been tagged or published yet — this repo exists
locally only, no `v0.1.0` tag pushed.

## Architecture

```
src/
  index.ts                    - all public exports
  createSettingsContext.tsx   - createSettingsContext (Context+Provider+useSettings triple) and
                                 createSettingHook (the {value, setValue} single-field convenience)
  createSettingsSlice.ts      - createSettingsSlice (Redux reducer+action-creator factory)
  createModuleConfig.tsx      - createModuleConfig (module-level config singleton + Provider)
  OptionalModule.ts           - OptionalModule<T> type + the shared injection-convention doc comment
  safeBack.ts                 - safeBack/configureNavigation/getNavigationConfig (expo-router
                                 back-navigation guard, built on createModuleConfig)
  __tests__/
    createSettingsContext.test.tsx
    createSettingsSlice.test.ts
    createModuleConfig.test.tsx
    safeBack.test.ts
```

### `createSettingsContext<T>(defaults)`

Returns `{Context, Provider, useSettings}`:
- The returned `Context`'s own default value (no Provider mounted) is `{settings: defaults, set: noop}`
  — the same "nothing crashes, it just never resolves" degradation every hand-rolled version of this
  shape already documents for a missing Provider.
- `Provider` takes `initialValue?: Partial<T>` (seeds state, merged over `defaults`) and
  `onChange?: (settings: T) => void` (fires with the full next object on every `set` call) — persistence
  is entirely the consuming app's job via these two props, never this package's.
- `set`'s identity is stable across re-renders regardless of whether `onChange` itself is a fresh closure
  each time (read via a ref, not closed over directly).

`createSettingHook(useSettings, key)` wraps a generated `useSettings` to expose one field as
`{value, setValue}` — for a caller that only cares about a single field rather than the whole
patch-based contract.

### `createSettingsSlice<T>(namespace, options)`

Returns `{actions, reducer, createReducer, selectors}`. `options.initialState` is required; every
other option is optional and defaults to the fleet's most common shape:

- `initializeMode`: `'replace'` (default — `initialize`'s payload becomes the entire next state,
  matching haptic/sound/scrollView) or `'merge'` (spreads the payload over existing state, matching
  auto-paper's theme — `initialize` there is typed `Partial<T>` rather than `T`, conditionally, based
  on this option).
- `fieldSetters`: which fields get a generated `setX` action (`vibrate` -> `setVibrate`). Defaults to
  every key of `initialState`. Pass `[]` for a slice with no per-field setters at all (scrollView's
  shape — several fields, `initialize` only).
- `selectors`: which fields get a generated `selectX(state) => state[field]`. Defaults to none (only
  auto-paper's theme slice has these today).
- `reducer` is just `createReducer()` with no override; `createReducer(overrideInitialState?)` lets a
  consumer seed a different default at construction time (auto-paper's `createThemeReducer` wrinkle),
  independent of the runtime `initialize` action.

Action types are namespaced (`${namespace}/initialize`, `${namespace}/setVibrate`, ...) so multiple
slices combined in one store never collide — matches every real consumer's existing action-type
strings exactly, so migrating a package onto this factory doesn't change its action type strings
(anything already dispatching a raw `{type: 'haptic/setVibrate', payload}` action keeps working).

### `createModuleConfig<T>(defaults?)`

Returns `{configure, getConfig, Provider}`. Plain module-level state (a closured `let config`), not
React Context — this is one-time app setup, not per-render reactive state. `Provider` calls
`configure` synchronously during render (not in an effect), so the config is already set by the time
any descendant component renders on the same pass. Two independent `createModuleConfig()` calls never
share state (each closure owns its own `config` variable).

### `safeBack()` / `configureNavigation()` / `getNavigationConfig()`

`configureNavigation`/`getNavigationConfig` are one `createModuleConfig<SafeBackConfig>({ fallbackPath:
'/' })` instance's own `configure`/`getConfig`, renamed at the export boundary for readability.
`SafeBackConfig` is `{ router?: OptionalModule<SafeBackRouter>; fallbackPath: string }` — `router` is
an *optional key*, not just an `OptionalModule`-typed (`T | undefined`) value; see "New export:
safeBack" below for why that's a deliberate correction, not what was originally proposed.
`SafeBackRouter` hand-mirrors only the 3 expo-router `router` methods actually used (`canGoBack`,
`back`, `replace`) as a local type — this file never imports `expo-router` for real.

`safeBack()` itself is zero-argument and reads the injected config back out via `getConfig()`: no
`router` configured → no-op; `router.canGoBack()` → `router.back()`; otherwise →
`router.replace(fallbackPath)`. No `Provider` — see "New export: safeBack" for why this one doesn't
need the ordering guarantee a `Provider` exists to give.

## Public API

From `src/index.ts`:

- `createSettingsContext` — the Context factory; `SettingsContextValue`/`SettingsProviderProps`/
  `SettingsContextResult` (types)
- `createSettingHook` — single-field `{value, setValue}` convenience over a generated `useSettings`
- `createSettingsSlice` — the Redux factory; `CreateSettingsSliceOptions`/`SettingsAction`/
  `SettingsReducer`/`SettingsSliceResult`/`InitializeMode` (types)
- `createModuleConfig` — the module-config-singleton factory; `ModuleConfigProviderProps`/
  `ModuleConfigResult` (types)
- `OptionalModule` (type only)
- `safeBack` — the back-navigation guard; `configureNavigation`/`getNavigationConfig` (the injection
  setter/getter it's built on); `SafeBackRouter`/`SafeBackConfig` (types)

## Peer Dependencies

- `react` >=19.0.0
- `react-native` >=0.76.0 — not actually imported by anything here yet (every export is plain
  `react`). Declared anyway, matching `@tastic/core`'s own peers, since this package is meant to grow
  the same way that one did — adding the peer now avoids a breaking peerDependencies bump the day a
  future export actually needs it.
- `expo-router` >=57.0.0 — declared `optional: true` in `peerDependenciesMeta`. `safeBack.ts` never
  actually imports it (only hand-mirrors 3 of its `router` methods as a local `SafeBackRouter` type),
  so this adds no real install requirement; it's here purely so a consumer's own tooling can see the
  relationship. Follows `@rific/scanner`'s fuller precedent (its 3 injected/mirrored peers —
  `expo-camera`, `react-native-paper`, `react-native-safe-area-context` — are all declared this way)
  rather than `@rific/resizable-input`'s gap (its own `react-native-paper` injection, the identical
  pattern, isn't declared as a peer anywhere) — the fleet hasn't enforced this with 100% consistency,
  so don't read `resizable-input`'s omission as the "real" convention.

## Testing

- Framework: Jest (`@infinitetoken/jest-config/react-native`), jsdom environment, `@testing-library/react`
- `createSettingsContext.test.tsx` covers: the inert no-Provider default, `initialValue` merging,
  `onChange` firing with the full next object, `set`'s identity staying stable across a changing
  `onChange` prop while still calling the latest one, and `createSettingHook`'s read/write pair.
- `createSettingsSlice.test.ts` covers all three real shapes directly: single-field replace mode
  (haptic/sound), multi-field zero-setter replace mode (scrollView), and merge mode + overridable
  `createReducer` + selectors (theme) — including that action types are correctly namespaced and that
  actions from a different namespace are ignored.
- `createModuleConfig.test.tsx` covers: empty/seeded defaults, `configure` merging rather than
  replacing, `Provider` calling `configure` synchronously during render with its own props (minus
  `children`), `Provider` still rendering its children, and that two independent
  `createModuleConfig()` calls don't share state.
- `safeBack.test.ts` covers all 4 real branches against a hand-built mock `SafeBackRouter`:
  `canGoBack() → true` calls `back()`; `→ false` calls `replace(fallbackPath)`; a custom
  `fallbackPath` override; and the no-router-configured no-op. Resets `configureNavigation({ router:
  undefined, fallbackPath: '/' })` in a `beforeEach` since `configure` merges rather than replaces, so
  a router configured by one test would otherwise leak into the next. This closes what was previously
  a zero-coverage gap fleet-wide — no test in any of the 5 apps this was extracted from ever exercised
  the fallback branch (a grep for `canGoBack` in any app's `src/` hit only its own `navigation.ts`,
  never a test), and 3 of those 5 apps' global `__mocks__/expo-router.ts` (AirHockey, BoxHockey,
  LightCycles) don't even define a `canGoBack` field — a pre-existing per-app gap this extraction
  doesn't fix, since it's this package's own mock, not theirs, that the new test exercises.
- 100% statement/branch/function/line coverage across all four source files.

## Bug fixes (2026-09-17)

**`createSettingsContext`'s `set()` called the consumer's `onChange` *inside* the `useState` updater passed to `setSettings` — a genuine "Cannot update a component while rendering a different component" React bug, found live in AirHockey's `/loadout` screen.** A `useState` updater function must be pure: React can invoke it outside the originating `set()` call's own event/effect (e.g. replaying a queued update while resolving a later render of the very same Provider), and when that happened here, `onChange` (which a consumer like `@rific/auto-paper`'s `Theme.tsx` wires straight to `dispatch(themeActions.initialize(...))`) fired synchronously mid-render of an unrelated component. Fixed by moving the `onChange` call out of the updater and into a `useEffect` keyed on the settled `settings` value, guarded by an `isFirstRender` ref so the mount-time run is skipped — `onChange` still only fires for a real `set()` call, never for `initialValue`/`defaults` seeding, matching the original contract. This factory backs `@rific/auto-paper`'s `Theme`, `@rific/feedback-press`'s haptic/sound settings, and `@rific/scroll-view`'s settings context alike, so every consumer gets the fix for free. `@tastic/core` had the identical shape independently duplicated (not through this factory) in `createGameSettingsProvider` and the old hand-rolled `OrientationProvider` — see that package's own CLAUDE.md. Now `0.1.2` (patch, no API change).

**`onChangeRef`'s own mirroring was a bare `onChangeRef.current = onChange` assignment during render, not effect-based — the one holdout in a fleet-wide "ref-mirroring idiom" audit.** Every other ref-mirror in the fleet (including `@tastic/core`'s `OrientationProvider`, this factory's own motivating duplicate) does `useEffect(() => { ref.current = value })` with no dependency array, not a bare render-time assignment — flagged by ESLint's `react-hooks/refs` rule (part of the React-Compiler-derived ruleset in `eslint-plugin-react-hooks@7.1.1`) as a real, if here low-risk, pattern to avoid: a bare render-time write happens during *every* render pass including ones React may throw away, whereas an effect only commits once the render is actually kept. Fixed to match — `onChangeRef.current = onChange` now runs inside a no-deps `useEffect` instead. Safe by the same reasoning as every other instance: `onChangeRef` is only ever read from inside `set`'s callback, never during another component's render.

## Bug fixes (2026-09-18)

**`createSettingsSlice`'s `createReducer` had no `REHYDRATE` handling — the same redux-persist hard-replace-on-rehydrate exposure already found and fixed once for `@tastic/profile`'s `createSeatColorsSlice`, just not yet triggered because none of this factory's real consumers (`theme`, `haptic`, `sound`, `scrollView`) had grown a field since they first shipped.** `redux-persist`'s default `autoMergeLevel1` stateReconciler hard-replaces a slice's entire persisted sub-state on rehydration unless the slice's own reducer handles `REHYDRATE` to backfill. Fixed by adding a `REHYDRATE = 'persist/REHYDRATE'` case (inlined as a literal, same reasoning as `createSeatColorsSlice`'s own comment) to the returned reducer, backfilling `{ ...initial, ...state, ...persisted }` — `initial` being this reducer instance's own resolved default (honoring `overrideInitialState`), not the raw `initialState` parameter. Confirmed via reading all 4 real consumers (`@rific/auto-paper`'s `themeSlice.ts`, `@rific/feedback-press`'s `hapticSlice.ts`/`soundSlice.ts`, `@rific/scroll-view`'s `scrollViewSlice.ts`) and all 5 apps' `store.ts` files that `namespace` (the factory's own first argument, e.g. `'theme'`) is always identical to the mount key each app uses in its `combineReducers` call — so no new parameter was needed here, unlike `createSeatColorsSlice`'s separate `mountKey` (there, `namespace` is the app name, a different string entirely). 3 new tests added to `src/__tests__/createSettingsSlice.test.ts`. Now `0.1.3` (patch, no API change).

## New export: safeBack (2026-09-18)

**Fourth `createModuleConfig` consumer, and the first one that isn't a UI component.**
`src/utils/navigation.ts` was byte-for-byte identical across all 5 `@tastic`-fleet apps (Snake,
AirHockey, BoxHockey, Pong, LightCycles): `router.canGoBack() ? router.back() :
router.replace('/')`, guarding against expo-router's "GO_BACK was not handled by any navigator" error
toast on a screen reached with no back-stack to pop (a deep link, a refresh, a tab's very first
navigation). Every call site across `game.tsx`, `loadout.tsx`/`lobby.tsx`, `achievements.tsx`, and
`profiles.tsx` in every app uses `safeBack` both invoked directly (`safeBack()`) **and** passed as a
bare callback reference (`onBack={safeBack}`, `onHome={safeBack}`, `onConfirm={safeBack}`) — that
second usage is why the extracted function had to stay strictly zero-argument: any parameterized
signature (e.g. `safeBack(router)`) would force roughly 20 call sites fleet-wide into wrapped arrow
functions.

Zero-argument, plus this package's zero-hard-dependency posture (see the top of this file), creates a
real tension: a plain `import { router } from 'expo-router'` inside `safeBack.ts` would be this
package's first-ever hard dependency. Resolved the same way `drawer`/`scanner`/`resizable-input`
resolve their own optional-peer injections: each app's own (now ~5-line) `src/utils/navigation.ts`
calls `configureNavigation({ router })` once at module load, passing in its own real
`import { router } from 'expo-router'`; `safeBack()` reads that injected router back out of
`createModuleConfig`'s module-level singleton instead of taking it as a parameter; and
`SafeBackRouter` mirrors only the 3 methods actually used (`canGoBack`/`back`/`replace`) as a
hand-written local type — never `typeof import('expo-router')`, which would still force the
type-checker to resolve the real package and defeat the point. See Peer Dependencies above for the
`expo-router` `peerDependenciesMeta` entry this added, and why it follows `scanner`'s precedent rather
than `resizable-input`'s gap.

**One deliberate deviation from how this was originally proposed:** `SafeBackConfig.router` is
`router?: OptionalModule<SafeBackRouter>` — an optional *key* — not the originally-proposed
`router: OptionalModule<SafeBackRouter>` (a required key, only the *value* nullable via
`OptionalModule<T> = T | undefined`). The difference matters at the one call site that builds a
default: `createModuleConfig<SafeBackConfig>({ fallbackPath: '/' })`. With `router` required,
TypeScript needs that object literal to include it — `{ fallbackPath: '/' }` alone is missing a
required property, so it would have to be spelled out as `{ router: undefined, fallbackPath: '/' }`
just to type-check. Making the key itself optional avoids that, and it isn't a one-off improvisation:
it's the same `field?: T` shape `@rific/scanner`'s `ScannerConfig` (`camera?`/`paper?`) and
`@rific/resizable-input`'s `ResizableInputConfig` (`TextInputComponent?`) already use for their own
injected peers — confirmed by reading both files directly. So this is a correction that brings
`safeBack.ts` in line with the fleet's real convention, not a drift away from it; if a future
`createModuleConfig` consumer's config type has an injected-peer field, give it an optional key from
the start rather than copying the literal shape this package's own doc comment originally proposed.

**No `NavigationProvider` component**, unlike `ScannerProvider`/`ResizableInputProvider`. Those wrap a
component that reads its injected config synchronously during *its own* render, which is why
`createModuleConfig`'s `Provider` calls `configure()` during render rather than in an effect — solving
a real first-render ordering hazard. `safeBack` is a plain function called later from event handlers,
well after the module graph — including each app's one `configureNavigation({ router })` call — has
already finished evaluating. There's no ordering hazard to solve here, so a `Provider` would be pure
ceremony.

Test coverage and the pre-existing per-app `canGoBack` mock gap this extraction surfaced (but doesn't
itself fix) are covered under Testing above. Now `0.1.4`.

## Code Style

Enforced by ESLint + Prettier — run `npm run lint` before finishing any task. `eslint.config.cjs` is a
bare `module.exports = require('@infinitetoken/eslint-config/react-native')`, no local overrides. Same
Prettier config as every other `@rific`/`@tastic` package (single quotes, no semicolons, no trailing
commas, print width 1000).
