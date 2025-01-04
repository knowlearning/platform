import getAccessToken from './get-access-token.js'

const project = 'opensourcelearningplatform'

export default async function infrastructureRequest(provider, method, url, data) {
  if (provider === 'GCP') {
    let body = undefined
    const headers = {
      "Authorization": `Bearer ${await getAccessToken(provider)}`,
      "x-goog-user-project": project
    }

    if (method === 'GET') {
      url += '?' + new URLSearchParams(data).toString()
    }
    else if (method === 'POST') {
      body = JSON.stringify(data)
      headers["Content-Type"] = "application/json"
    }

    return await fetch(url, { method, headers, body })
  }
  else throw new Error(`Unknown provider: ${provider}`)
}
