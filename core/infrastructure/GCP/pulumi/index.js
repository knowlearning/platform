import httpHealthCheck from "./http-health-check.js"
import tcpLoadBalancer from "./tcp-load-balancer.js"
import apiNodes from "./api-nodes.js"

const API_IP_ADDRESS = "35.192.110.199"
const API_HTTP_PORT = 80
const API_HTTPS_PORT = 443
const ZONE = "us-central1-a"
const MACHINE_TYPE = "n1-standard-1"

const apiHealthCheck = httpHealthCheck({
  name: 'api',
  zone: ZONE,
  port: API_HTTP_PORT
})

const apiNodeGroup = apiNodes({
  zone: ZONE,
  machineType: MACHINE_TYPE,
  healthCheck: apiHealthCheck,
  targetSize: 2
})

tcpLoadBalancer({
  zone: ZONE,
  name: 'api',
  ipAddress: API_IP_ADDRESS,
  ports: [ API_HTTP_PORT, API_HTTPS_PORT ],
  group: apiNodeGroup.instanceGroup,
  healthCheck: apiHealthCheck
})
