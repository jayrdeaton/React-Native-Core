import { createSettingsSlice } from '../createSettingsSlice'

describe('createSettingsSlice', () => {
  // Mirrors hapticSlice.ts/soundSlice.ts exactly: single field, 'replace' initialize (the default),
  // one generated setter.
  describe('single-field, replace mode (haptic/sound shape)', () => {
    type HapticSettings = { vibrate: boolean }
    const initialState: HapticSettings = { vibrate: true }
    const { actions, reducer } = createSettingsSlice('haptic', { initialState })

    it('namespaces action types', () => {
      expect(actions.initialize.type).toBe('haptic/initialize')
      expect(actions.setVibrate.type).toBe('haptic/setVibrate')
    })

    it('defaults to the given initialState', () => {
      expect(reducer(undefined, { type: '@@INIT' })).toEqual({ vibrate: true })
    })

    it('initialize replaces the whole state, not merges', () => {
      const state = reducer({ vibrate: true }, actions.initialize({ vibrate: false }))
      expect(state).toEqual({ vibrate: false })
    })

    it('the generated per-field setter patches just that field', () => {
      const state = reducer({ vibrate: true }, actions.setVibrate(false))
      expect(state).toEqual({ vibrate: false })
    })

    it('ignores actions from a different namespace', () => {
      const state = { vibrate: true }
      expect(reducer(state, { type: 'sound/setEnabled' })).toBe(state)
    })
  })

  // Mirrors scrollViewSlice.ts: several fields, zero per-field setters — initialize is the only action.
  describe('multi-field, no setters (scrollView shape)', () => {
    type ScrollViewSettings = { footerFixed: boolean; headerFixed: boolean; snapBack: boolean }
    const initialState: ScrollViewSettings = { footerFixed: false, headerFixed: false, snapBack: true }
    const { actions, reducer } = createSettingsSlice('scrollView', { initialState, fieldSetters: [] })

    it('exposes only initialize, no per-field setters', () => {
      expect(Object.keys(actions)).toEqual(['initialize'])
    })

    it('initialize still replaces the whole state', () => {
      const next = { footerFixed: true, headerFixed: true, snapBack: false }
      expect(reducer(initialState, actions.initialize(next))).toEqual(next)
    })
  })

  // Mirrors themeSlice.ts's three wrinkles: a merging initialize, an overridable reducer factory,
  // and per-field selectors.
  describe('merge mode + overridable factory + selectors (theme shape)', () => {
    type ThemeState = { appearance: 'system' | 'light' | 'dark'; blur: boolean; color: string }
    const defaultInitialState: ThemeState = { appearance: 'system', blur: true, color: '#6750a4' }
    const { actions, reducer, createReducer, selectors } = createSettingsSlice('theme', {
      initialState: defaultInitialState,
      initializeMode: 'merge' as const,
      selectors: ['appearance', 'blur', 'color'] as const
    })

    it('generates a setter for every field by default', () => {
      expect(Object.keys(actions).sort()).toEqual(['initialize', 'setAppearance', 'setBlur', 'setColor'])
    })

    it('initialize merges a partial patch instead of replacing', () => {
      const state = reducer(defaultInitialState, actions.initialize({ color: '#ff0000' }))
      expect(state).toEqual({ appearance: 'system', blur: true, color: '#ff0000' })
    })

    it('per-field setters still work alongside merge-mode initialize', () => {
      const state = reducer(defaultInitialState, actions.setBlur(false))
      expect(state).toEqual({ ...defaultInitialState, blur: false })
    })

    it('createReducer(overrideInitialState) seeds a different default without touching action handling', () => {
      const seededReducer = createReducer({ color: '#f44336' })
      expect(seededReducer(undefined, { type: '@@INIT' })).toEqual({ ...defaultInitialState, color: '#f44336' })
      // action handling is identical to the un-overridden reducer
      expect(seededReducer({ ...defaultInitialState, color: '#f44336' }, actions.setBlur(false))).toEqual({
        appearance: 'system',
        blur: false,
        color: '#f44336'
      })
    })

    it('reducer (no override) behaves the same as createReducer() with no args', () => {
      expect(reducer(undefined, { type: '@@INIT' })).toEqual(defaultInitialState)
    })

    it('generates one selector per configured field', () => {
      const state: ThemeState = { appearance: 'dark', blur: false, color: '#000000' }
      expect(selectors.selectAppearance(state)).toBe('dark')
      expect(selectors.selectBlur(state)).toBe(false)
      expect(selectors.selectColor(state)).toBe('#000000')
    })
  })
})
