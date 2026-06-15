FROM python:3.12-slim

WORKDIR /app

# Install the internal worker-sdk package first (cached unless the SDK changes).
# Build context is the repo root (see docker-compose.brazil.yml).
COPY packages/worker-sdk /tmp/worker-sdk
RUN pip install --no-cache-dir /tmp/worker-sdk

# Install country-specific dependencies
COPY apps/workers/brazil/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy worker source
COPY apps/workers/brazil/ .

# Default to pipeline mode in the container; override with `snapshot` for the artifact.
CMD ["python", "main.py", "publish"]
