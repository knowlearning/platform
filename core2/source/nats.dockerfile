FROM nats:2.9.25-alpine3.18

# TODO: add certs from letsencrypt for dev and for prod purposes

COPY ./nats.conf /nats.conf
