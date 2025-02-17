import { LanguageSupport, Language } from "@codemirror/language"
import { yamlLanguage } from "@codemirror/lang-yaml"
import YAML from "yaml"
import { parseMixed } from "@lezer/common"
import { parser as jsParser } from "@lezer/javascript"
import { Linter as esLintLinter } from "eslint-linter-browserify"
import { javascript, javascriptLanguage, esLint } from "@codemirror/lang-javascript"

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

  return {
    lang: new LanguageSupport(
      lang,
      [
        js.extension
      ]
    ),
    linter: view => [...jsLinter(view), ...yamlLinter(view)]
  }
}

const jsLinter = esLint(new esLintLinter(), {})

function combinedLinter(view) {
  return jsLinter(view)
}

const yamlLinter = (view) => {
  const diagnostics = []
  const code = view.state.doc.toString()

  console.log('Harumph???', yamlLanguage.findRegions(view.state))
  for (let {from, to} of yamlLanguage.findRegions(view.state))  {
    console.log('YAML reGioNS!!!!!', from, to)
  }
  

  try { YAML.parse(code) }
  catch (error) {
    try {
      const { message, pos: [from, to] } = error
      diagnostics.push({
        from,
        to,
        severity: "error",
        message
      })
    }
    catch (error) { console.warn('unexpected YAML parser error', error) }
  }

  return diagnostics
}
