FROM denoland/deno:2.0.0

COPY ./externals.js ./externals.js
RUN deno cache ./externals.js

COPY ./ ./

CMD [ \
  "deno", \
  "run", \
  "--allow-sys", \
  "--allow-net", \
  "--allow-env", \
  "--allow-write", \
  "--allow-read", \
  "--unstable-worker-options", \
  "--v8-flags=--max-old-space-size=8000", \
  "./index.js" \
]
