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
        bootDisk: { initializeParams: { image: "debian-cloud/debian-11" } },
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

            sudo apt-get install lsb-release curl gpg
            curl -fsSL https://packages.redis.io/gpg | sudo gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg
            sudo chmod 644 /usr/share/keyrings/redis-archive-keyring.gpg
            echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/redis.list
            sudo apt-get update
            sudo apt-get install -y redis-stack-server

            sudo /bin/redis-stack-server

            redis-cli CONFIG SET requirepass "$REDIS_PASSWORD"
            CONFIG_FILE="/etc/redis-stack.conf"
            echo "bind 0.0.0.0" | sudo tee -a "$CONFIG_FILE" > /dev/null

            sudo systemctl restart redis-stack-server

        `,
        tags: ["redis"]
    })

    return redisInstance.networkInterfaces[0].networkIp
}
