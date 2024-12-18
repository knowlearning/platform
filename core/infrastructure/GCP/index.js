import httpHealthCheck from "./http-health-check.js"
import tcpLoadBalancer from "./tcp-load-balancer.js"
import apiNodes from "./api-nodes.js"

const API_IP_ADDRESS = "35.192.110.199"
const API_HTTP_PORT = 8000
const ZONE = "us-central1-a"
const MACHINE_TYPE = "e2-micro"

const apiHealthCheck = httpHealthCheck({
  name: 'api',
  zone: ZONE,
  port: API_HTTP_PORT
})

const apiNodeGroup = apiNodes({
  zone: ZONE,
  machineType: MACHINE_TYPE,
  healthCheck: apiHealthCheck
})

tcpLoadBalancer({
  zone: ZONE,
  name: 'api',
  ipAddress: API_IP_ADDRESS,
  ports: [API_HTTP_PORT],
  group: apiNodeGroup.instanceGroup,
  healthCheck: apiHealthCheck
})
