FROM node:18.12.1

RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/ sh

WORKDIR /app

RUN npm install \
  @kubernetes/client-node@0.18.1 \
  @google-cloud/storage@5.18.2 \
  fast-json-patch@3.1.0 \
  jsonwebtoken@8.5.1 \
  node-fetch@3.2.0 \
  ws@8.2.3 \
  yaml@2.2.1 \
  redis@4.2.0 \
  uuid@9.0.0 \
  jwk-to-pem@2.0.5 \
  tweetnacl@1.0.3 \
  lodash@4.17.21 \
  pg@8.11.0 \
  acme-client@5.0.0

# Copy local code to the container image.
COPY ./core/source ./core/source
COPY ./client ./client

# required for janky nodejs module support
RUN echo '{ "type": "module" }' > ./core/source/package.json

# Run the web service on container startup.
CMD [ "node", "--max-old-space-size=8000", "./core/source/index.js" ]
