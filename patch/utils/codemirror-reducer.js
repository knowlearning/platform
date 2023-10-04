import { ChangeSet, Text } from "@codemirror/state"

const applyChange = (doc, change) => ChangeSet.fromJSON(change).apply(doc)

//  TODO handle errors
export default async function (text, changes) {
  return (
    changes
      .reduce(applyChange, Text.of(text.split('\n')))
      .toString()
  )
}