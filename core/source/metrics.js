async function processMemCPUData() {
  const process = Deno.run({
    cmd: ["ps", "-p", Deno.pid.toString(), "-o", "%cpu,%mem"],
    stdout: "piped",
    stderr: "piped"
  })

  const output = await process.output()
  process.close()

  const lines = (new TextDecoder().decode(output)).split('\n').map(l => l.trim())
  const [cpu, mem] = lines[1].split(/\s+/)
  return {
    cpu: parseFloat(cpu)/100,
    mem: parseFloat(mem)/100
  }
}
async function getCpuStats() {
  const process = Deno.run({
    cmd: ["cat", "/proc/stat"],
    stdout: "piped",
    stderr: "piped"
  })

  const output = await process.output()
  const text = new TextDecoder().decode(output)
  process.close()

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
  const freeProcess = Deno.run({
    cmd: ['free', '-b'],
    stdout: 'piped',
    stderr: 'piped'
  })

  const freeOutput = await freeProcess.output()
  const decodedFreeOutput = new TextDecoder().decode(freeOutput)
  const freeLines = decodedFreeOutput.trim().split('\n')
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
  const cpuProcess = Deno.run({
    cmd: ['lscpu'],
    stdout: 'piped',
    stderr: 'piped'
  })

  const output = await cpuProcess.output()
  const decodedOutput = new TextDecoder().decode(output)

  const errorOutput = await cpuProcess.stderrOutput()
  const decodedError = new TextDecoder().decode(errorOutput)

  if (decodedError) {
    console.error('Error:', decodedError)
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
