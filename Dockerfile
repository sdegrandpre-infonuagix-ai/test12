# ── Build stage ────────────────────────────────────────────────────────────────
FROM public.ecr.aws/lambda/nodejs:20 AS base

WORKDIR ${LAMBDA_TASK_ROOT}

# Copy dependency manifests first (layer cache)
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# ── App stage ──────────────────────────────────────────────────────────────────
COPY app.js        ./
COPY lambda.js     ./
COPY db.js         ./
COPY mcp-tools.js  ./
COPY ws-broadcast.js ./
COPY ws-handler.js ./
COPY web.js        ./
COPY public/       ./public/

# Lambda handler: file.export  →  lambda.handler
CMD ["lambda.handler"]
