import * as gcp from "@pulumi/gcp";
import * as fs from "fs";

const NATS_VERSION = "v2.10.21"
const REGION_STATIC_IP = "35.226.122.224"

const region = "us-central1"
const machineType = "e2-micro"

//  TODO: remove static ip and load balancer...
// const staticIp = new gcp.compute.Address("nats-cluster-load-balancer", {
//     addressType: "INTERNAL",
//     address: LOAD_BALANCER_IP,
//     region
// });

// Read the NATS configuration file
const natsConfigScript = fs.readFileSync("nats-server.conf", "utf-8");

// Create an instance template to define the NATS instances
const instanceTemplate = new gcp.compute.InstanceTemplate("nats-instance-template", {
    machineType: machineType,
//    tags: ["nats-server"],
    disks: [{
        boot: true,
        autoDelete: true,
        sourceImage: "debian-cloud/debian-12"
    }],
    networkInterfaces: [{
        network: "default",
        accessConfigs: [{}], // To allow external access (e.g., NAT)
    }],
    metadataStartupScript: `
        #! /bin/sh

        sudo apt-get update
        sudo apt-get install -y wget
        wget https://github.com/nats-io/nats-server/releases/download/${NATS_VERSION}/nats-server-${NATS_VERSION}-linux-amd64.tar.gz
        # TODO: validate download
        tar -xvzf nats-server-${NATS_VERSION}-linux-amd64.tar.gz
        sudo mv nats-server-${NATS_VERSION}-linux-amd64/nats-server /usr/local/bin/nats-server

        echo '${natsConfigScript}' > nats-server.conf

        # replace DYNAMIC_CLUSTER_ROUTES in file with properly formtted routes
        current_ip=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/ip" -H "Metadata-Flavor: Google")

        while true; do
            other_ips=$(gcloud compute instances list --filter="nats-instance-group" --format="get(networkInterfaces[0].networkIP)" \
                | grep -v "$current_ip")
            [ -n "$other_ips" ] && break
            echo "No other instances available, retrying..."
            sleep 1
        done

        formatted_routes=$(echo "$other_ips" | sed 's/^/nats:\\/\\//' | sed 's/$/:6222/' | paste -sd, -)

        sed -i "s|DYNAMIC_CLUSTER_ROUTES|$formatted_routes|g" nats-server.conf

        # Start NATS server with cluster configuration
        SERVER_NAME="$(hostname)" CLUSTER_ADVERTISE_URL="$($current_ip):6222" nats-server -c nats-server.conf &
    `,
    serviceAccount: {
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    },
});

// Create an instance group manager to handle scaling and management
const instanceGroupManager = new gcp.compute.RegionInstanceGroupManager("nats-instance-group", {
    baseInstanceName: "nats-instance",
    versions: [{
        instanceTemplate: instanceTemplate.selfLinkUnique,
    }],
    region
});

// Define an autoscaler to scale the NATS instances based on CPU utilization
const autoscaler = new gcp.compute.RegionAutoscaler("nats-autoscaler", {
    region,
    target: instanceGroupManager.id,
    autoscalingPolicy: {
        maxReplicas: 5, // Set a maximum number of instances
        minReplicas: 3, // Minimum number of instances
        cpuUtilization: {
            target: 0.6, // Scale out when average CPU is above 60%
        },
    },
});

// const healthCheck = new gcp.compute.HealthCheck('nats-cluster-health-check', {
//     checkIntervalSec: 5,
//     timeoutSec: 5,
//     healthyThreshold: 2,
//     unhealthyThreshold: 2,
//     tcpHealthCheck: { // Changed from httpHealthCheck to tcpHealthCheck
//         port: 6222, // Port to perform the TCP health check
//     },
//     region: region,
// });

// const backendService = new gcp.compute.RegionBackendService('nats-cluster-backend-service', {
//     protocol: "TCP",
//     backends: [{
//         group: instanceGroupManager.instanceGroup,
//     }],
//     healthChecks: [healthCheck.id],
//     loadBalancingScheme: "INTERNAL",
//     region: region,
// });

// //  TODO: necessary?
// new gcp.compute.ForwardingRule('nats-cluster-forwarding-rule', {
//     loadBalancingScheme: "INTERNAL",
//     ports: ["6222"],
//     ipAddress: staticIp.address,
//     backendService: backendService.id,
//     region: region,
// });

// const natsFirewallRule = new gcp.compute.Firewall("nats-firewall-rule", {
//     network: 'default',
//     allows: [{
//         protocol: "tcp",
//         ports: ["4222", "8222", "8080"]
//     }],
//     sourceRanges: ["0.0.0.0/0"],
//     direction: "INGRESS",
//     targetTags: ["nats-server"],
// });

const lbStaticIp = new gcp.compute.Address("nats-cluster-static-ip", {
    name: "nats-cluster-static-ip",
    addressType: "EXTERNAL",
    address: REGION_STATIC_IP,
    region
});

const natsHealthCheck = new gcp.compute.RegionHealthCheck("nats-tcp-health-check", {
    name: "nats-tcp-health-check",
    region,
    tcpHealthCheck: { port: 4222 },
    checkIntervalSec: 5,
    timeoutSec: 5,
    healthyThreshold: 2,
    unhealthyThreshold: 2
});

const regionBackendService = new gcp.compute.RegionBackendService("nats-region-backend-service", {
    name: "nats-region-backend-service",
    protocol: "TCP",
    region,
    loadBalancingScheme: "EXTERNAL",
    backends: [{ group: instanceGroupManager.instanceGroup }],
    healthChecks: [natsHealthCheck.id]
});

new gcp.compute.ForwardingRule("nats-forwarding-rule", {
    name: "nats-forwarding-rule",
    loadBalancingScheme: "EXTERNAL",
    backendService: regionBackendService.id,
    ipAddress: lbStaticIp.address,
    region: lbStaticIp.region,
    ports: ["8080", "4222"]
});

export const staticIpAddress = lbStaticIp.address
