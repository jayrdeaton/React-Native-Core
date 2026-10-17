// Whether this platform can keep the screen awake at all. Native always can (it has no `document`).
// A browser can only through the Screen Wake Lock API, which expo-keep-awake's web build wraps and
// its own isAvailableAsync checks the same way: missing from older browsers and from iPhone
// home-screen web apps before iOS 18.4, where activation would always fail. Read at render time, not
// once at import, so a test can add or remove `navigator.wakeLock`.
export function canKeepAwake(): boolean {
  if (typeof document === 'undefined') return true
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator
}
