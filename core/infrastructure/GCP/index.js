import listAllResources from './list-all-resources.js'
import createInstanceGroup from './create-instance-group.js'
import createInstance from './create-instance.js'
import addInstancesToGroup from './add-instances-to-group.js'
import createHealthCheck from './create-health-check.js'
import createBackendService from './create-backend-service.js'

const project = "knowlearning"
const region = "us-central1"
const zone = `${region}-a`
const machine = "e2-micro"
const image = "projects/debian-cloud/global/images/family/debian-11"
const group = "my-instance-group"
const instance = "my-deno-instance"
const service = "my-backend-service"
const healthCheck = "my-health-check"

// await listAllResources('GCP', { project })
await createInstanceGroup('GCP', group, { project, zone })
await createInstance('GCP', instance, { project, zone, machine, image, group })
await addInstancesToGroup('GCP', { project, zone, instances: [ instance ], group })
await createHealthCheck('GCP', healthCheck, { project, region, port: 443 })
await createBackendService('GCP', service, { project, region, zone, group, healthCheck })
