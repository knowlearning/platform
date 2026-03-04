import { computed } from 'vue'
import mixedLanguageYaml from "./mixed-language-yaml.js"
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { oneDark, oneDarkHighlightStyle } from '@codemirror/theme-one-dark'

export default function getExtensions({cm, isDark, resolveLanguage, resolveWidget, extra=[] }) {
  const mixedLangaugeYamlExtension = mixedLanguageYaml({
    resolveLanguage,
    resolveWidget: path => {
      const widget = resolveWidget(path)
      return widget ? {
        ...widget,
        codemirror: cm.value
      } : null
    }
  })
  return computed(() => {
    const e = [
      ...extra,
      mixedLangaugeYamlExtension,
      syntaxHighlighting(isDark.value ? oneDarkHighlightStyle : defaultHighlightStyle)
    ]
    if (isDark.value) e.push(oneDark)
    return e
  })
}
