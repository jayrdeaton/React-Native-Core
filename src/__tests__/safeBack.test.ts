import type { SafeBackRouter } from '../safeBack'
import { configureNavigation, getNavigationConfig, safeBack } from '../safeBack'

function createMockRouter(canGoBack: boolean): SafeBackRouter {
  return {
    canGoBack: jest.fn(() => canGoBack),
    back: jest.fn(),
    replace: jest.fn()
  }
}

describe('safeBack', () => {
  beforeEach(() => {
    // Reset to a clean slate before every test — configureNavigation merges rather than replaces,
    // so a router configured by one test would otherwise leak into the next.
    configureNavigation({ router: undefined, fallbackPath: '/' })
  })

  it('defaults fallbackPath to "/" and leaves router unconfigured', () => {
    expect(getNavigationConfig()).toEqual({ fallbackPath: '/' })
  })

  it('calls router.back() when canGoBack() is true', () => {
    const router = createMockRouter(true)
    configureNavigation({ router })

    safeBack()

    expect(router.canGoBack).toHaveBeenCalled()
    expect(router.back).toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('falls back to router.replace(fallbackPath) when canGoBack() is false', () => {
    const router = createMockRouter(false)
    configureNavigation({ router })

    safeBack()

    expect(router.back).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith('/')
  })

  it('replaces with a custom fallbackPath when one is configured', () => {
    const router = createMockRouter(false)
    configureNavigation({ router, fallbackPath: '/home' })

    safeBack()

    expect(router.replace).toHaveBeenCalledWith('/home')
  })

  it('is a no-op when no router has been configured', () => {
    expect(() => safeBack()).not.toThrow()
  })
})
