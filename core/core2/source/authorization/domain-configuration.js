import Agent from './agent/deno/deno.js'

const cache = {}

//  TODO: expire cache to save space
export default async function domainConfiguration(domain) {
  if (!cache[domain]) cache[domain] = new Promise(async resolve => {
    Agent
      .watch(domain, ({ state: { configuration={} } }) => {
        resolve(configuration)
        cache[domain] = configuration
      }, 'core', 'core')
  })
  return cache[domain]
}
