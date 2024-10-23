import * as gcp from "@pulumi/gcp"

export default function ({ REDIS_IP_ADDRESS, zone }) {
    const region = zone.split('-').slice(0, -1).join('-')

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

            REDIS_STACK_VERSION="7.4.0-v1"
            REDIS_STACK_BUILD="bullseye.x86_64"
            FILE_URL="https://packages.redis.io/redis-stack/redis-stack-server-$REDIS_STACK_VERSION.$REDIS_STACK_BUILD.tar.gz"
            INSTALL_DIR="/bin/redis-stack-server"
            SERVICE_FILE="/etc/systemd/system/redis-stack-server.service"

            echo "Downloading Redis Stack Server version $REDIS_STACK_VERSION..."
            wget -O redis-stack-server-$REDIS_STACK_VERSION.$REDIS_STACK_BUILD.tar.gz $FILE_URL

            echo "Extracting Redis Stack Server..."
            tar -xzf redis-stack-server-$REDIS_STACK_VERSION.$REDIS_STACK_BUILD.tar.gz

            echo "Moving Redis Stack Server to $INSTALL_DIR..."
            sudo mv redis-stack-server-$REDIS_STACK_VERSION $INSTALL_DIR

            if ! getent group redis > /dev/null 2>&1; then
                echo "Creating redis group..."
                sudo groupadd redis
            fi

            if ! id "redis" &>/dev/null; then
                echo "Creating redis user..."
                sudo useradd --system --gid redis --home-dir /nonexistent --shell /bin/false redis
            fi

            echo "Setting ownership of Redis Stack Server files..."
            sudo chown -R redis:redis $INSTALL_DIR

            echo "Creating systemd service file..."
            sudo tee $SERVICE_FILE > /dev/null <<EOL
[Unit]
Description=Redis Stack Server
After=network.target

[Service]
ExecStart=$INSTALL_DIR/bin/redis-stack-server
Restart=always
User=redis
Group=redis
WorkingDirectory=$INSTALL_DIR
LimitNOFILE=65536
TimeoutStopSec=10
RestartSec=5

[Install]
WantedBy=multi-user.target
EOL

            echo "Reloading systemd daemon..."
            sudo systemctl daemon-reload

            echo "Enabling and starting Redis Stack Server service..."
            sudo systemctl enable redis-stack-server
            sudo systemctl start redis-stack-server

            /bin/redis-stack-server/bin/redis-cli CONFIG SET requirepass "$REDIS_PASSWORD"
            CONFIG_FILE="/etc/redis-stack.conf"
            echo "bind 0.0.0.0" | sudo tee -a "$CONFIG_FILE" > /dev/null

            sudo systemctl restart redis-stack-server
        `,
        tags: ["redis"]
    })

    return redisInstance.networkInterfaces[0].networkIp
}
