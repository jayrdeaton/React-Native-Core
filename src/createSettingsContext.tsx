import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react'

export type SettingsContextValue<T> = {
  settings: T
  set: (patch: Partial<T>) => void
}

export type SettingsProviderProps<T> = {
  children: ReactNode
  // Rehydrates from the consuming app's own storage at mount time — this factory (like every
  // hand-rolled settings Provider it replaces) deliberately does no persistence of its own. The app
  // decides where, or whether, `settings` gets saved.
  initialValue?: Partial<T>
  // Fires with the full settings object on every `set` call — the app's hook into persisting it.
  onChange?: (settings: T) => void
}

export type SettingsContextResult<T> = {
  Context: React.Context<SettingsContextValue<T>>
  Provider: (props: SettingsProviderProps<T>) => React.JSX.Element
  useSettings: () => SettingsContextValue<T>
}

// Builds one {Context, Provider, useSettings} triple for a single settings shape T. Matches the
// initialValue/onChange/patch-based contract already duplicated by hand, near-identically, across
// this fleet's own settings Providers (feedback-press's sound + haptics, scroll-view's own settings,
// auto-paper's ThemeProvider, @tastic/core's orientation-lock context) — every one of those is this
// same ~30-line shape typed out separately. `defaults` seeds both the Context's own inert
// no-Provider-mounted fallback (settings read as `defaults`, `set` silently drops — the same
// "nothing crashes, it just never resolves" degradation every one of those packages already
// documents for a missing Provider) and the Provider's real initial state, patched by `initialValue`.
export function createSettingsContext<T extends object>(defaults: T): SettingsContextResult<T> {
  const Context = createContext<SettingsContextValue<T>>({ settings: defaults, set: () => {} })

  function Provider({ children, initialValue, onChange }: SettingsProviderProps<T>) {
    const [settings, setSettings] = useState<T>(() => ({ ...defaults, ...initialValue }))

    // Read via a ref rather than closed over directly, so `set`'s identity never changes just
    // because the caller passed a fresh `onChange` closure this render — a consumer that memoizes
    // off `set`'s stability (or hands it deep into a tree) doesn't re-render every time the app's
    // own onChange callback is redefined.
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange

    const set = useCallback((patch: Partial<T>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch }
        onChangeRef.current?.(next)
        return next
      })
    }, [])

    return <Context.Provider value={{ settings, set }}>{children}</Context.Provider>
  }

  function useSettings(): SettingsContextValue<T> {
    return useContext(Context)
  }

  return { Context, Provider, useSettings }
}

// Thin convenience for the common single-field case — the {value, setValue} shape this fleet's own
// useOrientationLock/useSoundSettings/useHapticSettings hooks each hand-roll individually, for a
// caller that only cares about one field of a larger settings object rather than the whole
// patch-based contract. Not every consumer needs this — one juggling several fields at once (e.g.
// feedback-press's own sound/haptic sub-settings) is still better served calling useSettings()
// directly and patching as needed.
export function createSettingHook<T extends object, K extends keyof T>(useSettings: () => SettingsContextValue<T>, key: K) {
  return function useSetting(): { value: T[K]; setValue: (value: T[K]) => void } {
    const { settings, set } = useSettings()
    const setValue = useCallback((value: T[K]) => set({ [key]: value } as unknown as Partial<T>), [set])
    return { value: settings[key], setValue }
  }
}
