FROM denoland/deno:2.2.7

RUN apt update && apt install -y procps

# Copy local code to the container image.
COPY ./deno.json ./deno.lock ./
COPY ./source ./source

RUN deno install --frozen --entrypoint ./source/index.js ./source/domain-worker/index.js

# Run the web service on container startup.
CMD [ \
  "deno", \
  "run", \
  "--config", \
  "./deno.json", \
  "--frozen", \
  "--cached-only", \
  "--allow-sys", \
  "--allow-net", \
  "--allow-env", \
  "--allow-write", \
  "--allow-read", \
  "--allow-run", \
  "--v8-flags=--max-old-space-size=8000", \
  "./source/index.js" \
]
