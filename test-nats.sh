curl -sf https://binaries.nats.dev/nats-io/natscli/nats | sh

nats server check connection -s nats://35.192.110.199:4222

nats sub -s "nats://35.192.110.199:4222" hello &
nats pub -s "nats://35.192.110.199:4222" hello world_4222