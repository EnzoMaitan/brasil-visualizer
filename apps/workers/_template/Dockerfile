FROM python:3.12-slim

WORKDIR /app

# Install the internal worker-sdk package first (cached unless SDK changes)
COPY ../../packages/worker-sdk /tmp/worker-sdk
RUN pip install --no-cache-dir /tmp/worker-sdk

# Install country-specific dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy worker source
COPY . .

CMD ["python", "main.py"]
