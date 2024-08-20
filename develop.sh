#!/bin/bash

npm run dev --prefix sites/test2 &
docker compose --env-file ./core2/infrastructure/.credentials/.env -f ./core2/infrastructure/docker-compose.yaml down
docker compose --env-file ./core2/infrastructure/.credentials/.env -f ./core2/infrastructure/docker-compose.yaml up --build

wait
