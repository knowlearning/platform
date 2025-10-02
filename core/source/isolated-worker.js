export default function isolatedWorker(modulePath) {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", modulePath],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped"
  })

  const child = cmd.spawn()

  const writer = child.stdin.getWriter()
  const decoder = new TextDecoder()
  const reader = child.stdout.getReader()
  const errReader = child.stderr.getReader()

  let onmessage = null
  let onerror = null

  // Continuously read stdout lines as messages
  ;(async () => {
    let buf = ""
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let idx
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx).trim()
          buf = buf.slice(idx + 1)
          if (!line) continue
          try {
            const msg = JSON.parse(line)
            onmessage?.({ data: msg })
          } catch (err) {
            console.log(line)
          }
        }
      }
    } catch (err) {
      onerror?.(err)
    }
  })()

  // Continuously read stderr for logging / errors
  ;(async () => {
    const dec = new TextDecoder()
    try {
      while (true) {
        const { value, done } = await errReader.read()
        if (done) break
        const text = dec.decode(value)
        console.error("Worker stderr:", text)
      }
    } catch (_) {}
  })()

  return {
    async postMessage(msg) {
      const encoded = new TextEncoder().encode(JSON.stringify(msg) + "\n")
      await writer.write(encoded)
    },
    terminate() {
      try {
        child.kill("SIGTERM")
      } catch {}
    },
    set onmessage(fn) {
      onmessage = fn
    },
    get onmessage() {
      return onmessage
    },
    set onerror(fn) {
      onerror = fn
    },
    get onerror() {
      return onerror
    }
  }
}
