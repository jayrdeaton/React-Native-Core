# @rific/core

Required foundation for `@rific/*` packages: a home for cross-cutting utilities every
`@rific`-consuming app can use directly.

**[Live demo](https://rific.jaydeaton.com/demos/core)**

- `createSettingsContext`: a generic Context/Provider/hook factory for a live, patchable settings
  object whose persistence the consuming app owns.
- `createSettingsSlice`: the same idea for Redux: a generic reducer + action-creator factory, with
  zero dependency on `@reduxjs/toolkit` (or any Redux library at all).
- `createModuleConfig`: a generic module-level config singleton, for injecting an optional peer
  module (`react-native-paper`, `expo-camera`, etc.) without a hard dependency on it.
- `safeBack`: a zero-argument expo-router back-navigation guard (falls back to a configured path
  instead of throwing when there's no back-stack to pop), built on `createModuleConfig` so this
  package still doesn't hard-depend on `expo-router`.
- Keep Awake (`KeepAwakeProvider`, `useKeepAwake`, `useKeepAwakeSettings`, `keepAwakeReducer`): an
  opt-in, persisted "keep the screen on" setting plus the hook that honors it, with `expo-keep-awake`
  injected by the app so this package never imports it.

## Why this exists

`feedback-press` (sound + haptics), `scroll-view`, and `auto-paper`'s `ThemeProvider` each hand-roll
the same ~30-line shape independently: a Context holding `{settings, set}`, a Provider taking
`initialValue`/`onChange` so the app decides where (or whether) the setting is persisted, and an
inert no-Provider-mounted default so nothing crashes if it's used without one. Each of those same
three packages *also* independently hand-rolls an equivalent Redux slice - the exact same
`createAction`/`.match()`/if-chain reducer, copy-pasted verbatim across all four files that need it
(`hapticSlice.ts`, `soundSlice.ts`, `scrollViewSlice.ts`, `themeSlice.ts`). And `drawer`, `scanner`,
and `resizable-input` each hand-roll the same module-level `let config` / `configureX` / `getXConfig`
/ `XProvider` singleton for one-time optional-peer injection. `createSettingsContext`,
`createSettingsSlice`, and `createModuleConfig` are each one of those shapes, written once.

## `createSettingsContext` - Context-based settings

```ts
import { createSettingsContext } from '@rific/core'

export type OrientationLockSettings = { locked: boolean }

export const { Provider: OrientationLockProvider, useSettings: useOrientationLockSettings } =
  createSettingsContext<OrientationLockSettings>({ locked: false })
```

```tsx
// App root
<OrientationLockProvider
  initialValue={{ locked: persistedLockOrientation }}
  onChange={(settings) => dispatch(gameActions.setLockOrientation(settings.locked))}
>
  <App />
</OrientationLockProvider>
```

`initialValue` seeds the Provider at mount and stays live afterwards. When a key's value in a new
`initialValue` differs from the previous one, the Provider adopts it, so passing Redux state in and
dispatching a settings action elsewhere (for example from a settings screen) updates every
`useSettings()` consumer. Keys whose value did not change are left alone, so a local `set()` is never
overwritten by an unrelated re-render, `undefined` values are ignored, and a new object with the
same values is a no-op. A value that only echoes what the Provider last reported through `onChange`
is ignored too, so the usual round trip (`onChange` dispatches to Redux, Redux feeds `initialValue`)
cannot loop or undo a newer change. `onChange` fires for adopted changes as well as `set()` calls.

For the common case of a caller that only needs one field of the settings object as a plain
`{value, setValue}` pair (mirrors `useOrientationLock`/`useSoundSettings`/`useHapticSettings`'s own
shape), wrap the generated `useSettings` with `createSettingHook`:

```ts
import { createSettingHook } from '@rific/core'

export const useOrientationLock = createSettingHook(useOrientationLockSettings, 'locked')
// const { value: locked, setValue: setLocked } = useOrientationLock()
```

A settings object with several fields a caller patches together at once (e.g. sound + haptics) is
better served calling the generated `useSettings()` directly and patching as needed, rather than one
`createSettingHook` per field.

## `createSettingsSlice` - Redux-based settings

Same settings shape, for apps that persist through Redux instead of (or alongside) a Context. No
dependency on `@reduxjs/toolkit`: works with RTK stores, vanilla Redux, or any reducer-based state
container.

```ts
import { createSettingsSlice } from '@rific/core'

export type HapticSettings = { vibrate: boolean }

export const { actions: hapticActions, reducer: hapticReducer } = createSettingsSlice('haptic', {
  initialState: { vibrate: true } as HapticSettings
})
// hapticActions.initialize({ vibrate: false }), hapticActions.setVibrate(false)
```

By default every field of `initialState` gets its own `setX` action (`setVibrate`, `setEnabled`,
...) and `initialize` replaces the whole state wholesale - matching the fleet's most common shape.
Three optional knobs cover the rest:

```ts
export const { actions: themeActions, reducer: themeReducer, createReducer: createThemeReducer, selectors } = createSettingsSlice('theme', {
  initialState: { appearance: 'system', blur: true, color: '#6750a4', harmony: 'split-complementary' } as ThemeState,
  initializeMode: 'merge',        // initialize(patch) merges instead of replacing
  selectors: ['appearance', 'color'] // adds selectAppearance(state)/selectColor(state)
})

// createReducer lets a consumer override the default initial state at construction time -
// independent of the runtime `initialize` action:
const reducer = createThemeReducer({ color: DEFAULT_APP_COLOR })
```

To expose zero per-field setters (only `initialize`), pass `fieldSetters: []` - useful for a
settings object an app only ever replaces wholesale, never patches one field at a time.

## `createModuleConfig` - optional peer-module injection

```ts
import { createModuleConfig } from '@rific/core'
import type { OptionalModule } from '@rific/core'

export type MyPackageConfig = {
  paper?: OptionalModule<PaperModuleShape>
}

export const { configure: configureMyPackage, getConfig: getMyPackageConfig, Provider: MyPackageProvider } =
  createModuleConfig<MyPackageConfig>()
```

```tsx
// App root - either call configure directly, or mount the generated Provider:
<MyPackageProvider paper={RNPaper}>
  <App />
</MyPackageProvider>
```

Plain module-level state, not React Context - this is one-time app setup ("does this app have
`react-native-paper`?"), not per-render reactive state, so calling `configure` again after
components have already rendered won't retroactively update them. Fine for startup config, not for
runtime toggling.

## `safeBack` - expo-router back-navigation guard

Same injection pattern as `createModuleConfig` above, applied to one concrete case: guarding
`router.back()` against expo-router's "GO_BACK was not handled by any navigator" error toast when a
screen has no back-stack to pop (a deep link, a refresh, a tab's very first navigation).

```ts
// src/utils/navigation.ts - once, at module load
import { router } from 'expo-router'
import { configureNavigation, safeBack } from '@rific/core'

configureNavigation({ router })

export { safeBack }
```

```tsx
import { safeBack } from '@/utils/navigation'

<Button onPress={safeBack}>Back</Button>
// or call it directly: safeBack()
```

`safeBack()` is zero-argument on purpose, so it keeps working as a bare callback reference
(`onBack={safeBack}`) everywhere it's used. It reads the router back out via `getNavigationConfig()`
instead of taking one as a parameter: no router configured is a no-op; otherwise it calls
`router.back()` when `router.canGoBack()`, else `router.replace(fallbackPath)` (default `'/'`,
overridable via `configureNavigation({ fallbackPath })`). `configureNavigation`/`getNavigationConfig`
are just that one `createModuleConfig<SafeBackConfig>` instance's own `configure`/`getConfig`, so
`expo-router` itself is never imported by this package - `SafeBackRouter` mirrors only the 3 methods
`safeBack` actually calls (`canGoBack`/`back`/`replace`).

## Keep Awake - opt-in "keep the screen on" setting

Stops the screen from dimming and auto-locking on a screen where nobody touches it for a while (a
game steered by tilt, a long think between turns, a map that's recording). Built from the pieces
above: a `createSettingsContext` setting (`{ enabled: boolean }`, default `true`), a
`createSettingsSlice` slice to persist it, and one hook. Nothing happens until the app mounts the
Provider with `expo-keep-awake` passed in, so apps that don't opt in are unaffected.

```tsx
// App root, once. Same bridge shape as feedback-press's sound/haptics.
import { keepAwakeActions, KeepAwakeProvider, type KeepAwakeSettings } from '@rific/core'
import * as ExpoKeepAwake from 'expo-keep-awake'

const KeepAwakeBridge = ({ children }: Props) => {
  const keepAwake = useSelector((state: RootState) => state.keepAwake)
  const dispatch = useDispatch()
  const onChange = useCallback((settings: KeepAwakeSettings) => dispatch(keepAwakeActions.initialize(settings)), [dispatch])
  return (
    <KeepAwakeProvider expoKeepAwake={ExpoKeepAwake} initialValue={keepAwake} onChange={onChange}>
      {children}
    </KeepAwakeProvider>
  )
}
```

```ts
// store.ts: mount the slice under `keepAwake` (its namespace, which its REHYDRATE handling expects)
import { keepAwakeReducer } from '@rific/core'

const rootReducer = combineReducers({ /* ... */ keepAwake: keepAwakeReducer })
```

```tsx
// The screen that needs it (a game's /game), not app-wide:
import { useKeepAwake } from '@rific/core'

useKeepAwake('game')
// Only some of the time? A hook can't be conditional, so pass `active`:
useKeepAwake('map', { active: recording })
```

- `useKeepAwake(tag?, { active? })` keeps the screen awake while the calling component is mounted,
  the setting is on, `active` is true (the default), and a module was injected. `tag` defaults to one
  unique to that hook instance, so two callers never release each other's lock. Failed
  `expo-keep-awake` calls are swallowed: on web, activation is refused where the wake-lock
  Permissions-Policy is missing (a browser iframe), and deactivation rejects when no lock is held.
- `useKeepAwakeSettings()` is the `{ settings, set }` pair for a settings screen's toggle.
- `useExpoKeepAwake()` returns the injected module, or `undefined` when there isn't one. A settings
  screen should hide its toggle in that case, since it would do nothing. `@tastic/hud`'s settings
  dialog does exactly this.
- `keepAwakeActions.initialize(settings)` / `keepAwakeActions.setEnabled(value)` and
  `keepAwakeReducer` are the slice; `defaultKeepAwakeSettings` is `{ enabled: true }`.

Unlike `createModuleConfig`, the module is held in React Context (like `@rific/auto-paper`'s
`expoBlur`), because a settings UI reads it to decide whether to show the toggle at all.

## `OptionalModule<T>`

Names the convention several packages already follow for the `paper`/`camera`/`autoPaper`-style
props above: mirror only the small slice of the injected module's shape you actually use as a local
type (never `typeof import('the-real-package')`, which still forces the type-checker to resolve the
real module), accept it as an explicit prop rather than auto-detecting it (Metro doesn't rewrite a
`require()`-in-`try/catch` call into its module graph inside an ESM build, so auto-detection breaks
silently), and degrade gracefully when it's omitted. `OptionalModule<T>` is just `T | undefined` -
its only value is giving that convention one name to point back to instead of re-deriving the
reasoning fresh in every package's own doc comment.

## Install

```bash
npm install @rific/core
```

## Peer Dependencies

- `react` (>=19.0.0)
- `react-native` (>=0.76.0): not imported by anything in this package yet (every export here is
  plain `react`), but declared up front to match every other `@rific`/`@tastic` foundation package,
  since this is meant to grow into a home for other cross-cutting utilities the same way
  `@tastic/core` did.
- `expo-router` (>=57.0.0): optional (`peerDependenciesMeta.optional`). Only needed if you use
  `safeBack`, and even then this package never imports `expo-router` itself - you inject your own
  `router` via `configureNavigation({ router })`.
- `expo-keep-awake` (>=12.0.0): optional. Only needed for Keep Awake, and only as the module you pass
  to `KeepAwakeProvider`'s `expoKeepAwake` prop; this package never imports it. 12.0.0 is the first
  version with `activateKeepAwakeAsync`.
