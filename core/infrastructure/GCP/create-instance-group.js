import infrastructureRequest from './infrastructure-request.js'

export default async function createInstanceGroup(provider, name, { project, zone }) {
  console.log(`Creating instance group ${name}`)
  const response = await infrastructureRequest(
    provider,
    'POST',
    `https://compute.googleapis.com/compute/v1/projects/${project}/zones/${zone}/instanceGroups`,
    { name }
  )

  if (!response.ok) {
    const info = await response.json()
    if (info.error?.errors?.[0]?.reason === 'alreadyExists') {
      console.log(`Instance ${name} already exists`)
    }
    else throw new Error(`Error creating instance group: ${await response.text()}`)
  }
  console.log(`Created instance group ${name}`)
}
