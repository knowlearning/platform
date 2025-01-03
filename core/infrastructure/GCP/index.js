import listAllResources from './list-all-resources.js'
import createInstanceGroup from './create-instance-group.js'
import createInstance from './create-instance.js'
import addInstancesToGroup from './add-instances-to-group.js'
import createHealthCheck from './create-health-check.js'
import createBackendService from './create-backend-service.js'
import reserveStaticIp from './reserve-static-ip.js'
import createForwardingRule from './create-forwarding-rule.js'
import createFirewallRule from './create-firewall-rule.js'

const project = "knowlearning"
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
const httpFirewallTag = 'http-firewall-tag'

const script = `#!/bin/bash

sudo apt install netcat-openbsd

# Simple HTTP Server in Bash
PORT=80

echo "Starting HTTP server on port $PORT..."
while true; do
  # Wait for a connection and respond immediately
  {
    echo -e "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nHello, World!";
  } | sudo nc -N -l -p $PORT
done
`

// await listAllResources('GCP', { project })
await createFirewallRule('GCP', httpFirewallRule, { project, targetTag: httpFirewallTag })
await createInstanceGroup('GCP', group, { project, zone })
await createInstance('GCP', instance, { project, zone, machine, image, group, script, tags: [httpFirewallTag] })
await addInstancesToGroup('GCP', { project, zone, instances: [ instance ], group })
await createHealthCheck('GCP', healthCheck, { project, region, port: 80 })
await createBackendService('GCP', service, { project, region, zone, group, healthCheck })
await reserveStaticIp('GCP', staticIpName, { project, region })
await createForwardingRule('GCP', forwardingRule, { project, region, service, staticIpName, port: 80 })

//  TODO: create 1 time use encrypted secret sharing API
//  TODO: use 1 time use encrypted secret sharing API to load environment in startup script
//  TODO: add lets encrypt https certificate to credentials
