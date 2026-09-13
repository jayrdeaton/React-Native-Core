import { render } from '@testing-library/react'

import { createModuleConfig } from '../createModuleConfig'

describe('createModuleConfig', () => {
  it('defaults to an empty config', () => {
    const { getConfig } = createModuleConfig<{ paper?: string }>()
    expect(getConfig()).toEqual({})
  })

  it('accepts an initial defaults object', () => {
    const { getConfig } = createModuleConfig<{ paper?: string }>({ paper: 'default-paper' })
    expect(getConfig()).toEqual({ paper: 'default-paper' })
  })

  it('configure() merges into the existing config rather than replacing it', () => {
    const { configure, getConfig } = createModuleConfig<{ camera?: string; paper?: string }>()
    configure({ paper: 'paper-module' })
    expect(getConfig()).toEqual({ paper: 'paper-module' })
    configure({ camera: 'camera-module' })
    expect(getConfig()).toEqual({ paper: 'paper-module', camera: 'camera-module' })
  })

  it('Provider calls configure synchronously during render with its own props (minus children)', () => {
    const { getConfig, Provider } = createModuleConfig<{ camera?: string; paper?: string }>()
    render(
      <Provider camera='camera-module' paper='paper-module'>
        <div>child</div>
      </Provider>
    )
    expect(getConfig()).toEqual({ camera: 'camera-module', paper: 'paper-module' })
  })

  it('Provider renders its children', () => {
    const { Provider } = createModuleConfig<{ paper?: string }>()
    const { getByText } = render(
      <Provider paper='paper-module'>
        <span>hello</span>
      </Provider>
    )
    expect(getByText('hello')).toBeTruthy()
  })

  it('two independent createModuleConfig() calls do not share state', () => {
    const first = createModuleConfig<{ value?: string }>()
    const second = createModuleConfig<{ value?: string }>()
    first.configure({ value: 'first' })
    expect(second.getConfig()).toEqual({})
  })
})
