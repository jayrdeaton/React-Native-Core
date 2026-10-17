import { createContext, type ReactNode, useContext, useEffect, useId, useRef } from 'react'

import { canKeepAwake } from './canKeepAwake'
import { createSettingsContext, type SettingsContextValue, type SettingsProviderProps } from './createSettingsContext'
import { createSettingsSlice } from './createSettingsSlice'
import type { OptionalModule } from './OptionalModule'

// Keeps the screen from dimming and auto-locking while a screen that needs it is up (a game's match
// screen, a scanner, a map that's recording), plus the persisted on/off setting behind it. Lives
// here rather than in its own package because it's only a settings context, a slice, and one hook:
// every game had been copying a `keepAwake` settings field, a pair of dialog props, and an identical
// expo-keep-awake effect into its own files, and Utility and Crumby each had their own KeepAwake
// component, already drifted apart (only one survived web's wake-lock rejections).

export type KeepAwakeSettings = {
  enabled: boolean
}

// On by default: the whole point is that a player isn't touching the screen (tilt steering, a long
// think in a turn, watching a map) and the device locks anyway.
export const defaultKeepAwakeSettings: KeepAwakeSettings = {
  enabled: true
}

// Local mirror of the two expo-keep-awake functions this file calls, never
// `typeof import('expo-keep-awake')` (see OptionalModule.ts). Both have returned promises since
// expo-keep-awake 12.0.0, which added activateKeepAwakeAsync.
export type ExpoKeepAwakeModule = {
  activateKeepAwakeAsync: (tag?: string) => Promise<void>
  deactivateKeepAwake: (tag?: string) => Promise<void>
}

const keepAwakeSettingsContext = createSettingsContext<KeepAwakeSettings>(defaultKeepAwakeSettings)

export const KeepAwakeSettingsContext = keepAwakeSettingsContext.Context
export const useKeepAwakeSettings: () => SettingsContextValue<KeepAwakeSettings> = keepAwakeSettingsContext.useSettings

const keepAwakeSlice = createSettingsSlice<KeepAwakeSettings>('keepAwake', { initialState: defaultKeepAwakeSettings })

export const keepAwakeActions = keepAwakeSlice.actions
export const keepAwakeReducer = keepAwakeSlice.reducer

// React context rather than createModuleConfig, matching auto-paper's `expoBlur`: a settings UI
// (@tastic/hud's settings dialog) reads this to decide whether to show the Keep Awake row at all, so
// it has to reflect whether this tree actually has the module, not whatever a module-level
// singleton last saw.
const ExpoKeepAwakeContext = createContext<OptionalModule<ExpoKeepAwakeModule>>(undefined)

// The injected module, or undefined when no KeepAwakeProvider was given one or this platform can't
// keep the screen awake (a browser without the Screen Wake Lock API, see canKeepAwake). A settings
// screen should hide its Keep Awake toggle when this is undefined: the setting would do nothing.
export const useExpoKeepAwake = (): OptionalModule<ExpoKeepAwakeModule> => useContext(ExpoKeepAwakeContext)

export type KeepAwakeProviderProps = SettingsProviderProps<KeepAwakeSettings> & {
  // `import * as ExpoKeepAwake from 'expo-keep-awake'`. Omit it and useKeepAwake does nothing.
  expoKeepAwake?: OptionalModule<ExpoKeepAwakeModule>
  children: ReactNode
}

// The app's one opt-in point, mounted once near the root: `expoKeepAwake` is the injected module,
// and `initialValue`/`onChange` are the usual createSettingsContext pair, so the app decides where
// (or whether) the setting is persisted, e.g. `keepAwakeReducer` in its Redux store. Where the
// platform can't keep the screen awake the module is withheld, so useKeepAwake does nothing and the
// settings toggle hides, exactly as if the app had never passed one.
export function KeepAwakeProvider({ expoKeepAwake, initialValue, onChange, children }: KeepAwakeProviderProps) {
  return (
    <ExpoKeepAwakeContext.Provider value={canKeepAwake() ? expoKeepAwake : undefined}>
      <keepAwakeSettingsContext.Provider initialValue={initialValue} onChange={onChange}>
        {children}
      </keepAwakeSettingsContext.Provider>
    </ExpoKeepAwakeContext.Provider>
  )
}

export type UseKeepAwakeOptions = {
  // Defaults to true. For a screen that only needs it some of the time (e.g. while a map is
  // recording), since a hook can't be called conditionally.
  active?: boolean
}

// Keeps the screen awake while the calling component is mounted, as long as the setting is on and
// a module was injected. Call it from the screen that needs it (a game's /game), not app-wide.
//
// `tag` defaults to one unique to this hook instance, so two callers never release each other's
// lock. Both expo-keep-awake calls are allowed to fail silently: on web, activation is refused
// outright where the wake-lock Permissions-Policy is missing (a browser iframe), and deactivation
// rejects whenever no lock is held. Keeping the screen on is a nice-to-have; neither case should
// surface as an unhandled rejection.
//
// On web, a browser releases the wake lock whenever the page is hidden (another tab, another app,
// the screen turned off) and never takes it back, so the lock is requested again each time the page
// is visible again. Native keeps its lock across backgrounding and has no `document` to listen on.
export function useKeepAwake(tag?: string, { active = true }: UseKeepAwakeOptions = {}): void {
  const expoKeepAwake = useExpoKeepAwake()
  const { settings } = useKeepAwakeSettings()
  const instanceTag = useId()
  const resolvedTag = tag ?? instanceTag
  const on = active && settings.enabled
  // Every call this hook makes waits for the one before it, across effect runs too. Web's wake-lock
  // request is async, so without this a quick unmount deactivated before the lock arrived (rejected,
  // leaving the late lock held after the screen was gone), and a quick off-then-on could have the
  // old run's deactivate release the new run's lock, since both share the tag.
  const queue = useRef<Promise<void>>(Promise.resolve())
  useEffect(() => {
    if (!on || !expoKeepAwake) return undefined
    const enqueue = (call: () => Promise<void>) => {
      queue.current = queue.current.then(call).catch(() => undefined)
    }
    const activate = () => enqueue(() => expoKeepAwake.activateKeepAwakeAsync(resolvedTag))
    activate()
    const hasDocument = typeof document !== 'undefined'
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') activate()
    }
    if (hasDocument) document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      if (hasDocument) document.removeEventListener('visibilitychange', onVisibilityChange)
      enqueue(() => expoKeepAwake.deactivateKeepAwake(resolvedTag))
    }
  }, [on, expoKeepAwake, resolvedTag])
}
