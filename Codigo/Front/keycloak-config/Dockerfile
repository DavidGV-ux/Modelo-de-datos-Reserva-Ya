# ReservaYa - Angular SSR on AWS Lambda (Lambda Web Adapter, Docker image).
# Docs: https://aws.github.io/aws-lambda-web-adapter/getting-started/docker-images.html

# Base oficial de AWS. Se usa el espejo de Docker Hub (variante ARM64) porque
# la descarga desde ECR Public es intermitente en este entorno.
FROM amazon/aws-lambda-nodejs:22-arm64

# Lambda Web Adapter (extension mode). Web server runs as the container main process.
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.0.1 /lambda-adapter /opt/extensions/lambda-adapter

# Self-contained Angular SSR bundle. server/ and browser/ MUST stay siblings:
# server.mjs resolves ../browser for static assets and JS preloads.
COPY dist/reserwaya/server/ /var/task/server/
COPY dist/reserwaya/browser/ /var/task/browser/

# The adapter proxies Lambda invocations to the port the web server listens on.
ENV PORT=8080

# Accept any Host header (demo). Replace with your custom domains once wired up.
ENV NG_ALLOWED_HOSTS=*

# Trust proxy headers (Lambda Web Adapter injects x-forwarded-*).
ENV NG_TRUST_PROXY_HEADERS=x-forwarded-for,x-forwarded-host,x-forwarded-proto,x-forwarded-port

# AWS managed base images must override ENTRYPOINT to start the web app directly.
ENTRYPOINT ["node", "/var/task/server/server.mjs"]