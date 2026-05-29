export function createApp(component, props={}) {
  let mounted

  return {
    mount(target) {
      if (typeof component?.mount !== 'function') {
        throw new Error('Embedded Vue shim expected a component with a mount(target, props) method')
      }

      mounted = component.mount(target, props)
      return mounted
    },
    unmount() {
      mounted?.unmount?.()
    }
  }
}
