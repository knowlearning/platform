import * as gcp from "@pulumi/gcp";

export default function ({ ipAddress, zone, ports, group, name  }) {
    //  TODO: assess why forwarding rule is at region level
    const region = zone.split('-').slice(0, -1).join('-')

    const healthCheck = new gcp.compute.RegionHealthCheck(`${name}-tcp-health-check`, {
        name: `${name}-tcp-health-check`,
        region,
        tcpHealthCheck: { port: 4222 },
        checkIntervalSec: 5,
        timeoutSec: 5,
        healthyThreshold: 2,
        unhealthyThreshold: 2
    })

    const backendService = new gcp.compute.RegionBackendService(`${name}-backend-service`, {
        name: `${name}-backend-service`,
        region,
        protocol: "TCP",
        loadBalancingScheme: "EXTERNAL",
        backends: [{ group }],
        healthChecks: [healthCheck.id]
    })

    new gcp.compute.ForwardingRule(`${name}-forwarding-rule`, {
        name: `${name}-forwarding-rule`,
        region,
        loadBalancingScheme: "EXTERNAL",
        backendService: backendService.id,
        ipAddress,
        ports
    })

}