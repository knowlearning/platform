import diff from 'fast-diff'

// Convert fast-diff output → array of CodeMirror { from, to, insert } changes.
// fast-diff tuples: [DIFF_DELETE=-1, text], [DIFF_INSERT=1, text], [DIFF_EQUAL=0, text].
// DELETE always precedes INSERT when adjacent (a substitution).
export default function codemirrorChanges(oldText, newText) {
  const result = diff(oldText, newText)
  const changes = []
  let pos = 0

  for (let i = 0; i < result.length; i++) {
    const [op, text] = result[i]

    if (op === diff.EQUAL) {
      pos += text.length
    } else if (op === diff.DELETE) {
      const deleteLen = text.length
      // Peek ahead: DELETE + INSERT = substitution → single change
      if (i + 1 < result.length && result[i + 1][0] === diff.INSERT) {
        changes.push({ from: pos, to: pos + deleteLen, insert: result[i + 1][1] })
        pos += deleteLen
        i++ // skip the paired INSERT
      } else {
        changes.push({ from: pos, to: pos + deleteLen, insert: '' })
        pos += deleteLen
      }
    } else { // INSERT
      changes.push({ from: pos, to: pos, insert: text })
    }
  }

  return changes
}