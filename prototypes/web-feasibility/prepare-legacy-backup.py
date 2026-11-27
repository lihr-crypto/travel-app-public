"""Read an existing native backup into an ignored local probe fixture.

Original database is opened read-only. Every raw table row is also retained,
including binding/migration rows and pre-existing reference problems.
"""
import argparse
import hashlib
import json
import sqlite3
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--database", type=Path, required=True)
parser.add_argument("--source-label", default="原生 App 只读备份；数据时点以源文件与核对记录为准")
parser.add_argument("--output", type=Path, default=Path(__file__).parent / "private/legacy-backup.json")
args = parser.parse_args()
database = args.database.resolve()
connection = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)
connection.row_factory = sqlite3.Row
connection.execute("PRAGMA query_only = ON")
tables = [r[0] for r in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
raw = {name: [dict(row) for row in connection.execute('SELECT * FROM "' + name.replace('"', '""') + '" ORDER BY rowid')] for name in tables}
integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
foreign_keys = [list(row) for row in connection.execute("PRAGMA foreign_key_check")]
connection.close()

stamp = lambda row: {"createdAt": row["created_at"], "updatedAt": row["updated_at"]}
state = {
    "trips": [{"id": r["id"], "title": r["title"], "startDate": r["start_date"], "endDate": r["end_date"], "mapRegion": r["map_region"], "note": r["note"], **stamp(r)} for r in raw["trips"]],
    "days": [{"id": r["id"], "tripId": r["trip_id"], "date": r["date"], "dayIndex": r["day_index"], **stamp(r)} for r in raw["days"]],
    "items": [{"id": r["id"], "tripId": r["trip_id"], "dayId": r["day_id"], "placeId": r["place_id"], "type": r["type"], "title": r["title"], "sortOrder": r["sort_order"], "timeMode": r["time_mode"], "startDateTime": r["start_datetime"], "endDateTime": r["end_datetime"], "period": r["period"], "isFixed": bool(r["is_fixed"]), "note": r["note"], "payload": json.loads(r["payload_json"]) if r["payload_json"] is not None else None, **stamp(r)} for r in raw["items"]],
    "places": [{"id": r["id"], "name": r["name"], "coordinate": {"latitude": r["latitude"], "longitude": r["longitude"], "system": r["coordinate_system"]}, "address": r["address"], "provider": r["provider"], "providerPlaceId": r["provider_place_id"], "metadata": json.loads(r["metadata_json"]) if r["metadata_json"] is not None else None, **stamp(r)} for r in raw["places"]],
    "extras": {"sourceTables": raw, "sourceIntegrityCheck": integrity, "sourceForeignKeyProblems": foreign_keys},
}
backup = {"format": "travel-web-prototype-backup", "schemaVersion": 1, "source": args.source_label, "state": state}
target = args.output
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(backup, ensure_ascii=False, separators=(",", ":")) + "\n")
target.chmod(0o600)
print(json.dumps({"output": str(target.resolve()), "rowCounts": {name: len(rows) for name, rows in raw.items()}, "integrity": integrity, "preExistingForeignKeyProblems": len(foreign_keys), "exportSHA256": hashlib.sha256(target.read_bytes()).hexdigest()}, ensure_ascii=False))

