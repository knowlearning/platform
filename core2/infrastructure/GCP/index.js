import natsCluster from "./nats-cluster.js"
import tcpLoadBalancer from "./tcp-load-balancer.js"
import coreWorkers from "./core-workers.js"
import redisDatabase from "./redis-database.js"
import postgresDatabase from "./postgres-database.js"

const NATS_VERSION = "v2.10.21"
const NATS_WS_CLIENT_PORT = "8080"
const NATS_CLIENT_PORT = "4222"
const NATS_IP_ADDRESS = "35.192.110.199"
const CORE_IP_ADDRESS = "34.55.105.78"
const CORE_HTTP_PORT = "8765"
const REDIS_IP_ADDRESS = "10.128.0.26"
const POSTGRES_IP_ADDRESS = "10.128.15.205"

const region = "us-central1"
const machineType = "e2-micro"

redisDatabase({
    REDIS_IP_ADDRESS,
    region,
    zone: `${region}-a`
})

postgresDatabase({
    POSTGRES_IP_ADDRESS,
    region,
    zone: `${region}-a`
})

const natsGroup = natsCluster({
    NATS_VERSION,
    region,
    machineType
})

const coreGroup = coreWorkers({
    NATS_IP_ADDRESS,
    REDIS_IP_ADDRESS,
    region,
    machineType
})

tcpLoadBalancer({
    name: 'nats',
    ipAddress: NATS_IP_ADDRESS,
    region,
    ports: [NATS_WS_CLIENT_PORT, NATS_CLIENT_PORT],
    group: natsGroup.instanceGroup
})

tcpLoadBalancer({
    name: 'core',
    ipAddress: CORE_IP_ADDRESS,
    region,
    ports: [CORE_HTTP_PORT],
    group: coreGroup.instanceGroup
})
