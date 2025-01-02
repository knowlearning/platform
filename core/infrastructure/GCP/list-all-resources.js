import infrastructureRequest from './infrastructure-request.js'

//  TODO: ensure the cloudasset api is enabled
//  TODO: script to ensure calling user has "cloudasset.assets.searchAllResources" permission
export default async function listAllResources(provider, { project }) {
  const url = `https://cloudasset.googleapis.com/v1/projects/${project}:searchAllResources`

  let allResources = []
  let nextPageToken

  do {
    const params = {
      //assetTypes: [],
      pageSize: 1000
    }

    if (nextPageToken) params.pageToken = nextPageToken

    try {
      const response = await infrastructureRequest('GCP', 'GET', url, params)
console.log(response)
      const data = await response.text()
      console.log(data)
      allResources = allResources.concat(data.results || [])
      nextPageToken = data.nextPageToken
    } catch (error) {
      console.error("Error fetching resources:", error.message)
      break
    }
  } while (nextPageToken)

  return allResources
}
