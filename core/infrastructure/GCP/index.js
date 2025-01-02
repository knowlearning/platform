import listAllResources from './list-all-resources.js'
import createInstanceGroup from './create-instance-group.js'
import createInstance from './create-instance.js'
import addInstancesToGroup from './add-instances-to-group.js'

const project = "knowlearning"
const zone = "us-central1-a"
const machine = "e2-micro"
const image = "projects/debian-cloud/global/images/family/debian-11"
const group = "my-instance-group"
const instance = "my-deno-instance"

await listAllResources('GCP', { project })
await createInstanceGroup('GCP', group, { project, zone })
await createInstance('GCP', instance, { project, zone, machine, image, group })
await addInstancesToGroup('GCP', { project, zone, instances: [ instance ], group })
