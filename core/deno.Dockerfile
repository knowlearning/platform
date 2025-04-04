FROM denoland/deno:1.43.1

RUN apt update && apt install -y procps

# Copy local code to the container image.
COPY ./source/utils.js ./source/utils.js
RUN deno cache ./source/utils.js

COPY ./source ./source

RUN deno cache ./source/index.js

# Run the web service on container startup.
CMD [ \
  "deno", \
  "run", \
  "--allow-sys", \
  "--allow-net", \
  "--allow-env", \
  "--allow-write", \
  "--allow-read", \
  "--allow-run", \
  "--unstable-worker-options", \
  "--v8-flags=--max-old-space-size=8000", \
  "./source/index.js" \
]
