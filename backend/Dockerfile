FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/data

EXPOSE 4000

CMD ["node", "server.js"]
