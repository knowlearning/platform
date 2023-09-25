console.log('watching scope')

const pre = document.createElement('pre')

window.document.body.innerHTML = ''
window.document.body.appendChild(pre)

const state = await (
  Agent
    .state()
    .watch(update => {
      console.log('GOT UPDATE!!!!! we only want one for each ii...', update.ii)
      //  TODO: find out why too many updates are getting fired for each ii
      pre.innerHTML = ''
      pre.appendChild(window.document.createTextNode(JSON.stringify(update.state, null, 4)))
    })
)

pre.appendChild(window.document.createTextNode(JSON.stringify(state, null, 4)))