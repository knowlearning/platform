const charToEnc = { '%'  : '%25', '\u0000': '%00'   , '*'  : '%2A', '>'  : '%3E', '.'  : '%2E' }
const encToChar = { '%25':   '%', '%00'   : '\u0000', '%2A': '*'  , '%3E': '>'  , '%2E': '.'   }

export function encodeNATSToken(str) {
  return str.split('').map(c => charToEnc[c] || c).join('')
}

export function decodeNATSToken(str) {
  return str.split('').map(c => encToChar[c] || c).join('')
}
