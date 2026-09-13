# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

# @rific/core

Required foundation for `@rific/*` packages — a home for cross-cutting utilities every `@rific`-consuming
app can use directly, the same dual role `@tastic/core` plays for `@tastic/*` game packages: other
`@rific` packages can build on it internally, and apps import from it directly too.

Three exports, each extracting one shape duplicated across the fleet:

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
  __tests__/
    createSettingsContext.test.tsx
    createSettingsSlice.test.ts
    createModuleConfig.test.tsx
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

## Peer Dependencies

- `react` >=19.0.0
- `react-native` >=0.76.0 — not actually imported by anything here yet (every export is plain
  `react`). Declared anyway, matching `@tastic/core`'s own peers, since this package is meant to grow
  the same way that one did — adding the peer now avoids a breaking peerDependencies bump the day a
  future export actually needs it.

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
- 100% statement/branch/function/line coverage across all three source files.

## Code Style

Enforced by ESLint + Prettier — run `npm run lint` before finishing any task. `eslint.config.cjs` is a
bare `module.exports = require('@infinitetoken/eslint-config/react-native')`, no local overrides. Same
Prettier config as every other `@rific`/`@tastic` package (single quotes, no semicolons, no trailing
commas, print width 1000).
