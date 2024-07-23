NATS_NETWORK=nats
POSTGRES_PASSWORD=insecure-development-password

# Make current directory the script directory
script_dir=$(cd "$(dirname "$0")" && pwd)
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
docker build -t nats -f ../source/nats.dockerfile ../source/
docker run -d --rm --name nats --network $NATS_NETWORK -p 4222:4222 -p 8222:8222 -p 8080:8080 nats -c /nats.conf

# Start Postgres server
docker stop postgres 2>/dev/null
docker rm postgres 2>/dev/null
docker run -d --name postgres -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD postgres

# Start Authorization server
docker stop authorization 2>/dev/null
docker rm authorization 2>/dev/null
docker build -t authorization -f ../source/authorization.dockerfile ../source/
docker run -d --name authorization -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD authorization
