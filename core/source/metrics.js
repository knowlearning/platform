import { environment } from './utils.js'

const { MODE } = environment

async function run(cmd, capture = "stdout") {
  const command = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "piped",
    stderr: "piped"
  })

  const { stdout, stderr } = await command.output()
  return new TextDecoder().decode(capture === 'stdout' ? stdout : stderr)
}

async function processMemCPUData() {
  const command = ["ps", "-p", Deno.pid.toString(), "-o", "%cpu,%mem"]

  const lines = (await run(command)).split('\n').map(l => l.trim())
  const [cpu, mem] = lines[1].split(/\s+/)

  return {
    cpu: parseFloat(cpu)/100,
    mem: parseFloat(mem)/100
  }
}

async function getCpuStats() {
  const command = ["cat", "/proc/stat"]

  const text = await run(command)

  const match = text.match(/^cpu\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/)
  if (match) {
    const [
      user,
      nice,
      system,
      idle,
      iowait,
      irq,
      softirq,
      steal
    ] = match.slice(1).map(Number)

    const total = user + nice + system + idle + iowait + irq + softirq + steal
    return { total, idle }
  } else {
    throw new Error("Unable to parse CPU stats.")
  }
}

export async function processData() {
  const command = ['free', '-b']

  const freeLines = (await run(command)).trim().split('\n')
  const memoryData = freeLines[1].split(/\s+/)

  const { cpu, mem } = await processMemCPUData()
  const { total, idle } = await getCpuStats()

  const totalMemory = parseInt(memoryData[1], 10)

  return {
    totalCPU: (total - idle)/total,
    processCPU: Math.round(cpu * 1000) / 1000,
    processMemory: parseInt(totalMemory * mem),
    totalMemory,
    usedMemory: parseInt(memoryData[2], 10),
    freeMemory: parseInt(memoryData[3], 10),
    sharedMemory: parseInt(memoryData[4], 10),
    bufferCache: parseInt(memoryData[5], 10),
    availableMemory: parseInt(memoryData[6], 10)
  }
}

// Deno script to capture CPU data using lscpu

export async function CPUData() {
  const decodedOutput = await run(['lscpu'])

  if (!decodedOutput) {
    console.error('Error Collecting CPU data')
    return null
  }

  const lines = decodedOutput.trim().split('\n')
  const cpuInfo = {}

  lines.forEach(line => {
    const [key, value] = line.split(':').map(part => part.trim())
    if (key && value) {
      cpuInfo[key] = isNaN(value) ? value : parseFloat(value)
    }
  })

  return cpuInfo
}

let externalInterface
async function getExternalInterface() {
  if (externalInterface) return externalInterface

  const interfaces = await Deno.readDir("/sys/class/net")
  for await (const entry of interfaces) {
    if (entry.name !== "lo") {
      console.log(entry.name)
      externalInterface = entry.name
      return entry.name
    }
  }
  throw new Error("No external interface found")
}

let lastRx = 0
let lastTx = 0
let lastNetworkDataPoll = Date.now()

//  returns average since last pull
export async function networkData() {
  const { rx, tx } = await getBytes()
  const now = Date.now()

  const interval = (now - lastNetworkDataPoll) / 1000
  lastNetworkDataPoll = now

  const drx = rx - lastRx
  const dtx = tx - lastTx

  lastRx = rx
  lastTx = tx

  return {
    rx: Math.round(drx / interval),
    tx: Math.round(dtx / interval)
  }
}

async function readFileAsRoot(path) {
  const cmd = new Deno.Command("cat", { args: [path], stdout: "piped", stderr: "null" })
  const { stdout } = await cmd.output()
  return new TextDecoder().decode(stdout).trim()
}

async function getBytes() {
  const iface = await getExternalInterface()
  const rx = parseInt(await readFileAsRoot(`/sys/class/net/${iface}/statistics/rx_bytes`))
  const tx = parseInt(await readFileAsRoot(`/sys/class/net/${iface}/statistics/tx_bytes`))
  return { rx, tx }
}

const METADATA_BASE = 'http://metadata.google.internal/computeMetadata/v1'
const HEADERS = { 'Metadata-Flavor': 'Google' }

async function getMetadata(path) {
  const res = await fetch(`${METADATA_BASE}/${path}`, { headers: HEADERS })
  if (!res.ok) {
    throw new Error(`Failed to fetch metadata for ${path}`)
  }
  return await res.text()
}

export async function getInstanceInfo() {
  if (MODE === 'local') return { provider: 'local' }

  const name = await getMetadata('instance/name')

  const zonePath = await getMetadata('instance/zone')
  const zone = zonePath.split('/').pop()
  const region = zone.slice(0, zone.lastIndexOf('-'))

  return { provider: 'GCP', name, zone, region }
}
