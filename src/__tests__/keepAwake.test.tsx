import { act, renderHook } from '@testing-library/react'
import type * as RealExpoKeepAwake from 'expo-keep-awake'
import type { ReactNode } from 'react'

import { defaultKeepAwakeSettings, type ExpoKeepAwakeModule, keepAwakeActions, KeepAwakeProvider, type KeepAwakeProviderProps, keepAwakeReducer, useExpoKeepAwake, useKeepAwake, useKeepAwakeSettings } from '../keepAwake'

function createMockModule(): jest.Mocked<ExpoKeepAwakeModule> {
  return {
    activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
    deactivateKeepAwake: jest.fn(() => Promise.resolve())
  }
}

function wrapperWith(props: Omit<KeepAwakeProviderProps, 'children'>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <KeepAwakeProvider {...props}>{children}</KeepAwakeProvider>
  }
}

// Lets a rejected activate/deactivate promise's .catch run, so an unhandled rejection would surface
// inside the test that caused it.
const flushPromises = () => act(() => Promise.resolve())

describe('keep awake', () => {
  it('mirrors a shape the real expo-keep-awake module satisfies', () => {
    // Type-level: fails typecheck if expo-keep-awake's own exports stop fitting the local mirror.
    const fits = (real: typeof RealExpoKeepAwake): ExpoKeepAwakeModule => real
    expect(fits).toBeInstanceOf(Function)
  })

  it('defaults to enabled', () => {
    expect(defaultKeepAwakeSettings).toEqual({ enabled: true })
  })

  it('reads defaults, has no module, and does nothing with no Provider mounted', () => {
    const { result } = renderHook(() => {
      useKeepAwake('game')
      return { settings: useKeepAwakeSettings().settings, expoKeepAwake: useExpoKeepAwake() }
    })

    expect(result.current.settings).toEqual({ enabled: true })
    expect(result.current.expoKeepAwake).toBeUndefined()
  })

  it('exposes the injected module through useExpoKeepAwake', () => {
    const expoKeepAwake = createMockModule()
    const { result } = renderHook(() => useExpoKeepAwake(), { wrapper: wrapperWith({ expoKeepAwake }) })

    expect(result.current).toBe(expoKeepAwake)
  })

  it('does nothing when the Provider has no module', () => {
    const { result } = renderHook(
      () => {
        useKeepAwake('game')
        return useKeepAwakeSettings()
      },
      { wrapper: wrapperWith({}) }
    )

    expect(() => act(() => result.current.set({ enabled: false }))).not.toThrow()
  })

  it('activates on mount and deactivates on unmount with the given tag', () => {
    const expoKeepAwake = createMockModule()
    const { unmount } = renderHook(() => useKeepAwake('game'), { wrapper: wrapperWith({ expoKeepAwake }) })

    expect(expoKeepAwake.activateKeepAwakeAsync).toHaveBeenCalledTimes(1)
    expect(expoKeepAwake.activateKeepAwakeAsync).toHaveBeenCalledWith('game')
    expect(expoKeepAwake.deactivateKeepAwake).not.toHaveBeenCalled()

    unmount()

    expect(expoKeepAwake.deactivateKeepAwake).toHaveBeenCalledTimes(1)
    expect(expoKeepAwake.deactivateKeepAwake).toHaveBeenCalledWith('game')
  })

  it('gives each hook instance its own tag when none is passed', () => {
    const expoKeepAwake = createMockModule()
    renderHook(
      () => {
        useKeepAwake()
        useKeepAwake()
      },
      { wrapper: wrapperWith({ expoKeepAwake }) }
    )

    const [[first], [second]] = expoKeepAwake.activateKeepAwakeAsync.mock.calls
    expect(first).toEqual(expect.any(String))
    expect(second).toEqual(expect.any(String))
    expect(first).not.toBe(second)
  })

  it('stays off when the persisted setting is off', () => {
    const expoKeepAwake = createMockModule()
    renderHook(() => useKeepAwake('game'), { wrapper: wrapperWith({ expoKeepAwake, initialValue: { enabled: false } }) })

    expect(expoKeepAwake.activateKeepAwakeAsync).not.toHaveBeenCalled()
  })

  it('follows the setting while mounted and reports it through onChange', () => {
    const expoKeepAwake = createMockModule()
    const onChange = jest.fn()
    const { result } = renderHook(
      () => {
        useKeepAwake('game')
        return useKeepAwakeSettings()
      },
      { wrapper: wrapperWith({ expoKeepAwake, onChange }) }
    )

    act(() => result.current.set({ enabled: false }))

    expect(expoKeepAwake.deactivateKeepAwake).toHaveBeenCalledWith('game')
    expect(onChange).toHaveBeenCalledWith({ enabled: false })

    act(() => result.current.set({ enabled: true }))

    expect(expoKeepAwake.activateKeepAwakeAsync).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith({ enabled: true })
  })

  it('only keeps the screen awake while active', () => {
    const expoKeepAwake = createMockModule()
    const { rerender } = renderHook(({ active }) => useKeepAwake('map', { active }), {
      initialProps: { active: false },
      wrapper: wrapperWith({ expoKeepAwake })
    })

    expect(expoKeepAwake.activateKeepAwakeAsync).not.toHaveBeenCalled()

    rerender({ active: true })

    expect(expoKeepAwake.activateKeepAwakeAsync).toHaveBeenCalledWith('map')

    rerender({ active: false })

    expect(expoKeepAwake.deactivateKeepAwake).toHaveBeenCalledWith('map')
  })

  it('swallows a refused activation and a deactivation with no lock held', async () => {
    const expoKeepAwake: ExpoKeepAwakeModule = {
      activateKeepAwakeAsync: jest.fn(() => Promise.reject(new Error('NotAllowedError'))),
      deactivateKeepAwake: jest.fn(() => Promise.reject(new Error('no wake lock held')))
    }
    const { unmount } = renderHook(() => useKeepAwake('game'), { wrapper: wrapperWith({ expoKeepAwake }) })
    await flushPromises()

    unmount()
    await flushPromises()

    expect(expoKeepAwake.activateKeepAwakeAsync).toHaveBeenCalled()
    expect(expoKeepAwake.deactivateKeepAwake).toHaveBeenCalled()
  })

  it('has a keepAwake-namespaced slice with initialize and setEnabled', () => {
    expect(keepAwakeReducer(undefined, { type: '@@INIT' })).toEqual({ enabled: true })
    expect(keepAwakeActions.initialize({ enabled: false }).type).toBe('keepAwake/initialize')
    expect(keepAwakeReducer(undefined, keepAwakeActions.initialize({ enabled: false }))).toEqual({ enabled: false })
    expect(keepAwakeReducer({ enabled: false }, keepAwakeActions.setEnabled(true))).toEqual({ enabled: true })
  })
})
