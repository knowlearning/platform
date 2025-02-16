import jsyaml from 'js-yaml'
import { lintGutter } from "@codemirror/lint"

export default view => {
    try {
        jsyaml.load(view.state.doc)
        return []
    }
    catch (error) {
        const { mark, reason } = error
        let from = mark ? Math.min(mark.position, view.state.doc.length-1) : 0
        return [{ from, to: from, message: reason, severity: "error" }]
    }
}
