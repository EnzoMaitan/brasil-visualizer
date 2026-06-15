"""
seed_mongo.py — DEV/bootstrap loader: IBGE snapshot → local MongoDB.

⚠️ ARCHITECTURE NOTE. In the target design the **NestJS backend** consumes the worker's
RabbitMQ messages and owns every MongoDB write — "the worker only publishes to RabbitMQ; it
never writes to MongoDB directly" (CLAUDE.md §6 / design reference §6). That backend does
not exist yet. This script is a temporary stand-in so the generated IBGE snapshot can be
loaded into the local `mongo` Docker service (docker-compose.yml) for inspection and as a
fixture for backend development. It deliberately lives *outside* `BrazilWorker` and is NOT
part of the worker's publish path — `python main.py publish` remains the production route.

It writes the two collections the snapshot covers, exactly as CLAUDE.md §7 specifies:

  * ``snapshots`` — one document per region per period, indicators grouped by theme. Upserts
    one theme block at a time (``$set indicators.<theme>``), mirroring how the backend
    consumes per-theme messages — never overwriting a whole document.
  * ``countries`` — the registry document the frontend reads to discover levels/themes/etc.

(The third collection, ``geometries``, gets its unique index created but no data: this
worker collects indicators only.)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys

from pymongo import ASCENDING, MongoClient
from pymongo.database import Database
from pymongo.errors import ConfigurationError, PyMongoError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("seed-mongo")

DEFAULT_MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017/geodata")
DEFAULT_DB_NAME = "geodata"
DEFAULT_SNAPSHOT = os.path.join(os.path.dirname(__file__), "output", "snapshot-BR-ibge.json")


# ---------------------------------------------------------------------------- #
# Snapshot source: a saved JSON file, or a fresh fetch from IBGE
# ---------------------------------------------------------------------------- #

def load_snapshot_file(path: str) -> dict:
    logger.info("Loading snapshot from %s", path)
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def build_fresh_snapshot(limit: int | None = None) -> dict:
    """Run the IBGE pipeline now and assemble the snapshot in memory (no file needed)."""
    from main import BrazilWorker  # local import: reuse the worker's fetch()
    from snapshot import build_snapshot

    logger.info("Fetching a fresh snapshot from IBGE%s", f" (limit={limit})" if limit else "")
    regions = BrazilWorker(limit=limit).fetch()
    return build_snapshot(regions, worker="ibge")


# ---------------------------------------------------------------------------- #
# MongoDB
# ---------------------------------------------------------------------------- #

def get_database(mongo_url: str) -> tuple[MongoClient, Database]:
    client: MongoClient = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
    try:
        db = client.get_default_database()
        if db is None:
            raise ConfigurationError("no default database in URL")
    except ConfigurationError:
        db = client[DEFAULT_DB_NAME]
    return client, db


def ensure_indexes(db: Database) -> None:
    """Create the indexes documented in CLAUDE.md §7 (idempotent)."""
    db.snapshots.create_index(
        [("country_code", ASCENDING), ("level", ASCENDING), ("code", ASCENDING), ("period", ASCENDING)],
        unique=True,
        name="uq_country_level_code_period",
    )
    db.snapshots.create_index(
        [("country_code", ASCENDING), ("level", ASCENDING), ("period", ASCENDING)],
        name="map_wide_query",
    )
    db.countries.create_index([("country_code", ASCENDING)], unique=True, name="uq_country")
    db.geometries.create_index(
        [("country_code", ASCENDING), ("level", ASCENDING), ("code", ASCENDING)],
        unique=True,
        name="uq_country_level_code",
    )
    logger.info("Ensured indexes on snapshots / countries / geometries")


def upsert_snapshot(db: Database, snapshot: dict, *, drop: bool = False) -> dict:
    """Upsert the registry + per-region snapshot documents. Returns a small summary."""
    registry = snapshot["registry"]
    country_code = registry["country_code"]

    if drop:
        deleted = db.snapshots.delete_many({"country_code": country_code}).deleted_count
        logger.info("Dropped %d existing %s snapshot documents", deleted, country_code)

    region_count = 0
    theme_writes = 0
    for region in snapshot["snapshots"]:
        identity = {
            "country_code": region["country_code"],
            "level": region["level"],
            "code": region["code"],
            "period": region["period"],
        }
        common = {
            "parent_code": region.get("parent_code"),
            "abbrev": region.get("abbrev"),
            "name": region.get("name"),
            "fetched_at": region.get("fetched_at"),
        }
        # One upsert per theme block — same granularity the backend consumer uses.
        for theme, block in region["indicators"].items():
            db.snapshots.update_one(
                identity,
                {"$set": {**identity, **common, f"indicators.{theme}": block}},
                upsert=True,
            )
            theme_writes += 1
        region_count += 1

    db.countries.update_one(
        {"country_code": country_code},
        {"$set": registry},
        upsert=True,
    )

    return {
        "country_code": country_code,
        "regions_upserted": region_count,
        "theme_blocks_written": theme_writes,
        "snapshots_in_db": db.snapshots.count_documents({"country_code": country_code}),
    }


# ---------------------------------------------------------------------------- #
# CLI
# ---------------------------------------------------------------------------- #

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Load an IBGE snapshot into local MongoDB")
    parser.add_argument(
        "--snapshot",
        default=DEFAULT_SNAPSHOT,
        help=f"path to the snapshot JSON (default: {DEFAULT_SNAPSHOT})",
    )
    parser.add_argument(
        "--fetch",
        action="store_true",
        help="fetch a fresh snapshot from IBGE instead of reading --snapshot",
    )
    parser.add_argument(
        "--mongo-url",
        default=DEFAULT_MONGO_URL,
        help=f"MongoDB connection URL (default: {DEFAULT_MONGO_URL})",
    )
    parser.add_argument("--drop", action="store_true", help="delete existing docs for this country first")
    parser.add_argument("--limit", type=int, default=None, help="with --fetch, only the first N UFs")
    args = parser.parse_args(argv)

    if args.fetch:
        snapshot = build_fresh_snapshot(limit=args.limit)
    elif os.path.exists(args.snapshot):
        snapshot = load_snapshot_file(args.snapshot)
    else:
        logger.error("Snapshot file not found: %s (use --fetch to generate one)", args.snapshot)
        return 1

    try:
        client, db = get_database(args.mongo_url)
        client.admin.command("ping")  # fail fast if Mongo is unreachable
        logger.info("Connected to MongoDB at %s (db=%s)", args.mongo_url, db.name)
        ensure_indexes(db)
        summary = upsert_snapshot(db, snapshot, drop=args.drop)
    except PyMongoError as exc:
        logger.error("MongoDB error: %s", exc)
        logger.error("Is the `mongo` container up? `docker compose up -d mongo`")
        return 1
    finally:
        try:
            client.close()
        except NameError:
            pass

    logger.info(
        "Loaded %s: %d regions, %d theme blocks, %d snapshot docs now in db.snapshots",
        summary["country_code"],
        summary["regions_upserted"],
        summary["theme_blocks_written"],
        summary["snapshots_in_db"],
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
