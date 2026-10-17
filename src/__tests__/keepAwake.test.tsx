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

// Runs every queued activate/deactivate (useKeepAwake chains each call on the one before it), and
// lets a rejected one's .catch run, so an unhandled rejection would surface inside the test that
// caused it.
const flushPromises = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

// jsdom has no Screen Wake Lock API, and KeepAwakeProvider withholds the module from a browser
// without one (see canKeepAwake), so every test but the one about that browser gets a stand-in.
function setWakeLock(present: boolean) {
  if (present) Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: {} })
  else delete (navigator as { wakeLock?: unknown }).wakeLock
}

let visibilityState: DocumentVisibilityState = 'visible'

function setVisibility(state: DocumentVisibilityState) {
  visibilityState = state
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

beforeAll(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilityState })
})

beforeEach(() => {
  setWakeLock(true)
  visibilityState = 'visible'
})

afterAll(() => {
  setWakeLock(false)
})

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

  it('withholds the module and keeps nothing awake in a browser without the Screen Wake Lock API', async () => {
    setWakeLock(false)
    const expoKeepAwake = createMockModule()
    const { result } = renderHook(
      () => {
        useKeepAwake('game')
        return useExpoKeepAwake()
      },
      { wrapper: wrapperWith({ expoKeepAwake }) }
    )
    await flushPromises()

    expect(result.current).toBeUndefined()
    expect(expoKeepAwake.activateKeepAwakeAsync).not.toHaveBeenCalled()
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

  it('activates on mount and deactivates on unmount with the given tag', async () => {
    const expoKeepAwake = createMockModule()
    const { unmount } = renderHook(() => useKeepAwake('game'), { wrapper: wrapperWith({ expoKeepAwake }) })
    await flushPromises()

    expect(expoKeepAwake.activateKeepAwakeAsync).toHaveBeenCalledTimes(1)
    expect(expoKeepAwake.activateKeepAwakeAsync).toHaveBeenCalledWith('game')
    expect(expoKeepAwake.deactivateKeepAwake).not.toHaveBeenCalled()

    unmount()
    await flushPromises()

    expect(expoKeepAwake.deactivateKeepAwake).toHaveBeenCalledTimes(1)
    expect(expoKeepAwake.deactivateKeepAwake).toHaveBeenCalledWith('game')
  })

  it('gives each hook instance its own tag when none is passed', async () => {
    const expoKeepAwake = createMockModule()
    renderHook(
      () => {
        useKeepAwake()
        useKeepAwake()
      },
      { wrapper: wrapperWith({ expoKeepAwake }) }
    )
    await flushPromises()

    const [[first], [second]] = expoKeepAwake.activateKeepAwakeAsync.mock.calls
    expect(first).toEqual(expect.any(String))
    expect(second).toEqual(expect.any(String))
    expect(first).not.toBe(second)
  })

  it('stays off when the persisted setting is off', async () => {
    const expoKeepAwake = createMockModule()
    renderHook(() => useKeepAwake('game'), { wrapper: wrapperWith({ expoKeepAwake, initialValue: { enabled: false } }) })
    await flushPromises()

    expect(expoKeepAwake.activateKeepAwakeAsync).not.toHaveBeenCalled()
  })

  it('follows the setting while mounted and reports it through onChange', async () => {
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
    await flushPromises()

    expect(expoKeepAwake.deactivateKeepAwake).toHaveBeenCalledWith('game')
    expect(onChange).toHaveBeenCalledWith({ enabled: false })

    act(() => result.current.set({ enabled: true }))
    await flushPromises()

    expect(expoKeepAwake.activateKeepAwakeAsync).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith({ enabled: true })
  })

  it('only keeps the screen awake while active', async () => {
    const expoKeepAwake = createMockModule()
    const { rerender } = renderHook(({ active }) => useKeepAwake('map', { active }), {
      initialProps: { active: false },
      wrapper: wrapperWith({ expoKeepAwake })
    })
    await flushPromises()

    expect(expoKeepAwake.activateKeepAwakeAsync).not.toHaveBeenCalled()

    rerender({ active: true })
    await flushPromises()

    expect(expoKeepAwake.activateKeepAwakeAsync).toHaveBeenCalledWith('map')

    rerender({ active: false })
    await flushPromises()

    expect(expoKeepAwake.deactivateKeepAwake).toHaveBeenCalledWith('map')
  })

  it('asks for the lock again each time the page is visible again, and stops once unmounted', async () => {
    const expoKeepAwake = createMockModule()
    const { unmount } = renderHook(() => useKeepAwake('game'), { wrapper: wrapperWith({ expoKeepAwake }) })
    await flushPromises()

    setVisibility('hidden')
    await flushPromises()

    expect(expoKeepAwake.activateKeepAwakeAsync).toHaveBeenCalledTimes(1)

    setVisibility('visible')
    await flushPromises()

    expect(expoKeepAwake.activateKeepAwakeAsync).toHaveBeenCalledTimes(2)
    expect(expoKeepAwake.activateKeepAwakeAsync).toHaveBeenLastCalledWith('game')

    unmount()
    setVisibility('hidden')
    setVisibility('visible')
    await flushPromises()

    expect(expoKeepAwake.activateKeepAwakeAsync).toHaveBeenCalledTimes(2)
  })

  it('waits for an activation still in flight before deactivating', async () => {
    let grant: () => void = () => undefined
    const expoKeepAwake = createMockModule()
    expoKeepAwake.activateKeepAwakeAsync.mockImplementationOnce(() => new Promise<void>((resolve) => (grant = resolve)))
    const { unmount } = renderHook(() => useKeepAwake('game'), { wrapper: wrapperWith({ expoKeepAwake }) })
    await flushPromises()

    unmount()
    await flushPromises()

    expect(expoKeepAwake.deactivateKeepAwake).not.toHaveBeenCalled()

    grant()
    await flushPromises()

    expect(expoKeepAwake.deactivateKeepAwake).toHaveBeenCalledWith('game')
  })

  it('lets a quick off-then-on finish releasing before it asks for the lock again', async () => {
    const order: string[] = []
    let grant: () => void = () => undefined
    const expoKeepAwake: ExpoKeepAwakeModule = {
      activateKeepAwakeAsync: jest.fn((tag?: string) => {
        order.push(`activate ${tag}`)
        return order.length === 1 ? new Promise<void>((resolve) => (grant = resolve)) : Promise.resolve()
      }),
      deactivateKeepAwake: jest.fn((tag?: string) => {
        order.push(`deactivate ${tag}`)
        return Promise.resolve()
      })
    }
    const { rerender } = renderHook(({ active }) => useKeepAwake('game', { active }), {
      initialProps: { active: true },
      wrapper: wrapperWith({ expoKeepAwake })
    })
    await flushPromises()

    rerender({ active: false })
    rerender({ active: true })
    await flushPromises()

    expect(order).toEqual(['activate game'])

    grant()
    await flushPromises()

    expect(order).toEqual(['activate game', 'deactivate game', 'activate game'])
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
