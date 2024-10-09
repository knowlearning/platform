import * as gcp from "@pulumi/gcp";

export default function ({ REGION_STATIC_IP, region, ports, group  }) {
    const lbStaticIp = new gcp.compute.Address("nats-cluster-static-ip", {
        name: "nats-cluster-static-ip",
        addressType: "EXTERNAL",
        address: REGION_STATIC_IP,
        region
    })

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
        ipAddress: lbStaticIp.address,
        region: lbStaticIp.region,
        ports
    })

    return lbStaticIp
}