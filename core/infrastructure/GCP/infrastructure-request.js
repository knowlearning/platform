import getAccessToken from './get-access-token.js'

export default async function infrastructureRequest(provider, url, body) {
  if (provider === 'GCP') {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${await getAccessToken(provider)}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    })
  }
}
