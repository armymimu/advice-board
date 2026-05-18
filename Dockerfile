FROM ghcr.io/puppeteer/puppeteer:24.0.0

WORKDIR /usr/src/app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Expose port
EXPOSE 10000

# Set environment variables
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV NODE_ENV=production

CMD ["node", "server.js"]
