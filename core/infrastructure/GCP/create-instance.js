import infrastructureRequest from './infrastructure-request.js'

export default async function createInstance(provider, name, { project, zone, machine, image, ipAddress }) {
  console.log("Creating VM instance...")
  const url = `https://compute.googleapis.com/compute/v1/projects/${project}/zones/${zone}/instances`
  const body = {
    name,
    machineType: `zones/${zone}/machineTypes/${machine}`,
    disks: [
      {
        boot: true,
        autoDelete: true,
        initializeParams: { sourceImage: image }
      }
    ],
    networkInterfaces: [
      {
        network: "global/networks/default",
        accessConfigs: [{ type: "ONE_TO_ONE_NAT", name: "External NAT", natIP: ipAddress }],
      }
    ]
  }

  const response = await infrastructureRequest('GCP', url ,body)

  if (!response.ok) throw new Error(`Failed to create instance: ${await response.text()}`)

  console.log(`Instance ${name} created successfully`)
}
