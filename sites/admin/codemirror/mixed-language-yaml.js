import { LanguageSupport } from "@codemirror/language"
import { yamlLanguage } from '@codemirror/lang-yaml'
import { javascript } from '@codemirror/lang-javascript'
import { parseMixed } from "@lezer/common"
import { parser as jsParser } from "@lezer/javascript"

function getJSONPath(syntaxNode, docInput) {
  let parent = syntaxNode.parent
  const path = []
  while (parent) {
    if (parent.name === 'Pair') {
      const { from, to } = parent.firstChild
      path.unshift(docInput.read(from, to))
    }
    parent = parent.parent
  }
  return path
}

export default function () {
   const js = javascript() // Full JavaScript language support

  const lang = yamlLanguage.configure({
    wrap: parseMixed((treeCursor, docInput) => {
      if (
        treeCursor.name == "BlockLiteralContent"
        || (treeCursor.name == "Literal" && !treeCursor.matchContext(['Key']))
      ) {
        getJSONPath(treeCursor.node, docInput)
        return { parser: js.language.parser }
      }

      return null
    })
  })

  return new LanguageSupport(lang, [
    js.extension
  ])
}