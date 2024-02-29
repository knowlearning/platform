export default async function selectFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'

    input.addEventListener('change', async (event) => {
      const file = event.target.files[0]

      if (file) resolve(file)
      else resolve(null)
    })

    input.click()
  })
}