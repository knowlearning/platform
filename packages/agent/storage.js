import { v4 as uuid } from 'uuid'
import { uploadURL, downloadURL } from "./session.js"

export async function upload(info) {
  const { browser, type, data, id=uuid(), name } = info || {}
  if (browser) {
    const file = await selectFile(info)
    if (!file) return
    if (info.validate && !(await info.validate(file))) return

    info.data = await file.arrayBuffer()
    if (!info.name) info.name = file.name
    if (!info.type) info.type = file.type
  }

  const url = await uploadURL(info.id, info.name)

  if (data === undefined) return url
  else {
    const headers = { 'Content-Type': type }
    const response = await fetch(url, {method: 'PUT', headers, body: data})
    const { ok, statusText } = response

    if (ok) return id
    else throw new Error(statusText)
  }
}

export async function download(id) {
  let mode = 'fetch'
  const promise = new Promise(async (resolve, reject) => {
    const url = await downloadURL(id)

    await new Promise(r => setTimeout(r))
    if (mode === 'url') resolve(url)
    else if (mode === 'fetch') {
      const response = await fetch(url)
      const { ok, statusText } = response

      if (ok) resolve(response)
      else reject(statusText)
    }
    else if (mode === 'direct') {
      //  TODO: use browser progress UX instead of downloading all into memory first
      const res = await download(id)
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