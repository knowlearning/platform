import infrastructureRequest from './infrastructure-request.js'

export default async function createFirewallRule(
  provider,
  name,
  {
    project,
    targetTag,
    IPProtocol = "tcp",
    ports = ["80", "443"],
    sourceRanges = ["0.0.0.0/0"],
    priority = 1000,
    direction = "INGRESS"
  }
) {
  console.log("Creating firewall rule...")

  const response = await infrastructureRequest(
    provider,
    'POST',
    `https://compute.googleapis.com/compute/v1/projects/${project}/global/firewalls`,
    {
      name,
      direction,
      priority,
      allowed: [{ IPProtocol, ports }],
      targetTags: [targetTag],
      sourceRanges
    }
  )

  if (!response.ok) {
    const info = await response.json()
    if (info.error?.errors?.[0]?.reason === 'alreadyExists') {
      console.log(`Firewall rule ${name} already exists`)
    }
    else throw new Error(`Failed to create firewall rule: ${await response.text()}`)
  }
  else console.log(`Firewall rule ${name} created successfully`)
}
