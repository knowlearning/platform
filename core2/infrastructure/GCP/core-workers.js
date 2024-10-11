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
            fetch_secret() {
                local secret_name=$1
                local secret_value=$(gcloud secrets versions access latest --secret="$secret_name" 2>/dev/null)
                if [ $? -eq 0 ]; then
                    echo "$secret_value"
                else
                    echo "Failed to retrieve secret: $secret_name" >&2
                    exit 1
                fi
            }

            echo "Fetching secret from Google Cloud Secret Manager..."
            SECRET=$(fetch_secret "test-secret")
            echo "Got secret"
            echo $SECRET
            echo "next thing to do is to connect to nats on ${NATS_IP_ADDRESS}"
            sudo apt-get install redis-tools
            REDIS_STATUS=$(redis-cli -h ${REDIS_IP_ADDRESS} -p 6379 ping)

            if [ "$REDIS_STATUS" == "PONG" ]; then
                echo "Redis server is UP and reachable!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
            else
                echo "Redis server is NOT reachable!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!:("
            fi
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
