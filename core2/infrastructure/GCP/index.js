import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import fs from "fs";

// Read the startup script from an external file
const startupScript = fs.readFileSync('../install/nats.sh', 'utf8');

// Define the zone and region
const zone = "us-central1-a";
const region = "us-central1";

// Create a firewall rule to allow traffic on port 4222
const firewall = new gcp.compute.Firewall("nats-firewall", {
    network: "default",
    allows: [
        {
            protocol: "tcp",
            ports: ["4222"],
        },
    ],
    sourceRanges: ["0.0.0.0/0"],
    targetTags: ["nats-backend"],
});


// Create an instance template with the startup script and network tags
const instanceTemplate = new gcp.compute.InstanceTemplate("nats-instance-template", {
    machineType: "e2-micro",
    disks: [
        {
            boot: true,
            sourceImage: 'debian-cloud/debian-12',
            autoDelete: true
        },
    ],
    networkInterfaces: [
        {
            network: "default",
            // No external IP needed for instances behind a load balancer
            accessConfigs: [],
        },
    ],
    metadataStartupScript: startupScript + '\n/nats-server',
    tags: ["nats-backend"],
});

// Create a managed instance group using the template
const instanceGroupManager = new gcp.compute.RegionInstanceGroupManager("nats-node-region-group-manager", {
    region,
    baseInstanceName: "nats-node",
    versions: [{
        instanceTemplate: instanceTemplate.selfLink,
    }]
});

// Configure auto-scaling for the instance group
const autoscaler = new gcp.compute.RegionAutoscaler("nats-region-autoscaler", {
    region,
    target: instanceGroupManager.id,
    autoscalingPolicy: {
        maxReplicas: 5,
        minReplicas: 3,
        cpuUtilization: {
            target: 0.6,
        },
    },
});

// Create a health check for the load balancer (TCP)
const healthCheck = new gcp.compute.RegionHealthCheck("nats-region-health-check", {
    region,
    checkIntervalSec: 5,
    timeoutSec: 5,
    healthyThreshold: 2,
    unhealthyThreshold: 2,
    tcpHealthCheck: {
        port: 4222,
    }
});

// Create a backend service pointing to the instance group
const backendService = new gcp.compute.RegionBackendService("nats-region-backend-service", {
    protocol: "TCP",
    loadBalancingScheme: "EXTERNAL",
    region: region,
    backends: [
        {
            group: instanceGroupManager.instanceGroup,
        },
    ],
    healthChecks: [healthCheck.id],
});

// Allocate a regional static IP address
const staticIP = new gcp.compute.Address("nats-static-ip", {
    region: region,
});

// Create a forwarding rule to route traffic to the backend service
const forwardingRule = new gcp.compute.ForwardingRule("nats-forwarding-rule", {
    loadBalancingScheme: "EXTERNAL",
    ipAddress: staticIP.address,
    ipProtocol: "TCP",
    ports: ["4222"],
    backendService: backendService.id,
    region: region,
});

// Export the static IP address
export const loadBalancerIP = staticIP.address;
