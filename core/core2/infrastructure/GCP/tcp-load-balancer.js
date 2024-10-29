import * as gcp from "@pulumi/gcp";

export default function ({ ipAddress, zone, ports, group, name, healthCheck }) {
    //  TODO: assess why forwarding rule is at region level
    const region = zone.split('-').slice(0, -1).join('-')

    const backendService = new gcp.compute.RegionBackendService(`${name}-backend-service`, {
        name: `${name}-backend-service`,
        region,
        protocol: "TCP",
        loadBalancingScheme: "EXTERNAL",
        backends: [{ group }],
        healthChecks: [ healthCheck.id ]
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