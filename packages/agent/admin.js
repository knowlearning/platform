import { updateSession } from "./session.js"

export async function claim(domain) {
  const response = await updateSession('claims', { domain })
  console.log('RESPONSE!!!', response)
}
