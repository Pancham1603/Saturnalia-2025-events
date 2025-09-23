# Use Node.js official image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Ensure public folder exists and has correct permissions
RUN ls -la public/ || echo "Public folder check"

# Build the VitePress site
RUN npm install
RUN npm run build

# Debug: Check if assets were copied
RUN ls -la dist/ || echo "Dist folder check"