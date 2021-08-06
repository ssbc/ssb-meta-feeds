const bfe = require('ssb-bfe')

exports.validateSingle = function (contentSection) {
  if (contentSection === null || contentSection === undefined)
    return new Error(
      `invalid message: contentSection cannot be null or undefined`
    )

  // check if content is (maybe) encrypted
  if (typeof contentSection === 'string')
    return 'cannot validate encrypted contentSection'

  if (!(Array.isArray(contentSection) && contentSection.length === 2))
    return new Error(
      `invalid message: contentSection ${typeof contentSection} with length ${
        contentSection.length
      } is incorrect, expected a list of content and contentSignature`
    )

  const [content, contentSignature] = contentSection

  if (
    !(
      content.type === 'metafeed/add' ||
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

  if (content.type === 'metafeed/add') {
    if (content.nonce !== 32)
      return new Error(
        `invalid message: content nonce is ${nonceBB.length} bytes, expected 32`
      )
  }

  return true
}
