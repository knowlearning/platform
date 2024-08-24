//  TODO: implement
export default async function() {
  return {
    auth: { user: `deno-user${Math.random().toString().slice(2)}` },
    domain: 'core'
  }
}