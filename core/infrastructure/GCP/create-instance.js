import infrastructureRequest from './infrastructure-request.js'

async function getInstanceStatus(provider, name, { project, zone }) {
  const url = `https://compute.googleapis.com/compute/v1/projects/${project}/zones/${zone}/instances/${name}`

  const response = await infrastructureRequest('GCP', 'GET', url)

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Failed to fetch instance status: ${response.status} ${response.statusText}\n${errorBody}`)
  }

  const data = await response.json()
  return data.status
}

async function waitForInstanceRunning(provider, name, { project, zone }) {
  console.log(`Waiting for instance "${name}" to be RUNNING...`)

  while (true) {
    try {
      const status = await getInstanceStatus(provider, name, { project, zone })

      if (status === "RUNNING") {
        console.log(`Instance "${name}" is RUNNING!`)
        break
      } else {
        console.log(`Current status: ${status}. Waiting...`)
      }
    } catch (error) {
      console.error(`Error checking instance status: ${error}`)
    }

    await new Promise (r => setTimeout(r, 1000))
  }
}



export default async function createInstance(provider, name, { project, zone, machine, image, tags, script }) {
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
    tags: { items: tags },
    metadata: {
      items: [
        { key: "startup-script", value: script }
      ]
    }
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

  await waitForInstanceRunning(provider, name, { project, zone })
}
