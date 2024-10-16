import * as gcp from "@pulumi/gcp";
import * as fs from "fs";

export default function ({ NATS_VERSION, region, machineType }) {
    // Read the NATS configuration file
    const natsConfigScript = fs.readFileSync("nats-server.conf", "utf-8")

    // Create an instance template to define the NATS instances
    const instanceTemplate = new gcp.compute.InstanceTemplate("nats-instance-template", {
        machineType,
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
        }
    })

    // Create an instance group manager to handle scaling and management
    const instanceGroupManager = new gcp.compute.RegionInstanceGroupManager("nats-instance-group", {
        baseInstanceName: "nats-instance",
        versions: [{
            instanceTemplate: instanceTemplate.selfLinkUnique,
        }],
        region,
        statefulPolicy: {
            preservedState: { internalIps: true }
        }
    })

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
        }
    })

    return instanceGroupManager
}