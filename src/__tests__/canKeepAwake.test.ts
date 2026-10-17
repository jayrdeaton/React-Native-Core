/**
 * @jest-environment node
 */
import { canKeepAwake } from '../canKeepAwake'

// The node environment has no `document`, the same as React Native on a device, where keeping the
// screen awake always works. (Node's own global `navigator` has no `wakeLock`, so this also checks
// the browser test isn't applied off the web.) The browser cases are in keepAwake.test.tsx, under
// jsdom.
describe('canKeepAwake', () => {
  it('is true with no document, as on native', () => {
    expect(typeof document).toBe('undefined')
    expect(canKeepAwake()).toBe(true)
  })
})
