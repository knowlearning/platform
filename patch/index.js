import fs from 'fs'
import NodeAgent from '../lib/agents/node.js'
import build from './build.js'
import patchContent from './patch-content.js'

process.on('warning', e => console.warn(e.stack))

global.Agent = NodeAgent()

Agent.debug()


console.log('STARTING PATCH SERVER')

//  TODO: save things of type result instead of writing into this
const results = await Agent.state('results')

//  TODO: consider approach for not using well know scopes
Agent
  .state('patch-requests', 'core')
  .watch(async ({ patch }) => {
    console.log('GOT PATCH REQUEST....', patch)
    if (patch[0].op === 'add') {
      const reqId = patch[0].path[0]
      const { root, scopes, reducer } = patch[0].value

      try {
        if (reducer === 'build') {
          const { type, output } = await build(root)
          const data = await fs.promises.readFile(output)
          const newRoot = await Agent.upload('build', type, data)
          results[reqId] = { swaps: { [root]: newRoot } }
        }
        else {
          console.log(patch[0].value)
          results[reqId] = { swaps: await patchContent(patch[0].value) }
        }
      }
      catch (error) {
        console.warn('ERROR PATCHING CONTENT', error.toString())
        results[reqId] = { error: error.toString() }
      }
    }
  })
