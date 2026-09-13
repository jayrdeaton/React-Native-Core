// Generalizes the Redux slice half of the same duplicated shape createSettingsContext already
// covers for the Context half. feedback-press's hapticSlice.ts/soundSlice.ts, scroll-view's
// scrollViewSlice.ts, and auto-paper's themeSlice.ts each hand-roll an identical createAction/
// .match()/if-chain reducer — the exact block below is copy-pasted verbatim across all four today.
// This factory reproduces every real behavior those four files need (including auto-paper's own
// wrinkles: a merging `initialize`, an overridable reducer factory, and per-field selectors) as
// plain config, not new logic.

export type SettingsAction<P> = { payload: P; type: string }

type ActionCreator<P> = {
  (payload: P): SettingsAction<P>
  type: string
  match: (action: { type: string }) => action is SettingsAction<P>
}

type Capitalized<K extends PropertyKey> = K extends string ? Capitalize<K> : never

type FieldSetterActions<T, Fields extends keyof T> = {
  [K in Fields as `set${Capitalized<K>}`]: ActionCreator<T[K]>
}

type FieldSelectors<T, Fields extends keyof T> = {
  [K in Fields as `select${Capitalized<K>}`]: (state: T) => T[K]
}

export type SettingsReducer<T> = (state: T | undefined, action: { type: string }) => T

// 'replace' (the default, and what haptic/sound/scrollView all do): `initialize`'s payload becomes
// the entire next state, verbatim — matches how every real call site already dispatches it (the
// app's own onChange handler always hands back a complete settings object, never a partial one),
// so `initialize` takes the full T. 'merge' (only auto-paper's theme needs this): the payload is
// spread over the existing state instead, so `initialize` takes a Partial<T> — a caller can seed
// just part of it.
export type InitializeMode = 'replace' | 'merge'

type InitializePayload<T, Mode extends InitializeMode> = Mode extends 'merge' ? Partial<T> : T

export type CreateSettingsSliceOptions<T extends object, Mode extends InitializeMode, SetterFields extends keyof T, SelectorFields extends keyof T> = {
  initialState: T
  initializeMode?: Mode
  // Which fields get a dedicated setX action (e.g. `vibrate` -> `setVibrate`). Defaults to every key
  // of initialState — matches haptic/sound/theme, which each expose one setter per field.
  // scrollView needs this passed as `[]` explicitly: it has 6 fields but zero per-field setters,
  // relying on `initialize` alone.
  fieldSetters?: SetterFields[]
  // Which fields get a generated selectX(state) => state[field]. Defaults to none — only auto-paper's
  // theme slice has these today.
  selectors?: SelectorFields[]
}

export type SettingsSliceResult<T extends object, Mode extends InitializeMode, SetterFields extends keyof T, SelectorFields extends keyof T> = {
  actions: { initialize: ActionCreator<InitializePayload<T, Mode>> } & FieldSetterActions<T, SetterFields>
  reducer: SettingsReducer<T>
  // The auto-paper wrinkle: a factory that lets a consumer override the default initial state at
  // construction time (e.g. seeding a per-app default color), independent of the runtime `initialize`
  // action. `reducer` above is just `createReducer()` with no override.
  createReducer: (overrideInitialState?: Partial<T>) => SettingsReducer<T>
  selectors: FieldSelectors<T, SelectorFields>
}

function capitalize<K extends PropertyKey>(key: K): Capitalized<K> {
  const s = String(key)
  return (s.charAt(0).toUpperCase() + s.slice(1)) as Capitalized<K>
}

function createActionCreator<P>(type: string): ActionCreator<P> {
  const actionCreator = ((payload: P) => ({ payload, type })) as ActionCreator<P>
  actionCreator.type = type
  actionCreator.match = (action: { type: string }): action is SettingsAction<P> => action.type === type
  return actionCreator
}

// `namespace` prefixes every action type (e.g. 'haptic/initialize', 'theme/setAppearance') so
// multiple slices combined in one store never collide — matches the fleet's existing convention
// exactly (hapticSlice's own action types are literally 'haptic/initialize' etc. today).
export function createSettingsSlice<T extends object, Mode extends InitializeMode = 'replace', SetterFields extends keyof T = keyof T, SelectorFields extends keyof T = never>(namespace: string, options: CreateSettingsSliceOptions<T, Mode, SetterFields, SelectorFields>): SettingsSliceResult<T, Mode, SetterFields, SelectorFields> {
  const { initialState, selectors = [] } = options
  const initializeMode: InitializeMode = options.initializeMode ?? 'replace'
  const fieldSetters = options.fieldSetters ?? (Object.keys(initialState) as SetterFields[])

  // Internally untyped (any payload) — the precise conditional typing based on `Mode` lives only
  // in the exported return type below; the runtime logic itself doesn't need to know Mode at the
  // type level, only the `initializeMode` string value it already has.
  const initialize = createActionCreator<Partial<T> | T>(`${namespace}/initialize`)
  const setterEntries = fieldSetters.map((field) => {
    const actionName = `set${capitalize(field)}`
    const creator = createActionCreator<T[typeof field]>(`${namespace}/${actionName}`)
    return { actionName, field, creator }
  })

  const actions = {
    initialize,
    ...Object.fromEntries(setterEntries.map(({ actionName, creator }) => [actionName, creator]))
  } as unknown as SettingsSliceResult<T, Mode, SetterFields, SelectorFields>['actions']

  const reduce = (state: T, action: { type: string }): T => {
    if (initialize.match(action)) return initializeMode === 'merge' ? { ...state, ...(action.payload as Partial<T>) } : (action.payload as T)
    for (const { field, creator } of setterEntries) {
      if (creator.match(action)) return { ...state, [field]: action.payload }
    }
    return state
  }

  function createReducer(overrideInitialState?: Partial<T>): SettingsReducer<T> {
    const initial = { ...initialState, ...overrideInitialState }
    return (state: T = initial, action: { type: string }): T => reduce(state, action)
  }

  const selectorsObj = Object.fromEntries(selectors.map((field) => [`select${capitalize(field)}`, (state: T) => state[field]])) as unknown as SettingsSliceResult<T, Mode, SetterFields, SelectorFields>['selectors']

  return { actions, reducer: createReducer(), createReducer, selectors: selectorsObj }
}
