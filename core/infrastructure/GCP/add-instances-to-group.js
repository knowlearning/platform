import infrastructureRequest from './infrastructure-request.js'

export default async function addInstancesToGroup(provider, { project, zone, instances, group }) {
  console.log(`Adding instances to group ${instances} -> ${group}`)
  await infrastructureRequest(
    provider,
    `https://compute.googleapis.com/compute/v1/projects/${project}/zones/${zone}/instanceGroups/${group}/addInstances`,
    {
      instances: instances.map(instance => ({
        instance: `projects/${project}/zones/${zone}/instances/${instance}`
      }))
    }
  )
}