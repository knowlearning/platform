import * as gcp from "@pulumi/gcp"

export default function ({ name, zone, port }) {
    const region = zone.split('-').slice(0, -1).join('-')

    return new gcp.compute.RegionHealthCheck(`${name}-tcp-health-check`, {
        name: `${name}-tcp-health-check`,
        region,
        tcpHealthCheck: { port },
        checkIntervalSec: 5,
        timeoutSec: 5,
        healthyThreshold: 2,
        unhealthyThreshold: 2
    })
}
