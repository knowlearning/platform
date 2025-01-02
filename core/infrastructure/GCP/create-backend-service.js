import infrastructureRequest from './infrastructure-request.js'

export default async function createBackendService(provider, name, { project, region, zone, group, healthCheck }) {
    console.log("Creating backend service...");
  const backendServiceResponse = await infrastructureRequest(
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

  if (!backendServiceResponse.ok) {
    const errorText = await backendServiceResponse.text()
    throw new Error(`Failed to create backend service: ${errorText}`)
  }

  console.log("Backend service created.")
}
