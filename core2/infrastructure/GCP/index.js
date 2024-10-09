import natsCluster from "./nats-cluster.js"
import tcpLoadBalancer from "./tcp-load-balancer.js"

const NATS_VERSION = "v2.10.21"
const REGION_STATIC_IP = "34.66.62.82"

const region = "us-central1"
const machineType = "e2-micro"

const { instanceGroup } = natsCluster({
    NATS_VERSION,
    REGION_STATIC_IP,
    region,
    machineType
})

const loadBalancer = tcpLoadBalancer({
    REGION_STATIC_IP,
    region,
    ports: ["8080", "4222"],
    group: instanceGroup
})

export const staticIpAddress = loadBalancer.address
