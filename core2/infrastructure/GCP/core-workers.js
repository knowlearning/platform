import * as gcp from "@pulumi/gcp";

export default function ({ zone, machineType }) {

    // Create an instance template to define the NATS instances
    const instanceTemplate = new gcp.compute.InstanceTemplate("core-worker-instance-template", {
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
            cd platform
            git checkout trunk2
            sudo sh run.sh
        `,
        serviceAccount: {
            scopes: ["https://www.googleapis.com/auth/cloud-platform"]
        }
    })

    const instanceGroupManager = new gcp.compute.InstanceGroupManager("core-worker-instance-group", {
        baseInstanceName: "core-worker-instance",
        versions: [{
            instanceTemplate: instanceTemplate.selfLinkUnique
        }],
        zone
    })

    new gcp.compute.Autoscaler("core-worker-autoscaler", {
        target: instanceGroupManager.id,
        autoscalingPolicy: {
            maxReplicas: 1,
            minReplicas: 1,
            cpuUtilization: { target: 0.6 }
        },
        zone
    })

    return instanceGroupManager
}
