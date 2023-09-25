export default async function handleSave(wid, metadata, { resolve, reject }) {
    if (this.saving) return

    this.saving = true
    //  TODO: this is just handling a save from a window opened in
    //        the edit context. in future we can support
    //        saving from a window in run context (e.x. save a snapshot that is sharable)
    //        and save edit of metadata. (that is similar to this "edit mode" save.)
    const root = this.windows[wid].root
    //  collect all windows that are open and have the same root
    const patches = (
      Object
        .values(this.windows)
        .filter(w => w.root === root && w.root !== w.id) // TODO: FOR NOW IGNORE THE ROOT ONE BUT WE NEED A WAY TO DIFFERENTIATE CONTENT IN EDIT MODE...
        .map(({ scope }) => scope) //  TODO: need a way to tell if it is an "edit" scope in the context of this save...
    )
    Core
      .send({
        type: 'patch',
        root,
        timestamp: Date.now(),
        patches,
        metadata: {}
        //metadata: metadata ? { [this.windows[wid].id]: copy(metadata) } : {}
        //  TODO: do metadata changes from explore content
      })
      .then(({ swaps }) => {
        Object
          .values(this.windows)
          .filter(w => w.root === root)
          .forEach(w => {
            w.root = swaps[root]
            if (swaps[w.id]) w.id = swaps[w.id]
          })
        this.saving = false
      })
      .catch(error => {
        this.saving = false
        if (reject) reject(error.error)
        console.log('error saving content', error)
      })
  }