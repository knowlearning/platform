import * as gcp from "@pulumi/gcp"

export default function ({ POSTGRES_IP_ADDRESS, zone }) {
    const region = zone.split('-').slice(0, -1).join('-')

    new gcp.compute.Address("postgres-static-ip", {
        address: POSTGRES_IP_ADDRESS,
        region,
        addressType: "INTERNAL",
        subnetwork: "default",
        purpose: "GCE_ENDPOINT"
    })

    // Create a firewall rule to allow internal traffic
    new gcp.compute.Firewall("allow-postgres-internal", {
        network: "default",  // Use the default network
        allows: [{
            protocol: "tcp",
            ports: ["5432"],  // Allow traffic on Redis port
        }],
        sourceRanges: ["10.128.0.0/9"],  // Allow traffic from all IPs within the VPC (default network's range)
        direction: "INGRESS",
        targetTags: ["postgres"]  // Apply the firewall rule to instances with the "redis" tag
    })

    new gcp.compute.Instance("postgres-instance", {
        machineType: "e2-micro",
        zone,
        bootDisk: { initializeParams: { image: "debian-cloud/debian-12" } },
        networkInterfaces: [{
            network: 'default',
            subnetwork: 'default',
            networkIp: POSTGRES_IP_ADDRESS,
            accessConfigs: [{}]
        }],
        metadataStartupScript: `#!/bin/bash

            POSTGRES_PASSWORD=$(gcloud secrets versions access latest --secret=POSTGRES_PASSWORD)
            sudo apt-get update
            sudo apt-get install -y postgresql-15 postgresql-contrib
            sudo systemctl enable postgresql
            sudo systemctl start postgresql
            sudo -u postgres psql -c "ALTER USER postgres PASSWORD '$POSTGRES_PASSWORD';"
            # Listen for all addresses to allow external connections within VPC
            echo "listen_addresses='*'" | sudo tee -a /etc/postgresql/15/main/postgresql.conf
            sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/g" /etc/postgresql/15/main/postgresql.conf
            sudo tee -a /etc/postgresql/15/main/pg_hba.conf <<EOL
host    all             all             0.0.0.0/0            md5
EOL
            sudo systemctl restart postgresql
        `,
        serviceAccount: {
            scopes: ["https://www.googleapis.com/auth/cloud-platform"]
        },
        tags: ["postgres"]
    })
}
