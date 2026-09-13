import { act, renderHook } from '@testing-library/react'

import { createSettingHook, createSettingsContext } from '../createSettingsContext'

type FeatureSettings = { locked: boolean; label: string }

const defaults: FeatureSettings = { locked: false, label: 'default' }

describe('createSettingsContext', () => {
  it('reads defaults and no-ops on set with no Provider mounted', () => {
    const { useSettings } = createSettingsContext(defaults)
    const { result } = renderHook(() => useSettings())

    expect(result.current.settings).toEqual(defaults)
    expect(() => result.current.set({ locked: true })).not.toThrow()
  })

  it('seeds state from defaults merged with initialValue', () => {
    const { Provider, useSettings } = createSettingsContext(defaults)
    const { result } = renderHook(() => useSettings(), {
      wrapper: ({ children }) => <Provider initialValue={{ locked: true }}>{children}</Provider>
    })

    expect(result.current.settings).toEqual({ locked: true, label: 'default' })
  })

  it('patches state and reports the full next settings object via onChange', () => {
    const { Provider, useSettings } = createSettingsContext(defaults)
    const onChange = jest.fn()
    const { result } = renderHook(() => useSettings(), {
      wrapper: ({ children }) => <Provider onChange={onChange}>{children}</Provider>
    })

    act(() => result.current.set({ locked: true }))

    expect(result.current.settings).toEqual({ locked: true, label: 'default' })
    expect(onChange).toHaveBeenCalledWith({ locked: true, label: 'default' })
  })

  // renderHook's own `wrapper` option only ever forwards `children` — not `initialProps`/rerender's
  // argument (see @testing-library/react's own RenderHookOptions type) — so a changing `onChange`
  // has to reach the wrapper through a closure variable it re-reads on every render, not through a
  // prop rerender() appears to pass.
  it("keeps set()'s identity stable across a changing onChange prop", () => {
    const { Provider, useSettings } = createSettingsContext(defaults)
    let onChange: ((settings: FeatureSettings) => void) | undefined = jest.fn()
    const { result, rerender } = renderHook(() => useSettings(), {
      wrapper: ({ children }) => <Provider onChange={onChange}>{children}</Provider>
    })
    const firstSet = result.current.set

    onChange = jest.fn()
    rerender()

    expect(result.current.set).toBe(firstSet)
  })

  it('always calls the latest onChange, even after it changes between renders', () => {
    const { Provider, useSettings } = createSettingsContext(defaults)
    const firstOnChange = jest.fn()
    const secondOnChange = jest.fn()
    let onChange = firstOnChange
    const { result, rerender } = renderHook(() => useSettings(), {
      wrapper: ({ children }) => <Provider onChange={onChange}>{children}</Provider>
    })

    onChange = secondOnChange
    rerender()
    act(() => result.current.set({ locked: true }))

    expect(firstOnChange).not.toHaveBeenCalled()
    expect(secondOnChange).toHaveBeenCalledWith({ locked: true, label: 'default' })
  })
})

describe('createSettingHook', () => {
  it('reads and writes a single field through the {value, setValue} shape', () => {
    const { Provider, useSettings } = createSettingsContext(defaults)
    const useLocked = createSettingHook(useSettings, 'locked')
    const { result } = renderHook(() => useLocked(), {
      wrapper: ({ children }) => <Provider>{children}</Provider>
    })

    expect(result.current.value).toBe(false)

    act(() => result.current.setValue(true))

    expect(result.current.value).toBe(true)
  })
})
