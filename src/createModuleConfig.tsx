import type { ReactNode } from 'react'

// Generalizes the module-level config-singleton shape duplicated identically across
// @rific/drawer's DrawerConfig.tsx, @rific/scanner's ScannerConfig.tsx, and
// @rific/resizable-input's ResizableInputConfig.tsx — each hand-rolls the same five pieces
// (a module-level `let config`, `configureX`/`getXConfig`, an `XProviderProps` type, and an
// `XProvider` that just calls `configureX` synchronously during render) to inject optional peer
// modules (react-native-paper, expo-camera, etc.) without a hard dependency on them. Plain
// module-level state rather than React Context, deliberately: this is one-time app setup ("does
// this app have react-native-paper?"), not per-render reactive state — see each real package's own
// comment on why a Provider-only API would be more ceremony than the problem needs. Not reactive:
// calling `configure` again after components have already rendered won't retroactively update
// them, which is fine for startup config, not for runtime toggling.

export type ModuleConfigProviderProps<T> = T & { children: ReactNode }

export type ModuleConfigResult<T extends object> = {
  configure: (next: Partial<T>) => void
  getConfig: () => T
  // Thin wrapper around `configure` for consumers who'd rather mount a Provider than call the
  // setup function directly. Calls `configure` synchronously during render (not in an effect), so
  // the config is already set by the time any descendant component renders — effects run
  // bottom-up after children have already rendered once, which would be one render too late here.
  Provider: (props: ModuleConfigProviderProps<T>) => React.JSX.Element
}

export function createModuleConfig<T extends object>(defaults: T = {} as T): ModuleConfigResult<T> {
  let config: T = defaults

  const configure = (next: Partial<T>) => {
    config = { ...config, ...next }
  }

  const getConfig = (): T => config

  function Provider({ children, ...rest }: ModuleConfigProviderProps<T>) {
    configure(rest as Partial<T>)
    return <>{children}</>
  }

  return { configure, getConfig, Provider }
}
