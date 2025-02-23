import { EditorState, StateEffect, Transaction, Annotation } from "@codemirror/state"
import { EditorView } from "@codemirror/view"

const insertNewlineEffect = StateEffect.define()
const newlineMetaKey = "insertedNewline"
const InsertedNewline = Annotation.define();

const plugin = EditorView.updateListener.of(update => {
  if (!update.docChanged) return

  const { state, transactions } = update
  for (let tr of transactions) {
    if (!tr.docChanged) continue

    const charsAdded = totalCharactersAdded(tr)

    if (charsAdded < 1) continue

    if (tr.annotation(InsertedNewline)) continue

    let needsNewline = false
    let insertPos = null

    const atomicProviders = state.facet(EditorView.atomicRanges)
    for (const provider of atomicProviders) {
      if (typeof provider === "function") {
        const ranges = provider(update.view)
        ranges.between(0, state.doc.length, (from, to) => {
          const widgetEnd = to
          const cursorPos = tr.newSelection.main.head

          if (cursorPos === widgetEnd) {
            needsNewline = true
            insertPos = widgetEnd
            return false
          }
        });

        if (needsNewline) break
      }
    }

    if (needsNewline && insertPos !== null) {
      update.view.dispatch({
        changes: [{ from: insertPos-1, insert: "\n" }],
        annotations: InsertedNewline.of(true)
      });
    }
  }
});

const applyNewlinePlugin = EditorState.transactionFilter.of(tr => {
  for (let effect of tr.effects) {
    if (effect.is(insertNewlineEffect)) {
      return [
        tr,
        tr.state.update({
          changes: { from: effect.value, insert: "\n" },
          meta: { [newlineMetaKey]: true }
        })
      ]
    }
  }
  return tr
})

function totalCharactersAdded(transaction) {
  let total = 0
  transaction.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    if (inserted.length > 0) total += inserted.length
    else if (fromA !== toA) total -= toA - fromA
  })
  return total
}

export default [
  plugin,
  applyNewlinePlugin
]
