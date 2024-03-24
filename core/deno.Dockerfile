FROM denoland/deno:1.40.4

# Copy local code to the container image.
COPY ./source/utils.js ./source/utils.js
RUN deno cache ./source/utils.js

COPY ./source ./source

RUN deno cache ./source/index.js

# Run the web service on container startup.
CMD [ \
  "deno", \
  "run", \
  "--allow-net", \
  "--allow-env", \
  "--allow-write", \
  "--allow-read", \
  "--unstable-worker-options", \
  "--v8-flags=--max-old-space-size=8000", \
  "./source/index.js" \
]
