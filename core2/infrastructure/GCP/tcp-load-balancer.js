import * as gcp from "@pulumi/gcp";

export default function ({ NATS_IP_ADDRESS, region, ports, group  }) {

    const natsHealthCheck = new gcp.compute.RegionHealthCheck("nats-tcp-health-check", {
        name: "nats-tcp-health-check",
        region,
        tcpHealthCheck: { port: 4222 },
        checkIntervalSec: 5,
        timeoutSec: 5,
        healthyThreshold: 2,
        unhealthyThreshold: 2
    })

    const regionBackendService = new gcp.compute.RegionBackendService("nats-region-backend-service", {
        name: "nats-region-backend-service",
        protocol: "TCP",
        region,
        loadBalancingScheme: "EXTERNAL",
        backends: [{ group }],
        healthChecks: [natsHealthCheck.id]
    })

    new gcp.compute.ForwardingRule("nats-forwarding-rule", {
        name: "nats-forwarding-rule",
        loadBalancingScheme: "EXTERNAL",
        backendService: regionBackendService.id,
        ipAddress: NATS_IP_ADDRESS,
        region,
        ports
    })

}