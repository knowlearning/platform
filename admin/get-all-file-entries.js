export default function (itemList) {
  return getEntries([...itemList].map(i => i.webkitGetAsEntry()))
}

function getEntries(entries) {
  return Promise.all(entries.map(processEntry)).then(e => e.flat())
}

const processEntry = async entry => {
  if (entry.name[0] === '.') return [] // ignore hidden files

  if (entry.isFile) return entry
  else if (entry.isDirectory) {
    return getEntries(await dirToEntries(entry.createReader()))
  }
}

const dirToEntries = async dirReader => {
  const entries = []
  let nextEntries = await readEntries(dirReader)
  while (nextEntries.length > 0) {
    entries.push(...nextEntries)
    nextEntries = await readEntries(dirReader)
  }
  return getEntries(entries)
}

const readEntries = reader => new Promise((s,e) => reader.readEntries(s, e))
