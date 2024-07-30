import { uploadURL } from "./session.js"

export async function upload(info) {
  const url = await uploadURL(info.id)
  console.log(url)
}

export async function download(id) {
  
}