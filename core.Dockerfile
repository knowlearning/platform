FROM denoland/deno:1.40.4

# Copy local code to the container image.
COPY ./core/source/utils.js ./core/source/utils.js
RUN deno cache ./core/source/utils.js

COPY ./core/source ./core/source
COPY ./client ./client

RUN deno cache ./core/source/index.js

# Run the web service on container startup.
CMD [ "deno", "run", "--allow-net", "--allow-env", "--allow-write", "--allow-read", "--v8-flags=--max-old-space-size=8000", "./core/source/index.js" ]
