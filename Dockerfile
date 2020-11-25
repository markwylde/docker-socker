FROM node:14-alpine

WORKDIR /app

COPY package-lock.json package-lock.json
COPY package.json package.json

RUN apk add iptables redsocks

RUN npm install

COPY . .

CMD node index.js
