const MIME_TYPE = /^[ \t]*[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+(?:[ \t]*;[ \t]*[!#$%&'*+.^_`|~0-9A-Za-z-]+=(?:[!#$%&'*+.^_`|~0-9A-Za-z-]+|"(?:[\t\x20\x21\x23-\x5b\x5d-\x7e\x80-\xff]|\\[\t\x20-\x7e\x80-\xff])*"))*[ \t]*$/

export default function normalizeUploadType(type) {
  if (typeof type === 'string' && /[\r\n]/.test(type)) throw new TypeError('Invalid upload MIME type')
  if (type == null || typeof type === 'string' && !type.trim()) return 'application/octet-stream'
  if (typeof type !== 'string' || !MIME_TYPE.test(type)) throw new TypeError('Invalid upload MIME type')
  return type
}
