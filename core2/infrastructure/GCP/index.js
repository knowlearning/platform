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

const zone = "us-central1-a"
const machineType = "e2-micro"

redisDatabase({ zone, REDIS_IP_ADDRESS })
postgresDatabase({ zone, POSTGRES_IP_ADDRESS })

const natsGroup = natsCluster({
    zone,
    NATS_VERSION,
    machineType
})

const coreGroup = coreWorkers({ zone, machineType })

tcpLoadBalancer({
    zone,
    name: 'nats',
    ipAddress: NATS_IP_ADDRESS,
    ports: [NATS_WS_CLIENT_PORT, NATS_CLIENT_PORT],
    group: natsGroup.instanceGroup
})

tcpLoadBalancer({
    zone,
    name: 'core',
    ipAddress: CORE_IP_ADDRESS,
    ports: [CORE_HTTP_PORT],
    group: coreGroup.instanceGroup
})
