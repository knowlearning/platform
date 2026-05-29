import reserveStaticIp from './reserve-static-ip.js'
import createFirewallRule from './create-firewall-rule.js'
import createInstance from './create-instance.js'

const image = "projects/debian-cloud/global/images/family/debian-11"
const httpFirewallRule = "http-firewall-rule"
const httpFirewallTag = "http-firewall-tag"

const project = Deno.env.get("PROJECT")
const region = Deno.env.get("REGION")
const zone = Deno.env.get("ZONE")
const instance = Deno.env.get("INSTANCE_NAME")
const staticIpName = Deno.env.get("STATIC_IP_NAME")
const machine = Deno.env.get("GCP_MACHINE")

const script = `#!/bin/bash

sudo tee -a /etc/ssh/sshd_config <<EOF
AcceptEnv AUTH_SERVICE_SECRET_KEY
AcceptEnv GCS_SERVICE_ACCOUNT_CREDENTIALS
AcceptEnv OAUTH_CREDENTIALS
AcceptEnv POSTGRES_SERVERS
AcceptEnv REDIS_SERVERS
AcceptEnv REDIS_SUBSCRIPTION_SERVER
AcceptEnv PUBLIC_ENCRYPTION_KEY
AcceptEnv SECRET_ENCRYPTION_KEY
AcceptEnv SSL_CERT
AcceptEnv SSL_KEY
EOF

sudo systemctl restart sshd
`

const staticIp = await reserveStaticIp('GCP', staticIpName, { project, region })
await createFirewallRule('GCP', httpFirewallRule, { project, targetTag: httpFirewallTag })
await createInstance('GCP', instance, { project, zone, machine, image, script, staticIp, tags: [httpFirewallTag] })
