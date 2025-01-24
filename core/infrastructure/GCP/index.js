import reserveStaticIp from './reserve-static-ip.js'
import createFirewallRule from './create-firewall-rule.js'
import createInstance from './create-instance.js'

const project = "opensourcelearningplatform"
const region = "us-central1"
const machine = "n2-standard-2"
const image = "projects/debian-cloud/global/images/family/debian-11"
const httpFirewallRule = "http-firewall-rule"
const httpFirewallTag = "http-firewall-tag"

const zone = `${region}-b`
const instance = "my-deno-instance-2"
const staticIpName = "my-static-ip-2"

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

const staticIp = await reserveStaticIp('GCP', staticIpName, { project, region })
await createFirewallRule('GCP', httpFirewallRule, { project, targetTag: httpFirewallTag })
await createInstance('GCP', instance, { project, zone, machine, image, script, staticIp, tags: [httpFirewallTag] })
