export * from 'node:test'
import * as node_test from 'node:test'
export const it = (name, options, fn) => {
  // Support calling as it(name, fn) without options
  if (typeof options === 'function') {
    fn = options
    options = {}
  }
  if (options?.slow && !process.env.RUN_SLOW) {
    return node_test.it(name, { ...options, skip: true }, fn)
  }
  return node_test.it(name, options, fn)
}
