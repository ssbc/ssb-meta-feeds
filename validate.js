const bencode = require('bencode')
const bfe = require('ssb-bfe')
const ssbKeys = require('ssb-keys')
const SSBURI = require('ssb-uri2')
const ref = require('ssb-ref')
const isCanonicalBase64 = require('is-canonical-base64')

const CONTENT_SIG_PREFIX = Buffer.from('bendybutt', 'utf8')

/**
 * Validate a single meta feed message.
 *
 * @param {Array | string} contentSection - an array of `content` and `contentSignature` or an encrypted string
 * @param {Buffer | string | null} hmacKey - a valid HMAC key for signature verification
 * @returns {Object | true} an `Error` object or `true` in the case of successful validation
 */
exports.validateSingle = function (contentSection, hmacKey) {
  if (contentSection === null || contentSection === undefined)
    return new Error(
      `invalid message: contentSection cannot be null or undefined`
    )

  // check if content is (maybe) encrypted
  if (typeof contentSection === 'string')
    return new Error(
      'invalid message: cannot validate encrypted contentSection'
    )

  if (!(Array.isArray(contentSection) && contentSection.length === 2))
    return new Error(
      `invalid message: contentSection ${typeof contentSection} with length ${
        contentSection.length
      } is incorrect, expected a list of content and contentSignature`
    )

  const [content, contentSignature] = contentSection

  if (
    !(
      content.type === 'metafeed/add/existing' ||
      content.type === 'metafeed/add/derived' ||
      content.type === 'metafeed/update' ||
      content.type === 'metafeed/tombstone'
    )
  )
    return new Error(
      `invalid message: content type ${content.type} is incorrect`
    )

  const subfeedBFE = bfe.encode(content.subfeed)
  const subfeedType = subfeedBFE.slice(0, 1).toString('hex')
  if (subfeedType !== '00')
    return new Error(
      `invalid message: content subfeed type "0x${subfeedType}" is incorrect, expected 0x00`
    )

  const metafeedBFE = bfe.encode(content.metafeed)
  const metafeedType = metafeedBFE.slice(0, 2).toString('hex')
  if (metafeedType !== '0003')
    return new Error(
      `invalid message: content metafeed type "0x${metafeedType}" is incorrect, expected 0x0003`
    )

  if (content.type === 'metafeed/add/derived') {
    if (content.nonce.length !== 32)
      return new Error(
        `invalid message: content nonce "${content.nonce}" is ${content.nonce.length} bytes, expected 32`
      )
  }

  const signatureErr = validateSignature(
    content.subfeed,
    content,
    contentSignature,
    hmacKey
  )
  if (signatureErr) return signatureErr
}

/**
 * Verify that the contentSignature correctly signs the content.
 *
 * @param {string} subfeedKey - `subfeed` key for the message
 * @param {Buffer} content - Dictionary of meta feed metadata
 * @param {string} contentSignature - Base64-encoded signature for the given `content`
 * @param {Buffer | string | null} hmacKey - HMAC key that was used to sign the payload
 * @returns {Object | undefined} Either an Error containing a message or an `undefined` value for successful verification
 */
function validateSignature(subfeedKey, content, contentSignature, hmacKey) {
  const hmacKeyErr = validateHmacKey(hmacKey)
  if (hmacKeyErr) return hmacKeyErr

  const isSignatureRx = isCanonicalBase64('', '\\.sig.\\w+')

  if (!isSignatureRx.test(contentSignature))
    return new Error(
      `invalid message: contentSignature "${contentSignature}", expected a base64 string`
    )

  const contentBFE = bfe.encode(content)

  // if the subfeedKey is a supported uri, convert it to sigil for verification
  if (!ref.isFeed(subfeedKey)) {
    if (
      !SSBURI.isFeedSSBURI(subfeedKey) &&
      !SSBURI.isBendyButtV1FeedSSBURI(subfeedKey) &&
      !SSBURI.isGabbyGroveV1FeedSSBURI(subfeedKey)
    ) {
      return new Error(
        `invalid message: subfeed key "${subfeedKey}", expected a canonical uri format or classic ssb sigil`
      )
    } else {
      let { type, format, data } = SSBURI.decompose(subfeedKey)
      subfeedKey = '@' + data + '.ed25519'
    }
  }

  if (
    !ssbKeys.verify(
      { public: subfeedKey, curve: 'ed25519' },
      contentSignature,
      hmacKey,
      Buffer.concat([CONTENT_SIG_PREFIX, bencode.encode(contentBFE)])
    )
  )
    return new Error(
      `invalid message: contentSignature must correctly sign the content using the subfeed key; ${subfeedKey}`
    )
}

/**
 * Validate an HMAC key.
 *
 * @param {Buffer | string | null | undefined} hmacKey
 * @returns {Object | boolean} Either an Error containing a message or a `false` value for successful validation
 */
function validateHmacKey(hmacKey) {
  if (hmacKey === undefined || hmacKey === null) return false

  const bytes = Buffer.isBuffer(hmacKey)
    ? hmacKey
    : Buffer.from(hmacKey, 'base64')

  if (typeof hmacKey === 'string') {
    if (bytes.toString('base64') !== hmacKey)
      return new Error(
        `invalid hmac key: "${hmacKey}", expected string to be base64 encoded`
      )
  }

  if (bytes.length !== 32)
    return new Error(
      `invalid hmac key: "${hmacKey}" with length ${hmacKey.length}, expected 32 bytes`
    )
}
