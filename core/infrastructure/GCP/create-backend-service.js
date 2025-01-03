import infrastructureRequest from './infrastructure-request.js'

export default async function createBackendService(provider, name, { project, region, zone, group, healthCheck }) {
  console.log("Creating backend service...")
  const response = await infrastructureRequest(
    'GCP',
    'POST',
    `https://compute.googleapis.com/compute/v1/projects/${project}/regions/${region}/backendServices`,
    {
      name,
      protocol: "TCP",
      loadBalancingScheme: "EXTERNAL",
      healthChecks: [ `projects/${project}/regions/${region}/healthChecks/${healthCheck}` ],
      backends: [
        {
          group: `projects/${project}/zones/${zone}/instanceGroups/${group}`
        }
      ]
    }
  )

  if (!response.ok) {
    const info = await response.json()
    if (info.error?.errors?.[0]?.reason === 'alreadyExists') {
      console.log(`Backend service ${name} already exists`)
    }
    else throw new Error(`Failed to create backend service: ${JSON.stringify(info, null, 4)}`)
  }

  console.log("Backend service created.")
}
