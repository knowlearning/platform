#!/bin/bash

npm run dev --prefix sites/test2 &
npm run dev --prefix sites/benchmark &
docker compose -f ./core2/infrastructure/docker-compose.yaml down
docker compose -f ./core2/infrastructure/docker-compose.yaml up --build

wait
