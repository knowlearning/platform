import { state, watch } from './synchronization.js'

function getNewChallenges(patch, domain) {
  if (!patch) return

  return patch.find(update => (
    update.path.length === 2 &&
    update.path[0] === domain &&
    update.path[1] === 'challenges'
  ))?.value
}

export async function claim(domain) {
  const claim = await state('claims')
  claim[domain] = {}
  return new Promise(resolve => {
    watch(domain, ({ patch }) => {
      const challenges = getNewChallenges(patch)
      console.log('CHALLENGES!!!!!!!', challenges)
      if (challenges) resolve(challenges)
    })
  })
}

export async function configure() {
  
}