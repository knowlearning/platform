import createInstance from './create-instance.js'

const project = "knowlearning"
const zone = "us-central1-a"
const machine = "n1-standard-1"
const image = "projects/debian-cloud/global/images/family/debian-11"

await createInstance('GCP', 'my-deno-instance', { project, zone, machine, image })
