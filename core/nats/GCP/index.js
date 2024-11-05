import * as gcp from "@pulumi/gcp"

const startupScript = `#!/bin/bash

docker run -d --name nats-node -p 4222:4222 nats:2.10.21
`

const containerInstance = new gcp.compute.Instance("nats-node", {
    machineType: "e2-micro",
    zone: "us-central1-a",
    bootDisk: {
        initializeParams: { image: "cos-cloud/cos-stable" }
    },
    networkInterfaces: [{
        network: "default",
        accessConfigs: [{}] // Enables external IP
    }],
    metadata: {
        "startup-script": startupScript
    }
})
