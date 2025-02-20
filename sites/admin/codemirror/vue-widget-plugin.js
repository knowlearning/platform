import { Decoration, WidgetType, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { createApp, defineComponent, h } from "vue";

class VueWidget extends WidgetType {
  constructor(component, props) {
    super();
    this.component = component;
    this.props = props;
    this.container = document.createElement("span");
  }

  toDOM() {
    // Create and mount the Vue component
    const app = createApp(this.component, this.props);
    app.mount(this.container);
    return this.container;
  }

  eq(other) {
    return other.component === this.component && JSON.stringify(other.props) === JSON.stringify(this.props);
  }
}

export default function VueWidgetPlugin(mapping) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = this.getDecorations(view.state);
      }

      update(update) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.getDecorations(update.state);
        }
      }

      getDecorations(state) {
        let widgets = [];
        let text = state.doc.toString();

        Object.entries(mapping).forEach(([word, component]) => {
          let pos = 0;
          while ((pos = text.indexOf(word, pos)) !== -1) {
            widgets.push(
              Decoration.replace({
                widget: new VueWidget(component, { text: word }),
              }).range(pos, pos + word.length)
            );
            pos += word.length;
          }
        });

        return Decoration.set(widgets, true);
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}
