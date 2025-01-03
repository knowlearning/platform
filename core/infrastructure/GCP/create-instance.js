import infrastructureRequest from './infrastructure-request.js'

export default async function createInstance(provider, name, { project, zone, machine, image, script, tags }) {
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
        accessConfigs: [
          {
            name: "External NAT",
            type: "ONE_TO_ONE_NAT"
          }
        ]
      }
    ],
    metadata: {
      items: [
        {
          key: "startup-script",
          value: script
        },
      ],
    },
    tags: { items: tags }
  }

  const response = await infrastructureRequest('GCP', 'POST', url ,body)

  if (!response.ok) {
    const info = await response.json()
    if (info.error?.errors?.[0]?.reason === 'alreadyExists') {
      console.log(`Instance ${name} already exists`)
    }
    else throw new Error(`Failed to create instance: ${await response.text()}`)
  }
  else console.log(`Instance ${name} created successfully`)
}
