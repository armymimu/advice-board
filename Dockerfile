FROM node:20-slim

WORKDIR /app

# ไม่ต้องติดตั้ง Chromium อีกแล้ว — ใช้ HTTP GET แทน
# ประหยัด RAM และ build time มาก

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
