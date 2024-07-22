NATS_NETWORK=nats
POSTRGES_PASSWORD=insecure-development-password

# Make current directory the script directory
script_dir=$(dirname "$(readlink -f "$0")")
cd "$script_dir"

# Create network if doesn't exist
docker network ls | grep -q $NATS_NETWORK || docker network create nats

# start GCS emulator
docker stop gcs-emulator 2>/dev/null
docker rm gcs-emulator 2>/dev/null
docker run -d --rm --name gcs-emulator -p 4443:4443 fsouza/fake-gcs-server

# Start NATS server
docker stop nats 2>/dev/null
docker rm nats 2>/dev/null
docker run -d --rm --name nats --network $NATS_NETWORK -p 4222:4222 -p 8222:8222 nats --http_port 8222

# Start Postgres server
docker stop postgres 2>/dev/null
docker rm postgres 2>/dev/null
docker run -d --name postgres -e POSTGRES_PASSWORD=$POSTRGES_PASSWORD postgres

# Start Authorization server
docker stop authorization 2>/dev/null
docker rm authorization 2>/dev/null
docker build -t authorization -f ../source/authorization.dockerfile ../source/
docker run -d --name authorization -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD authorization