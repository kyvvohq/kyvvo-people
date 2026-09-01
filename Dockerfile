FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3002

CMD ["node", "index.js"]
