FROM denoland/deno:2.2.7

RUN apt update && apt install -y procps

# Copy local code to the container image.
COPY ./deno.json ./deno.lock ./
COPY ./infrastructure/local/start-api.sh /usr/local/bin/start-api.sh
COPY ./source ./source

RUN chmod +x /usr/local/bin/start-api.sh

RUN deno install --frozen --entrypoint ./source/index.js ./source/domain-worker/index.js

# Run the web service on container startup.
CMD ["/usr/local/bin/start-api.sh"]
