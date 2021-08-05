const bb = require('ssb-bendy-butt')
const bfe = require('ssb-bfe')

exports.validateSingle = function (contentSection) {
  if (!Array.isArray(contentSection) || contentSection.length !== 2)
    return new Error(
      `invalid message: contentSection ${typeof contentSection} with length ${
        contentSection.length
      } is incorrect, expected a list of content and contentSignature`
    )

  const [content, contentSignature] = contentSection

  if (!Array.isArray(content) || content.length < 3 || content.length > 4)
    return new Error(
      `invalid message: content ${typeof contentSection} with length ${
        content.length
      } is incorrect, expected a list of type, subfeed, metafeed and an optional nonce`
    )

  // TODO: might need to check if content is encrypted?

  if (
    !(
      content.type === 'metafeed/add' ||
      content.type === 'metafeed/update' ||
      content.type === 'metafeed/seed' ||
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

  // bencoded nonce should be 35 bytes: 2 bytes for length, 1 for ':' and 32 for data
  if (content.type === 'metafeed/add') {
    const nonceBB = bb.encode(content.nonce)
    if (nonceBB.length !== 35)
      return new Error(
        `invalid message: content nonce is ${nonceBB.length} bytes when bencoded, expected 35`
      )
  }
}
