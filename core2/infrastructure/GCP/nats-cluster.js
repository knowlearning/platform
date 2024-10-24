import * as gcp from "@pulumi/gcp"
import * as fs from "fs"

export default function ({ NATS_VERSION, zone, machineType, healthCheck }) {
    // Read the NATS configuration file
    const natsConfigScript = fs.readFileSync("nats-server.conf", "utf-8")

    // Create an instance template to define the NATS instances
    const instanceTemplate = new gcp.compute.InstanceTemplate("nats-instance-template", {
        machineType,
        disks: [{
            boot: true,
            autoDelete: true,
            sourceImage: "debian-cloud/debian-12"
        }, {
            autoDelete: false,
            deviceName: 'nats-jetstream-data'
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

    const instanceGroupManager = new gcp.compute.InstanceGroupManager("nats-instance-group", {
        baseInstanceName: "nats-instance",
        versions: [{
            instanceTemplate: instanceTemplate.selfLinkUnique,
        }],
        statefulInternalIps: [{
            deleteRule: "ON_PERMANENT_INSTANCE_DELETION",
            interfaceName: "nic0"
        }],
        statefulDisks: [{
            deleteRule: "ON_PERMANENT_INSTANCE_DELETION",
            deviceName: "nats-jetstream-data"
        }],
        autoHealingPolicies: {
            healthCheck: healthCheck.id,
            initialDelaySec: 30
        },
        targetSize: 3,
        zone
    })

    return instanceGroupManager
}
