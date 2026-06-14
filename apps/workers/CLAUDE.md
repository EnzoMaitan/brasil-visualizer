# CLAUDE.md — apps/workers

This directory contains all country workers. Each subdirectory is an independent Python
service that scrapes a country's public data and publishes it to RabbitMQ.

## Structure

```
workers/
  _template/    <- copy this to add a country; read its README.md first
  brazil/       <- implemented; uses IBGE, Tesouro, DataSUS, ANEEL
  usa/          <- future
```

## The only rule that matters here

**All country-specific knowledge lives inside fetch() in main.py.**
BaseWorker handles everything else. Do not add country logic to base_worker.py,
models.py, or any shared file.

## Shared indicator vocabulary

Always use the keys from CLAUDE.md (root) section 13 when naming indicators.
If you add a new key, update both the root CLAUDE.md table AND the _template README.

## Installing worker-sdk locally for development

```bash
cd packages/worker-sdk
pip install -e .
```

## Running a single worker locally (without Docker)

```bash
export RABBITMQ_URL=amqp://guest:guest@localhost:5672/
cd apps/workers/brazil
python main.py
```
