# Use the official Playwright image as base
FROM mcr.microsoft.com/playwright:v1.47.2-jammy

# Set working directory
WORKDIR /work

# Set timezone environment variable
ENV TZ=Asia/Jerusalem
ENV DEBIAN_FRONTEND=noninteractive

# Install required packages and clean up
RUN apt-get update && \
    ln -fs /usr/share/zoneinfo/$TZ /etc/localtime && \
    apt-get install -y --no-install-recommends \
    tzdata \
    certbot \
    dnsutils && \
    dpkg-reconfigure -f noninteractive tzdata && \
    rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci || npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Define non-sensitive environment variables with defaults
ENV NPM_BASE_URL=""
ENV WILDCARDS=""

# Required environment variables that should be passed at runtime:
# - NPM_IDENTITY (Nginx Proxy Manager email)
# - NPM_SECRET (Nginx Proxy Manager password)
# - UD_USERNAME (United Domains username)
# - UD_PASSWORD (United Domains password)

# Create directory for certificates
RUN mkdir -p /root/kb-certs

# Set the command to run the application
CMD ["npm", "start"]
