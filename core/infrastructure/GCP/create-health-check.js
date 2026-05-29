import infrastructureRequest from './infrastructure-request.js'

export default async function createHealthCheck(platform, name, { project, region, port }) {
  console.log("Creating health check...")
  const response = await infrastructureRequest(
    "GCP",
    "POST",
    `https://compute.googleapis.com/compute/v1/projects/${project}/regions/${region}/healthChecks`,
    {
      name,
      type: "TCP",
      tcpHealthCheck: { port },
      checkIntervalSec: 10,
      timeoutSec: 5,
      healthyThreshold: 2,
      unhealthyThreshold: 3
    }
  )

  if (!response.ok) {
    const info = await response.json()
    if (info.error?.errors?.[0]?.reason === 'alreadyExists') {
      console.log(`Health check ${name} already exists`)
    }
    else throw new Error(`Failed to create health check: ${JSON.stringify(info, null, 4)}`)
  }

  console.log("Health check created.")
}
