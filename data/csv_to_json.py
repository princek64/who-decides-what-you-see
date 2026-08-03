"""
Rebuilds data/flightlab-study-flights.json from
data/ux_research_flights_h2_2026_final.csv, matching the exact array-based
schema that data/verify_dataset.py checks: CSV columns minus 'currency',
plus a computed 'departure_mins_from_midnight' column appended at the end.
"""

import csv
import json

CSV_PATH = "data/ux_research_flights_h2_2026_final.csv"
JSON_PATH = "data/flightlab-study-flights.json"

NUMERIC_INT_FIELDS = {"duration_mins", "seats_remaining", "stops"}
NUMERIC_FLOAT_FIELDS = {"price_gbp", "co2_kg"}
DROPPED_FIELDS = {"currency"}


def get_dep_mins(time_str):
    if not time_str:
        return 0
    parts = time_str.split(":")
    if len(parts) < 2:
        return 0
    try:
        return int(parts[0]) * 60 + int(parts[1])
    except ValueError:
        return 0


with open(CSV_PATH, encoding="utf-8") as f:
    reader = csv.DictReader(f)
    csv_columns = reader.fieldnames
    rows = list(reader)

columns = [c for c in csv_columns if c not in DROPPED_FIELDS] + ["departure_mins_from_midnight"]

json_rows = []
co2_all = []
co2_excl_cancelled = []

for row in rows:
    out = []
    for col in columns[:-1]:
        val = row.get(col, "")
        if col in NUMERIC_INT_FIELDS:
            out.append(int(val) if val else 0)
        elif col in NUMERIC_FLOAT_FIELDS:
            out.append(float(val) if val else 0.0)
        else:
            out.append(val)
    out.append(get_dep_mins(row.get("departure_time", "")))
    json_rows.append(out)

    co2 = float(row["co2_kg"]) if row.get("co2_kg") else 0.0
    co2_all.append(co2)
    if row.get("flight_status") != "Cancelled":
        co2_excl_cancelled.append(co2)


def median(values):
    s = sorted(values)
    n = len(s)
    if n == 0:
        return 0.0
    mid = n // 2
    if n % 2 == 1:
        return s[mid]
    return (s[mid - 1] + s[mid]) / 2.0


meta = {
    "columns": columns,
    "medianCo2AllFlights": round(median(co2_all), 1),
    "medianCo2ExcludingCancelled": round(median(co2_excl_cancelled), 1),
}

with open(JSON_PATH, "w", encoding="utf-8") as f:
    json.dump({"meta": meta, "rows": json_rows}, f, separators=(",", ":"))

print(f"Wrote {len(json_rows)} rows, {len(columns)} columns to {JSON_PATH}")
print("meta:", meta["columns"])
print("medianCo2AllFlights:", meta["medianCo2AllFlights"])
print("medianCo2ExcludingCancelled:", meta["medianCo2ExcludingCancelled"])
