import * as gcp from "@pulumi/gcp"

export default function ({ name, zone, port }) {
    const region = zone.split('-').slice(0, -1).join('-')
    const fullName = `${name}-http-health-check`

    return new gcp.compute.RegionHealthCheck(fullName, {
        name: fullName,
        region,
        httpHealthCheck: { port },
        checkIntervalSec: 5,
        timeoutSec: 5,
        healthyThreshold: 2,
        unhealthyThreshold: 2
    })
}
