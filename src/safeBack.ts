import { createModuleConfig } from './createModuleConfig'
import type { OptionalModule } from './OptionalModule'

// Local mirror of only the 3 expo-router `router` methods safeBack calls — never
// `typeof import('expo-router')`, which would still force the type-checker to resolve the real
// package and defeat the point of not hard-depending on it (same reasoning as @rific/scanner's
// and @rific/resizable-input's own local type mirrors of expo-camera/react-native-paper).
export type SafeBackRouter = {
  canGoBack: () => boolean
  back: () => void
  replace: (href: string) => void
}

export type SafeBackConfig = {
  // Optional key (not just an OptionalModule-typed value) so the `{ fallbackPath: '/' }` default
  // literal below doesn't need to spell out `router: undefined` itself — same `field?: T` shape
  // ScannerConfig/ResizableInputConfig use for their own injected peers.
  router?: OptionalModule<SafeBackRouter>
  fallbackPath: string
}

const safeBackConfig = createModuleConfig<SafeBackConfig>({ fallbackPath: '/' })

export const configureNavigation: (next: Partial<SafeBackConfig>) => void = safeBackConfig.configure
export const getNavigationConfig: () => SafeBackConfig = safeBackConfig.getConfig

// router.back() throws expo-router's "GO_BACK was not handled by any navigator" error toast
// whenever this screen has no actual history to pop to — reached directly (a deep link, a
// refreshed page, or this tab's very first navigation) rather than pushed from another screen
// within the app. Falls back to `fallbackPath` (default '/', every app's title screen) instead of
// leaving the user stuck looking at an error toast with a back button that does nothing.
//
// Deliberately zero-argument, reading the injected router from configureNavigation() instead of
// taking it as a parameter, so it keeps working as a bare callback reference (`onBack={safeBack}`)
// at every existing call site instead of needing `onBack={() => safeBack(router)}` everywhere. If
// no router has been configured, this is a no-op (the OptionalModule convention's own "degrade
// gracefully, never throw" rule) — there's no sensible fallback without one.
export function safeBack(): void {
  const { router, fallbackPath } = safeBackConfig.getConfig()
  if (!router) return
  if (router.canGoBack()) router.back()
  else router.replace(fallbackPath)
}

// No Provider component (unlike ScannerProvider/ResizableInputProvider). Those wrap a Scanner/
// ResizableInput component that reads its injected config synchronously during ITS OWN render,
// which is why createModuleConfig's Provider calls configure() during render rather than in an
// effect. safeBack is a plain function invoked later from event handlers, well after the module
// graph — including the app's one `configureNavigation({ router })` call — has finished evaluating.
// There's no first-render ordering hazard to solve, so a Provider would be pure ceremony here.

// Per-app usage (identical in all 5 apps), e.g. src/utils/navigation.ts:
//   import { router } from 'expo-router'
//   import { configureNavigation, safeBack } from '@rific/core'
//   configureNavigation({ router })
//   export { safeBack }
