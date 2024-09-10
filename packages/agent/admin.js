import { updateSession } from "./session.js"

export function claim(domain) {
  return updateSession('claims', { domain })
}
