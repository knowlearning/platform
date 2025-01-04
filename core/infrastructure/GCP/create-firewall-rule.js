import infrastructureRequest from './infrastructure-request.js'

export default async function createFirewallRule(provider, name, { project, targetTag }) {
  console.log("Creating firewall rule...")

  const response = await infrastructureRequest(
    provider,
    'POST',
    `https://compute.googleapis.com/compute/v1/projects/${project}/global/firewalls`,
    {
      name,
      direction: "INGRESS",
      priority: 1000,
      allowed: [
        {
          IPProtocol: "tcp",
          ports: ["80", "443"],
        },
      ],
      targetTags: [targetTag],
      sourceRanges: ["0.0.0.0/0"]
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
