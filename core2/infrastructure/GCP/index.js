import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";

// Define configuration values
const config = new pulumi.Config();
const region = config.require("region") || "us-central1";
const zone = config.require("zone") || "us-central1-a";
const machineType = config.get("machineType") || "e2-micro";
const desiredSize = config.getNumber("desiredSize") || 3; // Number of initial instances

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
        #! /bin/bash
        sudo apt-get update
        sudo apt-get install -y wget
        wget https://github.com/nats-io/nats-server/releases/download/v2.8.4/nats-server-v2.8.4-linux-amd64.tar.gz
        tar -xvzf nats-server-v2.8.4-linux-amd64.tar.gz
        sudo mv nats-server-v2.8.4-linux-amd64/nats-server /usr/local/bin/nats-server

        echo '${natsConfigScript}' > nats-server.conf

        # Start NATS server with cluster configuration
        nats-server -c nats-server.conf &
    `,
    serviceAccount: {
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    },
});

// Create an instance group manager to handle scaling and management
const instanceGroupManager = new gcp.compute.InstanceGroupManager("nats-instance-group", {
    baseInstanceName: "nats-instance",
    versions: [{
        instanceTemplate: instanceTemplate.selfLinkUnique,
    }],
    zone
});

// Define an autoscaler to scale the NATS instances based on CPU utilization
const autoscaler = new gcp.compute.Autoscaler("nats-autoscaler", {
    zone: zone,
    target: instanceGroupManager.id,
    autoscalingPolicy: {
        maxReplicas: 5, // Set a maximum number of instances
        minReplicas: 3, // Minimum number of instances
        cpuUtilization: {
            target: 0.6, // Scale out when average CPU is above 60%
        },
    },
});

// Export the instance group name and instance template link
export const instanceGroup = instanceGroupManager.name;
export const templateLink = instanceTemplate.selfLink;
