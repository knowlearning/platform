import * as gcp from "@pulumi/gcp";

export default function ({ zone, machineType, healthCheck }) {

    // Create an instance template to define the NATS instances
    const instanceTemplate = new gcp.compute.InstanceTemplate("api-node-instance-template", {
        machineType,
        disks: [{
            boot: true,
            autoDelete: true,
            sourceImage: "debian-cloud/debian-12"
        }],
        networkInterfaces: [{
            network: "default",
            accessConfigs: [{}]
        }],
        metadataStartupScript: `
            #! /bin/sh

            sudo apt update
            sudo apt install git -y
            git clone https://github.com/knowlearning/platform.git
            cd platform/core
            git checkout update-infrastructure
            sudo sh ./run.sh
        `,
        serviceAccount: {
            scopes: ["https://www.googleapis.com/auth/cloud-platform"]
        }
    })

    const instanceGroupManager = new gcp.compute.InstanceGroupManager("api-node-instance-group", {
        baseInstanceName: "api-node-instance",
        versions: [{
            instanceTemplate: instanceTemplate.selfLinkUnique
        }],
        autoHealingPolicies: {
            healthCheck: healthCheck.id,
            initialDelaySec: 30
        },
        balancingMode: "CONNECTION",
        targetSize: 2,
        zone
    })

    return instanceGroupManager
}
