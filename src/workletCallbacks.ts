import { useEffect, useId, useRef } from 'react'

// A way for a worklet (a gesture callback, a reaction, a scroll handler) to call back into a component
// without pinning that component in memory forever.
//
// `runOnJS(fn)` / `scheduleOnRN(fn)` inside a worklet makes react-native-worklets hold `fn` from native
// code for as long as the worklet's serialized copy lives, and Hermes treats that hold as a GC root. A
// worklet a component keeps (a Gesture built in useMemo, a useAnimatedReaction, a scroll handler) is
// serialized once and cached for as long as the component holds it, so when `fn` is one of the
// component's own callbacks the root keeps the callback, the callback's closure keeps the component (its
// gesture, worklets, fiber, and through its animated refs its native views), and that keeps the cached
// copy that holds the root. Nothing in the loop is ever collected. Found in Solitaire (2026-10-18):
// every card a deal unmounted stayed in memory, about 60 cards and 3.6MB per New Game.
//
// So a worklet calls only `callWorkletCallback`, a module-level function with nothing of a component in
// its closure, passing the string key `useWorkletCallback` returned. The component registers its live
// callback under that key and removes it on unmount, so all native code ever holds is this module's
// function. One-shot animation completions (`withTiming(..., cb)`) the component does not keep cannot
// form the loop and do not need this.

type Callback = (...args: never[]) => void

const callbacks = new Map<string, Callback>()

/**
 * Call from a worklet as `runOnJS(callWorkletCallback)(key, ...args)` (or `scheduleOnRN`). A key whose
 * component has unmounted is ignored. Arguments must be what a worklet can send (numbers, strings,
 * booleans, plain objects).
 */
export function callWorkletCallback(key: string, ...args: unknown[]): void {
  ;(callbacks.get(key) as ((...a: unknown[]) => void) | undefined)?.(...args)
}

/**
 * Registers `callback` for as long as the component is mounted and returns the key a worklet passes to
 * `callWorkletCallback`. The callback does not need to be stable: the latest one is always called.
 */
export function useWorkletCallback<A extends unknown[]>(callback: (...args: A) => void): string {
  const key = useId()
  const latest = useRef(callback)
  useEffect(() => {
    latest.current = callback
  })
  useEffect(() => {
    callbacks.set(key, (...args: never[]) => (latest.current as (...a: unknown[]) => void)(...args))
    return () => {
      callbacks.delete(key)
    }
  }, [key])
  return key
}
