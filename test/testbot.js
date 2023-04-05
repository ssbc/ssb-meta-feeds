// SPDX-FileCopyrightText: 2022 Mix Irving
//
// SPDX-License-Identifier: Unlicense

const SecretStack = require('secret-stack')
const ssbKeys = require('ssb-keys')
const path = require('path')
const rimraf = require('rimraf')
const caps = require('ssb-caps')

let count = 0

/**
 * - opts.path (optional)
 *   - opts.name (optional) - convenience method for deterministic opts.path
 * - opts.rimraf (optional) - clear the directory before start (default: true)
 * - opts.keys (optional)
 * - opts.metafeedSeed (optional)
 */
module.exports = function createSbot(opts = {}) {
  const dir = opts.path || `/tmp/metafeeds-metafeed-${opts.name || count++}`
  if (opts.rimraf !== false) rimraf.sync(dir)

  const keys = opts.keys || ssbKeys.loadOrCreateSync(path.join(dir, 'secret'))

  const stack = SecretStack({ appKey: caps.shs })
    .use(require('ssb-db2/core'))
    .use(require('ssb-bendy-butt'))
    .use(require('ssb-classic'))
    .use(require('ssb-box2'))
    .use(require('ssb-db2/compat/ebt'))
    .use(require('ssb-ebt'))
    .use(require('../'))

  return stack({
    path: dir,
    keys,
    metafeeds: {
      seed:
        opts.metafeedSeed ||
        Buffer.from(
          '000000000000000000000000000000000000000000000000000000000000beef',
          'hex'
        ),
    },
  })
}
