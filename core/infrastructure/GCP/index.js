import listAllResources from './list-all-resources.js'
import createInstanceGroup from './create-instance-group.js'
import createInstance from './create-instance.js'
import addInstancesToGroup from './add-instances-to-group.js'
import createHealthCheck from './create-health-check.js'
import createBackendService from './create-backend-service.js'
import reserveStaticIp from './reserve-static-ip.js'
import createForwardingRule from './create-forwarding-rule.js'
import createFirewallRule from './create-firewall-rule.js'

const project = "opensourcelearningplatform"
const region = "us-central1"
const zone = `${region}-a`
const machine = "e2-micro"
const image = "projects/debian-cloud/global/images/family/debian-11"
const group = "my-instance-group"
const instance = "my-deno-instance"
const service = "my-backend-service"
const healthCheck = "my-health-check"
const staticIpName = "my-static-ip"
const forwardingRule = "my-forwarding-rule"
const httpFirewallRule = "http-firewall-rule"
const httpFirewallTag = "http-firewall-tag"

const script = `#!/bin/bash

sudo tee -a /etc/ssh/sshd_config <<EOF
AcceptEnv AUTH_SERVICE_SECRET_KEY
AcceptEnv GCS_SERVICE_ACCOUNT_CREDENTIALS
AcceptEnv OAUTH_CREDENTIALS
AcceptEnv POSTGRES_PASSWORD
AcceptEnv REDIS_PASSWORD
AcceptEnv INSECURE_DEVELOPMENT_CERT
AcceptEnv INSECURE_DEVELOPMENT_KEY
EOF

sudo systemctl restart sshd
`

// await listAllResources('GCP', { project })
await createFirewallRule('GCP', httpFirewallRule, { project, targetTag: httpFirewallTag })
await createInstanceGroup('GCP', group, { project, zone })
await createInstance('GCP', instance, { project, zone, machine, image, group, script, tags: [httpFirewallTag] })
await addInstancesToGroup('GCP', { project, zone, instances: [ instance ], group })
await createHealthCheck('GCP', healthCheck, { project, region, port: 443 })
await createBackendService('GCP', service, { project, region, zone, group, healthCheck })
await reserveStaticIp('GCP', staticIpName, { project, region })
await createForwardingRule('GCP', forwardingRule, { project, region, service, staticIpName, port: 443 })

//  TODO: add lets encrypt https certificate to credentials
