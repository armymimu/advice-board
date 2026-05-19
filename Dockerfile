FROM node:20-slim

# Install Chromium + Thai fonts
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-khmeros \
    fonts-kacst fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./

# Use system Chromium, skip Puppeteer's bundled download
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN npm ci --omit=dev

COPY . .

EXPOSE 10000
ENV PORT=10000
ENV NODE_ENV=production
ENV RENDER_EXTERNAL_URL=https://advice-board.onrender.com

CMD ["node", "server.js"]
