import { createModuleConfig } from './createModuleConfig'
import type { OptionalModule } from './OptionalModule'

// Local mirror of only the 3 expo-router `router` methods safeBack calls — never
// `typeof import('expo-router')`, which would still force the type-checker to resolve the real
// package and defeat the point of not hard-depending on it (same reasoning as @rific/scanner's
// and @rific/resizable-input's own local type mirrors of expo-camera/react-native-paper).
//
// `replace`'s own `href` parameter is deliberately typed `any`, not `string` — an app with Expo
// Router's `experiments.typedRoutes` enabled has a real `router.replace` whose `href` parameter is
// narrowed to that app's own generated union of valid route strings, not a general `string`.
// Confirmed (broke exactly this way the first time a typed-routes app — Solitaire — tried to
// configure this, and confirmed the fix in isolation with a standalone tsc repro before landing it
// here): under `strictFunctionTypes`, a real router's narrower `replace` is NOT structurally
// assignable to a `string`-typed `replace` — function parameters are checked contravariantly, and a
// function accepting only specific literals can't stand in for one promising to accept any string.
// Switching the interface member to method-shorthand syntax does NOT fix this either (verified —
// method bivariance doesn't rescue this case). Since every real app's own Href union is a distinct,
// unique generated type this file can never name in advance, there is no single non-`any` type that
// stays assignable from every app's own router while also staying callable from safeBack's own
// `router.replace(fallbackPath)` below (`fallbackPath` is always a plain `string`, always `'/'` by
// default) — `any` is the deliberate, narrowest-possible escape hatch that satisfies both directions
// at once, not a lazy fallback. `canGoBack`/`back` take no parameters, so they have no such variance
// concern either way.
export type SafeBackRouter = {
  canGoBack(): boolean
  back(): void
  // Deliberate `any` — see the doc comment above (no non-any type stays assignable from every
  // app's own unique typed-routes Href union while also staying callable with a plain string).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  replace(href: any): void
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
