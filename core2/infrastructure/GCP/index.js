import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";

const LOAD_BALANCER_IP = "10.128.0.14"
const NATS_VERSION = "v2.10.21"

// Define configuration values
const config = new pulumi.Config();
const region = config.require("region") || "us-central1";
const zone = config.require("zone") || "us-central1-a";
const machineType = config.get("machineType") || "e2-micro";

//  TODO: remove static ip and load balancer...
const staticIp = new gcp.compute.Address("nats-cluster-load-balancer", {
    addressType: "INTERNAL",
    address: LOAD_BALANCER_IP,
    region
});

// Read the NATS configuration file
const natsConfigScript = fs.readFileSync("nats-server.conf", "utf-8");

// Create an instance template to define the NATS instances
const instanceTemplate = new gcp.compute.InstanceTemplate("nats-instance-template", {
    machineType: machineType,
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

        SELF_INTERNAL_URL="$(hostname):6222"

        sudo apt-get update
        sudo apt-get install -y wget
        wget https://github.com/nats-io/nats-server/releases/download/${NATS_VERSION}/nats-server-${NATS_VERSION}-linux-amd64.tar.gz
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
        nats-server -c nats-server.conf &
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

const healthCheck = new gcp.compute.HealthCheck('nats-cluster-health-check', {
    checkIntervalSec: 5,
    timeoutSec: 5,
    healthyThreshold: 2,
    unhealthyThreshold: 2,
    tcpHealthCheck: { // Changed from httpHealthCheck to tcpHealthCheck
        port: 6222, // Port to perform the TCP health check
    },
    region: region,
});

const backendService = new gcp.compute.RegionBackendService('nats-cluster-backend-service', {
    protocol: "TCP",
    backends: [{
        group: instanceGroupManager.instanceGroup,
    }],
    healthChecks: [healthCheck.id],
    loadBalancingScheme: "INTERNAL",
    region: region,
});

const forwardingRule = new gcp.compute.ForwardingRule('nats-cluster-forwarding-rule', {
    loadBalancingScheme: "INTERNAL",
    ports: ["6222"],
    ipAddress: staticIp.address,
    backendService: backendService.id,
    region: region,
});

export const staticIpAddress = staticIp.address