//  TODO: implement
export default async function() {
  const user = window.CORE_HACK ? 'core' : `deno-user${Math.random().toString().slice(2)}`
  return {
    auth: { user },
    domain: 'core'
  }
}