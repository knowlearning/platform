let token

async function getGCPAccessToken() {
  if (token) return token

  let resolve, reject
  token = new Promise((res, rej) => {
  	resolve = res
  	reject = rej
  })

  const cmd = Deno.run({
    cmd: ["gcloud", "auth", "application-default", "print-access-token"],
    stdout: "piped",
    stderr: "piped"
  })

  const output = await cmd.output()
  const error = await cmd.stderrOutput()

  cmd.close()

  if (error.length > 0) reject(`Error fetching access token: ${new TextDecoder().decode(error)}`)
  else resolve(new TextDecoder().decode(output).trim())

  return token
}

export default async function infrastructureRequest(provider, url, body) {
  if (provider === 'GCP') {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${await getGCPAccessToken()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    })
  }
}