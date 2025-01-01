const tokens = {}

export default async function getAccessToken(provider) {
  if (tokens[provider]) return tokens[provider]

  let resolve, reject

  tokens[provider] = new Promise((res, rej) => {
  	resolve = res
  	reject = rej
  })

  if (provider === 'GCP') {
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
  }
  else reject(`Unknown provider: ${provider}`)

  return tokens[provider]
}
