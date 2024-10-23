import * as gcp from "@pulumi/gcp";

export default function ({ ipAddress, region, ports, group, name  }) {

    const healthCheck = new gcp.compute.RegionHealthCheck(`${name}-tcp-health-check`, {
        name: `${name}-tcp-health-check`,
        region,
        tcpHealthCheck: { port: 4222 },
        checkIntervalSec: 5,
        timeoutSec: 5,
        healthyThreshold: 2,
        unhealthyThreshold: 2
    })

    const regionBackendService = new gcp.compute.RegionBackendService(`${name}-region-backend-service`, {
        name: `${name}-region-backend-service`,
        protocol: "TCP",
        region,
        loadBalancingScheme: "EXTERNAL",
        backends: [{ group }],
        healthChecks: [healthCheck.id]
    })

    new gcp.compute.ForwardingRule(`${name}-forwarding-rule`, {
        name: `${name}-forwarding-rule`,
        loadBalancingScheme: "EXTERNAL",
        backendService: regionBackendService.id,
        ipAddress,
        region,
        ports
    })

}