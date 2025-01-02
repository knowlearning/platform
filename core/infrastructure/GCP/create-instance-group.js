import infrastructureRequest from './infrastructure-request.js'


export default async function createInstanceGroup(provider, name, { project, zone }) {
  console.log(`Creating instance group ${name}`)
  await infrastructureRequest(
    provider,
    'POST',
    `https://compute.googleapis.com/compute/v1/projects/${project}/zones/${zone}/instanceGroups`,
    { name }
  )
}