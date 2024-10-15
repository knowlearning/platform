import * as gcp from "@pulumi/gcp"

export default function ({ REDIS_IP_ADDRESS, region, zone }) {
    new gcp.compute.Address("redis-static-ip", {
        address: REDIS_IP_ADDRESS,
        addressType: "INTERNAL",
        region,
        subnetwork: "default",
        purpose: "GCE_ENDPOINT"
    })

    // Create a firewall rule to allow internal traffic on port 6379 (Redis)
    new gcp.compute.Firewall("allow-redis-internal", {
        network: "default",  // Use the default network
        allows: [{
            protocol: "tcp",
            ports: ["6379"],  // Allow traffic on Redis port
        }],
        sourceRanges: ["10.128.0.0/9"],  // Allow traffic from all IPs within the VPC (default network's range)
        direction: "INGRESS",
        targetTags: ["redis"]  // Apply the firewall rule to instances with the "redis" tag
    })

    const redisInstance = new gcp.compute.Instance("redis-instance", {
        machineType: "e2-micro",
        zone,
        bootDisk: { initializeParams: { image: "debian-cloud/debian-12" } },
        networkInterfaces: [
            {
                network: "default",
                subnetwork: "default",
                networkIp: REDIS_IP_ADDRESS,
                accessConfigs: [{}]
            },
        ],
        metadataStartupScript: `#!/bin/bash

            REDIS_PASSWORD=$(gcloud secrets versions access latest --secret=REDIS_PASSWORD)
            sudo apt-get update
            sudo apt-get install -y software-properties-common
            sudo add-apt-repository -y ppa:redislabs/redis
            sudo apt-get update
            sudo apt-get install -y redis-stack-server

            # Modify the Redis Stack configuration file to allow connections from internal clients
            sudo sed -i "s/^bind .*/# bind 0.0.0.0/" /etc/redis/redis-stack.conf
            sudo sed -i "s/^protected-mode .*/protected-mode no/" /etc/redis/redis-stack.conf

            # TODO: ENABLE
            # echo "requirepass $REDIS_PASSWORD" | sudo tee -a /etc/redis/redis-stack.conf

            sudo systemctl enable redis-stack-server
            sudo systemctl restart redis-stack-server
        `,
        tags: ["redis"]
    })

    return redisInstance.networkInterfaces[0].networkIp
}
