import createInstance from './create-instance.js'

const project = "knowlearning"
const zone = "us-central1-a"
const machineType = "n1-standard-1"
const sourceImage = "projects/debian-cloud/global/images/family/debian-11"

await createInstance('GCP', 'my-deno-instance', { project, zone, machineType, sourceImage })
