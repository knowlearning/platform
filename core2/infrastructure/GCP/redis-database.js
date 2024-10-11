import * as gcp from "@pulumi/gcp"

export default function ({ REDIS_IP_ADDRESS, region }) {
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
        zone: `${region}-a`,
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
            # Update package lists and install Redis
            sudo apt-get update
            sudo apt-get install -y redis-server

            # Enable Redis service and allow connections from internal clients
            sudo sed -i "s/^bind .*/# bind 0.0.0.0/" /etc/redis/redis.conf
            sudo sed -i "s/^protected-mode .*/protected-mode no/" /etc/redis/redis.conf
            sudo systemctl enable redis-server
            sudo systemctl start redis-server
            sudo systemctl restart redis-server
        `,
        tags: ["redis"]
    })

    return redisInstance.networkInterfaces[0].networkIp
}
