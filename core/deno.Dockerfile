FROM denoland/deno:1.43.1

# Install NATS server
RUN apt-get update && apt-get install -y wget && \
    wget https://github.com/nats-io/nats-server/releases/download/v2.9.17/nats-server-v2.9.17-linux-amd64.tar.gz && \
    tar -zxvf nats-server-v2.9.17-linux-amd64.tar.gz && \
    mv nats-server-v2.9.17-linux-amd64/nats-server /usr/local/bin/nats-server && \
    rm -rf nats-server-v2.9.17-linux-amd64* && \
    apt-get remove -y wget && apt-get autoremove -y

COPY ./source/utils.js ./source/utils.js
RUN deno cache ./source/utils.js
COPY ./source ./source
RUN deno cache ./source/index.js

CMD [ \
  "sh", "-c", \
  "nats-server -js -m 8222 & \n\
  deno run --allow-net --allow-env --allow-write --allow-read --unstable-worker-options --v8-flags=--max-old-space-size=8000 ./source/index.js" \
]