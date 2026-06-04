FROM node:20-slim

WORKDIR /app

# Install Chromium and necessary dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-thai-tlwg \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tells Puppeteer to skip installing Chrome. We'll use the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
