FROM node:current-alpine3.24 AS base

FROM base as file-cache

COPY --link --exclude=config/ --exclude=saveprep-node/ . /orct2
COPY --link --exclude=config/ --exclude=distribution/ --exclude=node_modules/ saveprep-node /saveprep-node
COPY --link ./config /config
RUN mkdir -p /config/object/

# Build OpenRCT2
FROM base AS build-env
RUN apk add --no-cache gcc g++ make cmake nlohmann-json libzip-dev curl-dev fontconfig-dev icu-dev musl-dev linux-headers

WORKDIR /openrct2

COPY --link --from=file-cache /orct2 .

RUN mkdir build \
    && cd build \
    && cmake .. -DCMAKE_CXX_COMPILER=/usr/bin/g++ -DCMAKE_BUILD_TYPE=release -DCMAKE_INSTALL_PREFIX=/openrct2-install/usr -DCMAKE_INSTALL_LIBDIR=/openrct2-install/usr/lib -DDISABLE_OPENGL=ON -DDISABLE_GUI=ON -DENABLE_HEADERS_CHECK=OFF \
    && make -j8 graphics install \
    && rm /openrct2-install/usr/lib/libopenrct2.a

# Build nodejs app
FROM base AS node-build
WORKDIR /usr/src/saveprep
RUN apk add --no-cache pnpm
RUN --mount=target=/usr/src/saveprep/package.json,source=saveprep-node/package.json \
    --mount=target=/usr/src/saveprep/pnpm-lock.yaml,source=saveprep-node/pnpm-lock.yaml \
    --mount=target=/usr/src/saveprep/pnpm-workspace.yaml,source=saveprep-node/pnpm-workspace.yaml \
    pnpm ci
COPY --link --from=file-cache /saveprep-node .

RUN pnpm run build
RUN pnpm ci --prod

# Compose final image
FROM base AS deploy
HEALTHCHECK  --timeout=5s \
    CMD wget -nv -t1 --spider http://localhost:8080/healthcheck || exit 1
COPY --from=build-env /openrct2-install /
WORKDIR /usr/src/saveprep
COPY --from=file-cache --chown=node:node /config /home/node/.config/OpenRCT2/
COPY --from=node-build --chown=node:node /usr/src/saveprep /usr/src/saveprep
RUN apk add --no-cache rsync ca-certificates libpng libzip libcurl freetype fontconfig icu \
    && openrct2-cli --version \
    && ln -sf /game /rct2
USER node
EXPOSE 8080

CMD [ "node", "distribution/server/index.js" ]
