import { state, watch } from './synchronization.js'

export async function claim(domain) {
  const claim = await state('claims')
  claim[domain] = {}
  return new Promise(resolve => {
    watch(domain, ({ state }) => {
      const challenges = state[domain]?.challenges
      console.log('CHALLENGES!!!!!!!', challenges)
      if (challenges) resolve(challenges)
    })
  })
}

export async function configure() {
  
}