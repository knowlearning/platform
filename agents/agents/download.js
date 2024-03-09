const DOWNLOAD_TYPE = 'application/json;type=download'

export default function download (id, { create, lastMessageResponse, fetch, metadata }) {
  // TODO: initialize size info
  create({
    active_type: DOWNLOAD_TYPE,
    active: { id }
  })

  let mode = 'fetch'

  const promise = new Promise(async (resolve, reject) => {
    const { url } = await lastMessageResponse()
    await new Promise(r => setTimeout(r))

    if (mode === 'url') resolve(url)
    else if (mode === 'fetch') {
      const response = await fetch(url)
      const { ok, statusText } = response

      if (ok) resolve(response)
      else reject(statusText)
    }
    else if (mode === 'direct') {
      //  TODO: throw meaningful error if not in browser context
      //        (following block assumes browser context)
      //  TODO: use browser progress UX instead of downloading all into memory first
      const res = await download(id, { create, lastMessageResponse, fetch, metadata })
      const { name } = await metadata(id)
      const type = res.headers.get('Content-Type')
      const blob = new Blob([ await res.blob() ], { type }) 
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      resolve()
    }
  })

  promise.direct = () => {
    mode = 'direct'
    return promise
  }
  promise.url = () => {
    mode = 'url'
    return promise
  }

  return promise
}