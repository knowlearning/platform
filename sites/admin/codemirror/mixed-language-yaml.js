import { LanguageSupport, Language } from "@codemirror/language"
import { yamlLanguage } from "@codemirror/lang-yaml"
import YAML from "yaml"
import { parseMixed } from "@lezer/common"
import { parser as jsParser } from "@lezer/javascript"
import { Linter as esLintLinter } from "eslint-linter-browserify"
import { javascript, javascriptLanguage, esLint } from "@codemirror/lang-javascript"
import { markdown } from "@codemirror/lang-markdown"
import { sql, PostgreSQL, schemaCompletionSource } from "@codemirror/lang-sql"
//  TODO: put in schema completion facilities for given config
//        https://codemirror.net/try/?c=aW1wb3J0IHtiYXNpY1NldHVwLCBFZGl0b3JWaWV3fSBmcm9tICJjb2RlbWlycm9yIgppbXBvcnQge1N0YXRlRWZmZWN0fSBmcm9tICdAY29kZW1pcnJvci9zdGF0ZSc7CmltcG9ydCB7c3FsLCBQb3N0Z3JlU1FMLCBzY2hlbWFDb21wbGV0aW9uU291cmNlfSBmcm9tICJAY29kZW1pcnJvci9sYW5nLXNxbCIKCmxldCBlZGl0b3IgPSBuZXcgRWRpdG9yVmlldyh7CiAgZG9jOiAiU0VMRUNUICogRlJPTSAiLAogIGV4dGVuc2lvbnM6IFsKICAgIGJhc2ljU2V0dXAsIAogICAgc3FsKHsKICAgICAgZGlhbGVjdDogUG9zdGdyZVNRTAogICAgfSkKICBdLAogIHBhcmVudDogZG9jdW1lbnQuYm9keQp9KQoKbGV0IG15U2NoZW1hID0geyAnYWJjLnBlcnNvbic6IFsgJ2lkJywgJ25hbWUnIF0sICdhYmMuYW5pbWFsJzogWyAnaWQnLCAnbmFtZScgXSB9OwplZGl0b3IuZGlzcGF0Y2goewogIGVmZmVjdHM6IFN0YXRlRWZmZWN0LmFwcGVuZENvbmZpZy5vZigKICAgIFBvc3RncmVTUUwubGFuZ3VhZ2UuZGF0YS5vZih7CiAgICAgIGF1dG9jb21wbGV0ZTogc2NoZW1hQ29tcGxldGlvblNvdXJjZSh7c2NoZW1hOiBteVNjaGVtYX0pCiAgICB9KQogICkKfSk7

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

export default function ({ resolveLanguage }) {
  const js = javascript() // Full JavaScript language support
  const md = markdown()
  const psql = sql({ dialect: PostgreSQL })

  const langToParser = {
    'markdown': { parser: md.language.parser },
    'javascript': { parser: js.language.parser },
    'postgresql': { parser: psql.language.parser }
  }

  const lang = yamlLanguage.configure({
    wrap: parseMixed((treeCursor, docInput) => {
      if (
        treeCursor.name == "BlockLiteralContent"
        || (treeCursor.name == "Literal" && !treeCursor.matchContext(['Key']))
      ) {
        const path = getJSONPath(treeCursor.node, docInput)
        return langToParser[resolveLanguage(path)] || null
      }

      return null
    })
  })

  return {
    lang: new LanguageSupport(
      lang,
      [
        js.extension,
        md.extension,
        psql.extension
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

  console.log('yaml regions', yamlLanguage.findRegions(view.state))
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
