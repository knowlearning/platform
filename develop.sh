#!/bin/bash

npm run dev --prefix sites/test2 &
docker compose -f ./core2/infrastructure/docker-compose.yaml down
docker compose -f ./core2/infrastructure/docker-compose.yaml up --build

wait
