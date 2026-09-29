import browserAgent from '../../packages/agents/agents/browser/initialize.js'
import storage from '../../packages/agents/agents/browser/storage.js'

export default function createErrorAgent() {
  return browserAgent({
    root: true,
    unique: true,
    apiHost: storage.getItem('API_HOST') || 'socket-io.knowlearning.systems',
    getToken: async () => undefined
  })
}
