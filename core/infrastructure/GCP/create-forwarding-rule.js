import infrastructureRequest from './infrastructure-request.js'

export default async function createForwardingRule(provider, name, { project, region, service, staticIpName, port }) {
  console.log("Creating forwarding rule...")
  const response = await infrastructureRequest(
    "GCP",
    "POST",
    `https://compute.googleapis.com/compute/v1/projects/${project}/regions/${region}/forwardingRules`,
    {
      name,
      loadBalancingScheme: "EXTERNAL",
      backendService: `projects/${project}/regions/${region}/backendServices/${service}`,
      IPProtocol: "TCP",
      portRange: `${port}`,
      IPAddress: `projects/${project}/regions/${region}/addresses/${staticIpName}`
    }
  );

  if (!response.ok) {
    const info = await response.json()
    if (info.error?.errors?.[0]?.reason === 'alreadyExists') {
      console.log(`Forwarding rule ${name} already exists`)
    }
    else throw new Error(`Failed to forwarding rule: ${JSON.stringify(info, null, 4)}`)
  }
}