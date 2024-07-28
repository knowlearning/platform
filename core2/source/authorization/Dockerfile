FROM denoland/deno:1.43.1

COPY ./index.js ./index.js
RUN deno cache ./index.js

COPY ./ ./

CMD [ \
  "deno", \
  "run", \
  "--allow-net", \
  "--allow-env", \
  "--allow-write", \
  "--allow-read", \
  "--unstable-worker-options", \
  "--v8-flags=--max-old-space-size=8000", \
  "./index.js" \
]
