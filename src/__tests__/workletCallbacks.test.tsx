import { act, renderHook } from '@testing-library/react'

import { callWorkletCallback, useWorkletCallback } from '../workletCallbacks'

describe('workletCallbacks', () => {
  it('calls the registered callback with the arguments', () => {
    const fn = jest.fn()
    const { result } = renderHook(() => useWorkletCallback(fn))
    callWorkletCallback(result.current, 1, 'two')
    expect(fn).toHaveBeenCalledWith(1, 'two')
  })

  it('calls the latest callback without re-registering', () => {
    const first = jest.fn()
    const second = jest.fn()
    const { result, rerender } = renderHook(({ cb }) => useWorkletCallback(cb), { initialProps: { cb: first } })
    const key = result.current
    rerender({ cb: second })
    callWorkletCallback(key, 5)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(5)
    expect(result.current).toBe(key)
  })

  it('ignores a key after the component unmounts', () => {
    const fn = jest.fn()
    const { result, unmount } = renderHook(() => useWorkletCallback(fn))
    const key = result.current
    act(() => unmount())
    callWorkletCallback(key)
    expect(fn).not.toHaveBeenCalled()
  })

  it('ignores an unknown key', () => {
    expect(() => callWorkletCallback('nope')).not.toThrow()
  })
})
