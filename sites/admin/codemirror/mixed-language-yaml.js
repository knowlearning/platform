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
import { EditorState, StateField } from "@codemirror/state"
import { createApp } from "vue"
import { defaultKeymap } from "@codemirror/commands"
import applyNewLineAfterWidgetExtension from "./apply-newline-after-widget-extension.js"




import YAMLValueReplacer from '../yaml-value-replacer.vue'






//  TODO: put in schema completion facilities for given config
//        https://codemirror.net/try/?c=aW1wb3J0IHtiYXNpY1NldHVwLCBFZGl0b3JWaWV3fSBmcm9tICJjb2RlbWlycm9yIgppbXBvcnQge1N0YXRlRWZmZWN0fSBmcm9tICdAY29kZW1pcnJvci9zdGF0ZSc7CmltcG9ydCB7c3FsLCBQb3N0Z3JlU1FMLCBzY2hlbWFDb21wbGV0aW9uU291cmNlfSBmcm9tICJAY29kZW1pcnJvci9sYW5nLXNxbCIKCmxldCBlZGl0b3IgPSBuZXcgRWRpdG9yVmlldyh7CiAgZG9jOiAiU0VMRUNUICogRlJPTSAiLAogIGV4dGVuc2lvbnM6IFsKICAgIGJhc2ljU2V0dXAsIAogICAgc3FsKHsKICAgICAgZGlhbGVjdDogUG9zdGdyZVNRTAogICAgfSkKICBdLAogIHBhcmVudDogZG9jdW1lbnQuYm9keQp9KQoKbGV0IG15U2NoZW1hID0geyAnYWJjLnBlcnNvbic6IFsgJ2lkJywgJ25hbWUnIF0sICdhYmMuYW5pbWFsJzogWyAnaWQnLCAnbmFtZScgXSB9OwplZGl0b3IuZGlzcGF0Y2goewogIGVmZmVjdHM6IFN0YXRlRWZmZWN0LmFwcGVuZENvbmZpZy5vZigKICAgIFBvc3RncmVTUUwubGFuZ3VhZ2UuZGF0YS5vZih7CiAgICAgIGF1dG9jb21wbGV0ZTogc2NoZW1hQ29tcGxldGlvblNvdXJjZSh7c2NoZW1hOiBteVNjaGVtYX0pCiAgICB9KQogICkKfSk7

const LanguageProp = new NodeProp()

function getJSONPath(node, slice) {
  let parent = node.parent
  const path = []
  while (parent) {
    if (parent.name === 'Pair') {
      const { from, to } = parent.firstChild
      path.unshift(slice(from, to))
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
      if (isLiteralValue(cursor)) {
        const path = getJSONPath(cursor.node, (from, to) => input.read(from, to))
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
    vueWidgetStateField(resolveWidget),
    applyNewLineAfterWidgetExtension
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
  if (!(await stop(node, depth))) {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      await dfs(child, stop, depth + 1)
    }
  }
}


function dfsSync(node, stop=()=>false, depth=0) {
  if (!stop(node, depth)) {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      dfsSync(child, stop, depth + 1)
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

function isLiteralValue(cursor) {
  return (
    cursor.name === "BlockLiteralContent"
    || (cursor.name === "Literal" && !cursor.matchContext(['Key']))
  )
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
    return (
      this.component === other.component
      && this.props.key === other.props.key
    )
  }
}

function vueWidgetStateField(resolveWidget) {
  return StateField.define({
    create(state) {
      return computeDecorations(state, resolveWidget)
    },
    update(value, tr) {
      if (tr.docChanged || tr.viewportChanged) {
        return computeDecorations(tr.state, resolveWidget)
      }
      return value
    },
    provide: field => {
      console.log('FIELD', field)
      const decorations = EditorView.decorations.from(field)
      console.log('Decorations', decorations)
      return [
        decorations,
        EditorView.atomicRanges.of(view => view.state.field(field))
      ]
    }
  });
}

function computeDecorations(state, resolveWidget) {
  const widgets = []

  dfsSync(state.tree.topNode, (node, depth) => {
    //console.log(`${" ".repeat(depth * 4)}${node.name}`)

    if (node.name === "Key" || node.name === ":" || node.name === '-') return true

    if (
      (
        node.parent?.name === "Pair"
        || node.parent?.name === "BlockSequence"
      ) &&
      node.name !== "BlockMapping" &&
      node.name !== "BlockSequence"
    ) {
      const path = getJSONPath(node, (from, to) => state.doc.sliceString(from, to))
      const widget = resolveWidget(path)
      if (!widget) return true

      const { component, props } = widget
      widgets.push(
        Decoration.replace({
          widget: new VueWidget({ component, props }),
          block: false, // This allows multi-line decorations
          inclusive: true
        }).range(node.from, node.to)
      )

      return true
    }

    return false
  })

  return Decoration.set(widgets, true)
}