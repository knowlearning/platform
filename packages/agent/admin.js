import { state, watch } from './synchronization.js'

export async function claim(domain) {
  const claim = await state('claims')
  claim[domain] = {}
  console.log('SET CLAIM....')
  return new Promise(resolve => {
    watch('claims', ({ state, patch, history }) => {
      const challenges = state[domain]?.challenges
      console.log('CHALLENGES!!!!!!!', challenges, patch, history)
      if (challenges) resolve(challenges)
    })
  })
}

export async function configure() {
  
}