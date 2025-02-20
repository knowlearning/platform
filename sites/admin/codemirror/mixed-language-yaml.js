import { LanguageSupport, syntaxTree } from "@codemirror/language"
import { yamlLanguage } from "@codemirror/lang-yaml"
import YAML from "yaml"
import { parseMixed, NodeProp } from "@lezer/common"
import { parser as jsParser } from "@lezer/javascript"
import { Linter as esLintLinter } from "eslint-linter-browserify"
import { javascript, javascriptLanguage, esLint } from "@codemirror/lang-javascript"
import { markdown } from "@codemirror/lang-markdown"
import { sql, PostgreSQL, schemaCompletionSource } from "@codemirror/lang-sql"
import { linter } from "@codemirror/lint"
import PGQuery from "pg-query-emscripten"
import { Decoration, WidgetType, ViewPlugin, EditorView, keymap } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import { createApp } from "vue"
import { defaultKeymap } from "@codemirror/commands"






import YAMLValueReplacer from '../yaml-value-replacer.vue'






//  TODO: put in schema completion facilities for given config
//        https://codemirror.net/try/?c=aW1wb3J0IHtiYXNpY1NldHVwLCBFZGl0b3JWaWV3fSBmcm9tICJjb2RlbWlycm9yIgppbXBvcnQge1N0YXRlRWZmZWN0fSBmcm9tICdAY29kZW1pcnJvci9zdGF0ZSc7CmltcG9ydCB7c3FsLCBQb3N0Z3JlU1FMLCBzY2hlbWFDb21wbGV0aW9uU291cmNlfSBmcm9tICJAY29kZW1pcnJvci9sYW5nLXNxbCIKCmxldCBlZGl0b3IgPSBuZXcgRWRpdG9yVmlldyh7CiAgZG9jOiAiU0VMRUNUICogRlJPTSAiLAogIGV4dGVuc2lvbnM6IFsKICAgIGJhc2ljU2V0dXAsIAogICAgc3FsKHsKICAgICAgZGlhbGVjdDogUG9zdGdyZVNRTAogICAgfSkKICBdLAogIHBhcmVudDogZG9jdW1lbnQuYm9keQp9KQoKbGV0IG15U2NoZW1hID0geyAnYWJjLnBlcnNvbic6IFsgJ2lkJywgJ25hbWUnIF0sICdhYmMuYW5pbWFsJzogWyAnaWQnLCAnbmFtZScgXSB9OwplZGl0b3IuZGlzcGF0Y2goewogIGVmZmVjdHM6IFN0YXRlRWZmZWN0LmFwcGVuZENvbmZpZy5vZigKICAgIFBvc3RncmVTUUwubGFuZ3VhZ2UuZGF0YS5vZih7CiAgICAgIGF1dG9jb21wbGV0ZTogc2NoZW1hQ29tcGxldGlvblNvdXJjZSh7c2NoZW1hOiBteVNjaGVtYX0pCiAgICB9KQogICkKfSk7

const LanguageProp = new NodeProp()

function getJSONPath(node, input) {
  let parent = node.parent
  const path = []
  while (parent) {
    if (parent.name === 'Pair') {
      const { from, to } = parent.firstChild
      path.unshift(input.read(from, to))
    }
    parent = parent.parent
  }
  return path
}

export default function ({ resolveLanguage, resolveWidget }) {
  const js = javascript() // Full JavaScript language support
  const md = markdown()
  const postgresql = sql({ dialect: PostgreSQL })

  const langToParser = {
    'markdown': md.language.parser.configure({ props: [LanguageProp.add({ Document: "markdown" })] }),
    'javascript': js.language.parser.configure({ props: [LanguageProp.add({ Script: "javascript" })] }),
    'postgresql': postgresql.language.parser.configure({ props: [LanguageProp.add({ Script: "postgresql" })] })
  }

  const lang = yamlLanguage.configure({
    wrap: parseMixed((cursor, input) => {
      if (
        cursor.name == "BlockLiteralContent"
        || (cursor.name == "Literal" && !cursor.matchContext(['Key']))
      ) {
        const path = getJSONPath(cursor.node, input)
        const language = resolveLanguage(path)
        const parser = langToParser[language]
        const overlay = language === 'markdown' ? indentFreeOverlay(cursor.node, input) : undefined
        if (parser) return { parser, overlay }
      }

      return null
    })
  })

  return [
    keymap.of(defaultKeymap),
    new LanguageSupport(
      lang,
      [
        js.extension,
        md.extension,
        postgresql.extension
      ]
    ),
    linter(async view => {
      return [
        ...jsLinter(view),
        ...yamlLinter(view),
        ...(await postgresqlLinter(view))
      ]
    }),
    vueWidgetPlugin(resolveWidget)
  ]
}

const jsLinter = esLint(new esLintLinter(), {})
const pgParser = new PGQuery()

const postgresqlLinter = async view => {
  const tree = syntaxTree(view.state)
  const diagnostics = []

  const stop = async node => {
     const language = node.type.prop(LanguageProp)
     if (language === 'postgresql') {
       const code = view.state.doc.sliceString(node.from, node.to)
       const { error } = (await pgParser).parse(code)
       if (error) {
         const from = node.from + error.cursorpos - 1
         diagnostics.push({
            from,
            to: from,
            severity: "error",
            message: error.message
         })
       }
       return true
     }
  }

  await dfs(tree.topNode, stop)
  return diagnostics
}

const yamlLinter = view => {
  const diagnostics = []
  const code = view.state.doc.toString()

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

async function dfs(node, stop=()=>false, depth=0) {
  if (!(await stop(node))) {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      depth += 1
      await dfs(child, stop, depth)
    }
  }
}

function indentFreeOverlay(node, input) {
  const ranges = []
  const lines = input.read(node.from, node.to).split('\n')

  let offset = node.from
  //  find indent of first line with content
  const indent = lines.find(line => line.search(/\S/) > -1)?.search(/\S/) || 0

  lines
    .forEach(({ length: l }) => {
      const from = offset + Math.min(indent, l)
      offset = Math.min(node.to, offset + l + 1)
      if (offset > from) ranges.push({ from, to: offset })
    })

  return ranges
}

class VueWidget extends WidgetType {
  constructor({ props, component }) {
    super()
    this.props = props
    this.component = component
    this.container = document.createElement("span")
  }

  toDOM() {
    const app = createApp(this.component, this.props)
    app.mount(this.container)
    return this.container
  }

  eq(other) {
    return JSON.stringify(this.props) === JSON.stringify(other.props)
  }
}

function vueWidgetPlugin(resolveWidget) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = this.getDecorations(view.state)
      }

      update(update) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.getDecorations(update.state)
        }
      }

      getDecorations(state) {
        let widgets = []
        let text = state.doc.toString()

        const word = 'woo!'

        const index = text.indexOf(word)

        if (index > -1) {
          widgets.push(
            Decoration
              .replace({
                widget: new VueWidget({
                  component: YAMLValueReplacer,
                  props: {}
                }),
                block: false,
                inclusive: false
              })
              .range(index, index + word.length)
          )
        }

        return Decoration.set(widgets, true)
      }
    },
    {
      decorations: v => v.decorations,
      provide: plugin => EditorView.atomicRanges.of(
        view => view.plugin(plugin)?.decorations || Decoration.none
      )

    }
  )
}