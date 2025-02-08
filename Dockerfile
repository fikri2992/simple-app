FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV GCS_BUCKET_NAME="bestie-storage"  

CMD ["node", "index.js"]