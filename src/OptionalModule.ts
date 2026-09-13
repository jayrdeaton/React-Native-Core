// Names the convention feedback-press, drawer, scanner, and auto-paper each already follow (and
// each re-explain from scratch in their own doc comments) for injecting an optional peer module
// (react-native-paper, expo-camera, expo-blur, react-native-reanimated, etc.) without a hard
// dependency on it:
//
// 1. Auto-detection via a require()-in-try/catch call doesn't work reliably: Metro doesn't rewrite
//    that call into its module graph inside an ESM (.mjs) build, so module-level auto-detection
//    silently breaks the moment a consumer's bundler resolves the package's ESM entry point.
// 2. So instead, accept the module as an explicit injected prop (e.g. `paper?: OptionalModule<PaperModuleShape>`)
//    and have the consuming app pass `import * as RNPaper from 'react-native-paper'` itself.
// 3. Mirror only the small slice of the module's shape you actually use as a local type — never
//    `typeof import('the-real-package')`, which still forces the type-checker to resolve the real
//    module and defeats the point of not hard-depending on it.
// 4. Degrade gracefully when the prop is omitted (a plain fallback UI, a no-op), never throw.
//
// This type is deliberately trivial (`T | undefined`) — its value is giving that convention one
// name every package's own doc comment can point back to, instead of re-deriving the same
// reasoning independently each time a new optional peer gets injected.
export type OptionalModule<T> = T | undefined
