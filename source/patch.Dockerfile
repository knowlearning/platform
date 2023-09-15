FROM node:18.12.1

# install a more performant package manager
RUN npm install -g pnpm@8.1.1

WORKDIR /patch

ENV CACHE_DIRECTORY="/tmp/core"

RUN mkdir -p /tmp/core

# dependencies for patch server functionality
RUN pnpm install --dir / \
    @kubernetes/client-node@0.17.1 \
    @codemirror/state@6.1.2 \
    core-js@3.25.5 \
    ws@8.8.1 \
    uuid@9.0.0 \
    rollup@3.18.0 \
    jsdom@20.0.0 \
    fast-json-patch@3.1.1 \
    node-fetch@3.2.10 \
    vite@4.2.1 \
    @rollup/plugin-node-resolve@15.0.1 \
    @rollup/plugin-commonjs@24.0.1 \
    @vitejs/plugin-vue@4.0.0 \
    vue@3.2.39 \
    @ironkinoko/rollup-plugin-styles@4.0.3 \
    @rollup/plugin-replace@5.0.2 \
    @rollup/plugin-json@6.0.0 \
    @rollup/plugin-image@3.0.2 \
    rollup-plugin-polyfill-node@0.12.0

# pre-install so home content builds faster
RUN pnpm install --dir /tmp/core \
    firebase@9.12.1 \
    vue@3.2.39 \
    fast-json-patch@3.1.1 \
    uuid@9.0.0

# Copy local code to the container image.
COPY ./patch ./patch
COPY ./lib ./lib

# make viewers available in the correct path to share installed modules
# that are peer dependencies
COPY ./lib /tmp/core

# required for janky nodejs module support
RUN echo '{ "type": "module" }' > package.json

# Run the web service on container startup.
CMD [ "node", "./patch/index.js" ]
