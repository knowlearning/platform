import infrastructureRequest from './infrastructure-request.js'

export default async function reserveStaticIp(provider, name, { project, region }) {
  console.log("Reserving static IP...")

  const ipResponse = await infrastructureRequest(
    "GCP",
    "POST",
    `https://compute.googleapis.com/compute/v1/projects/${project}/regions/${region}/addresses`,
    {
      name,
      addressType: "EXTERNAL"
    }
  )

  if (!ipResponse.ok) {
    const errorText = await ipResponse.text();
    throw new Error(`Failed to reserve static IP: ${errorText}`);
  }
  console.log("Static IP reserved.")

  // TODO: make wait more reliable...
  console.log("Waiting for static IP allocation...")
  await new Promise((resolve) => setTimeout(resolve, 5000))

  // Get the allocated IP address
  const ipDetailsResponse = await infrastructureRequest(
    "GCP",
    "GET",
    `https://compute.googleapis.com/compute/v1/projects/${project}/regions/${region}/addresses/${name}`
  )

  if (!ipDetailsResponse.ok) {
    const errorText = await ipDetailsResponse.text();
    throw new Error(`Failed to fetch static IP details: ${errorText}`);
  }

  const ipDetails = await ipDetailsResponse.json()
  const staticIpAddress = ipDetails.address
  console.log(`Static IP address allocated: ${staticIpAddress}`)
}