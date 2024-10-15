import * as gcp from "@pulumi/gcp";

export default function ({ NATS_IP_ADDRESS, REDIS_IP_ADDRESS, region, machineType }) {

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
            sudo apt install git
            git clone https://github.com/knowlearning/platform.git
            cd platform
            git checkout trunk2
            sh run.sh
        `,
        serviceAccount: {
            scopes: ["https://www.googleapis.com/auth/cloud-platform"]
        }
    })

    const instanceGroupManager = new gcp.compute.RegionInstanceGroupManager("core-worker-instance-group", {
        baseInstanceName: "core-worker-instance",
        versions: [{
            instanceTemplate: instanceTemplate.selfLinkUnique
        }],
        region
    })

    const autoscaler = new gcp.compute.RegionAutoscaler("core-worker-autoscaler", {
        region,
        target: instanceGroupManager.id,
        autoscalingPolicy: {
            maxReplicas: 1,
            minReplicas: 1,
            cpuUtilization: { target: 0.6 }
        }
    })

    return instanceGroupManager
}
