import { spawn } from 'child_process'
import { readdirSync } from 'fs'
const installs = {}

export default async (dir, modId) => {
  while (installs[dir]) await installs[dir]

  //  TODO: aggregate installs for a directory
  installs[dir] = new Promise(resolve => {
    console.log('installing into', dir, modId)
    const sc = spawn(
      '/usr/local/bin/pnpm',
      ['install', '--ignore-scripts', '-s', modId],
      { cwd: dir }
    )
    sc.on('close', resolve)
    //sc.stderr.pipe(process.stdout)
    //sc.stdout.pipe(process.stdout)
  })

  //  TODO: if code > 0, reject with error
  const start = Date.now()
  installs[dir]
    .then(code => {
      console.log('INSTALLED', code, modId, `in ${(Date.now() - start)/1000} seconds`)
      console.log(dir, readdirSync(dir + '/node_modules'))
    })
    .then(() => delete installs[dir])

  return installs[dir]
}
