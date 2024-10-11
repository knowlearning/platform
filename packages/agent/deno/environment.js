//  TODO: implement
export default async function() {
  const user = globalThis.CORE_HACK ? 'core' : `deno-user${Math.random().toString().slice(2)}`
  return {
    auth: { user },
    domain: 'core'
  }
}