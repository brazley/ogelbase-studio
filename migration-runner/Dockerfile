FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy migration files
COPY apply-migration-008.mjs ./
COPY migration-008.sql ./

# Run migration
CMD ["node", "apply-migration-008.mjs"]
