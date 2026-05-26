FROM denoland/deno:2.2.7

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
  "--v8-flags=--max-old-space-size=8000", \
  "./source/index.js" \
]
