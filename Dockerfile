FROM node:20-slim

WORKDIR /app

# .npmrc aponta o escopo @kyvvohq pro GitHub Packages; o token entra só neste
# layer via secret de build (docker build --secret id=npm_token,env=NPM_PACKAGES_TOKEN),
# nunca fica na imagem.
COPY package.json package-lock.json* .npmrc ./
RUN --mount=type=secret,id=npm_token \
    NPM_PACKAGES_TOKEN="$(cat /run/secrets/npm_token 2>/dev/null || true)" \
    npm install --omit=dev

COPY . .
RUN rm -f .npmrc

EXPOSE 3002

CMD ["node", "index.js"]
