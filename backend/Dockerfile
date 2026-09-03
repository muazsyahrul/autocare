FROM node:20-alpine

# Install build tools needed for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY . .

# Data directory for SQLite file
RUN mkdir -p /app/data

EXPOSE 4000

CMD ["node", "server.js"]
