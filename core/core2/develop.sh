#!/bin/bash

npm run dev --prefix ../sites/test2 &
npm run dev --prefix ../sites/benchmark &
docker compose -f ./infrastructure/docker-compose.yaml down
docker compose -f ./infrastructure/docker-compose.yaml up --build

wait
