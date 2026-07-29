import csv
import json
import sys

csv_path = 'data/ux_research_flights_h2_2026_final.csv'
json_path = 'data/flightlab-study-flights.json'

print("Starting verification of CSV vs array-based JSON...")

# 1. Load JSON
try:
    with open(json_path, encoding='utf-8') as f:
        json_data = json.load(f)
except Exception as e:
    print(f"FAILED: Could not load JSON file: {e}")
    sys.exit(1)

# 2. Load CSV
try:
    with open(csv_path, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        csv_rows = list(reader)
except Exception as e:
    print(f"FAILED: Could not load CSV file: {e}")
    sys.exit(1)

# A. Row count check
csv_row_count = len(csv_rows)
json_rows = json_data.get('rows', [])
json_row_count = len(json_rows)

print(f"CSV Rows: {csv_row_count}, JSON Rows: {json_row_count}")
if csv_row_count != json_row_count:
    print(f"FAILED: Row count mismatch! CSV={csv_row_count}, JSON={json_row_count}")
    sys.exit(1)

# B. Map column names to index
columns = json_data.get('meta', {}).get('columns', [])
print(f"JSON columns: {columns}")
col_map = {name: idx for idx, name in enumerate(columns)}

# C. Helper function to parse departure minutes
def get_dep_mins(time_str):
    if not time_str:
        return 0
    parts = time_str.split(':')
    if len(parts) < 2:
        return 0
    try:
        return int(parts[0]) * 60 + int(parts[1])
    except ValueError:
        return 0

# D. Distributions and validations
csv_dests = {}
json_dests = {}

csv_dates = {}
json_dates = {}

csv_dirs = {}
json_dirs = {}

csv_statuses = {}
json_statuses = {}

csv_cabins = {}
json_cabins = {}

csv_stops = {}
json_stops = {}

cancelled_csv_count = 0
cancelled_json_count = 0

print("Verifying individual row values and accumulating distributions...")

for idx, (csv_row, json_row) in enumerate(zip(csv_rows, json_rows)):
    # Verify row length matches columns length
    if len(json_row) != len(columns):
        print(f"FAILED: Row {idx} has length {len(json_row)} but columns count is {len(columns)}!")
        sys.exit(1)

    # 1. Flight ID
    csv_id = csv_row.get('flight_id', '')
    json_id = json_row[col_map['flight_id']]
    if csv_id != json_id:
        print(f"FAILED: Flight ID mismatch at index {idx}! CSV='{csv_id}', JSON='{json_id}'")
        sys.exit(1)
        
    # 2. Status check
    csv_status = csv_row.get('flight_status', '')
    json_status = json_row[col_map['flight_status']]
    if csv_status != json_status:
        print(f"FAILED: Flight status mismatch for ID {csv_id}! CSV='{csv_status}', JSON='{json_status}'")
        sys.exit(1)
    if csv_status == 'Cancelled':
        cancelled_csv_count += 1
    if json_status == 'Cancelled':
        cancelled_json_count += 1
        
    # 3. Numeric Conversions
    # price_gbp
    try:
        csv_price = float(csv_row['price_gbp']) if csv_row['price_gbp'] else 0.0
    except ValueError:
        csv_price = 0.0
    json_price = json_row[col_map['price_gbp']]
    if abs(csv_price - json_price) > 1e-9:
        print(f"FAILED: Price mismatch for ID {csv_id}! CSV={csv_price}, JSON={json_price}")
        sys.exit(1)
        
    # duration_mins
    try:
        csv_dur = int(csv_row['duration_mins']) if csv_row['duration_mins'] else 0
    except ValueError:
        csv_dur = 0
    json_dur = json_row[col_map['duration_mins']]
    if csv_dur != json_dur:
        print(f"FAILED: Duration mins mismatch for ID {csv_id}! CSV={csv_dur}, JSON={json_dur}")
        sys.exit(1)
        
    # seats_remaining
    try:
        csv_seats = int(csv_row['seats_remaining']) if csv_row['seats_remaining'] else 0
    except ValueError:
        csv_seats = 0
    json_seats = json_row[col_map['seats_remaining']]
    if csv_seats != json_seats:
        print(f"FAILED: Seats remaining mismatch for ID {csv_id}! CSV={csv_seats}, JSON={json_seats}")
        sys.exit(1)
        
    # stops
    try:
        csv_stop = int(csv_row['stops']) if csv_row['stops'] else 0
    except ValueError:
        csv_stop = 0
    json_stop = json_row[col_map['stops']]
    if csv_stop != json_stop:
        print(f"FAILED: Stops mismatch for ID {csv_id}! CSV={csv_stop}, JSON={json_stop}")
        sys.exit(1)
        
    # co2_kg
    try:
        csv_co2 = float(csv_row['co2_kg']) if csv_row['co2_kg'] else 0.0
    except ValueError:
        csv_co2 = 0.0
    json_co2 = json_row[col_map['co2_kg']]
    if abs(csv_co2 - json_co2) > 1e-9:
        print(f"FAILED: CO2 mismatch for ID {csv_id}! CSV={csv_co2}, JSON={json_co2}")
        sys.exit(1)

    # departure_mins_from_midnight
    expected_dep_mins = get_dep_mins(csv_row.get('departure_time', ''))
    json_dep_mins = json_row[col_map['departure_mins_from_midnight']]
    if expected_dep_mins != json_dep_mins:
        print(f"FAILED: Departure mins from midnight mismatch for ID {csv_id}! Expected={expected_dep_mins}, JSON={json_dep_mins}")
        sys.exit(1)

    # 4. Retained String fields
    # date
    if csv_row.get('date', '') != json_row[col_map['date']]:
        print(f"FAILED: Date mismatch for ID {csv_id}! CSV='{csv_row.get('date')}', JSON='{json_row[col_map['date']]}'")
        sys.exit(1)
    # arrival_date
    if csv_row.get('arrival_date', '') != json_row[col_map['arrival_date']]:
        print(f"FAILED: Arrival date mismatch for ID {csv_id}! CSV='{csv_row.get('arrival_date')}', JSON='{json_row[col_map['arrival_date']]}'")
        sys.exit(1)
    # departure_time
    if csv_row.get('departure_time', '') != json_row[col_map['departure_time']]:
        print(f"FAILED: Departure time mismatch for ID {csv_id}! CSV='{csv_row.get('departure_time')}', JSON='{json_row[col_map['departure_time']]}'")
        sys.exit(1)
    # arrival_time
    if csv_row.get('arrival_time', '') != json_row[col_map['arrival_time']]:
        print(f"FAILED: Arrival time mismatch for ID {csv_id}! CSV='{csv_row.get('arrival_time')}', JSON='{json_row[col_map['arrival_time']]}'")
        sys.exit(1)
        
    # Check that other string fields are retained correctly
    for field in ['flight_number', 'origin_code', 'origin_terminal', 'dest_code', 'duration_formatted', 'direction', 'airline_name', 'airline_tier', 'aircraft_type', 'layover_details', 'cabin_class', 'baggage_policy', 'meal', 'flexibility_policy', 'demand_indicator']:
        if csv_row.get(field, '') != json_row[col_map[field]]:
            print(f"FAILED: Field '{field}' mismatch for ID {csv_id}! CSV='{csv_row.get(field)}', JSON='{json_row[col_map[field]]}'")
            sys.exit(1)

    # Accumulate distributions
    csv_dests[csv_row.get('dest_code', '')] = csv_dests.get(csv_row.get('dest_code', ''), 0) + 1
    json_dests[json_row[col_map['dest_code']]] = json_dests.get(json_row[col_map['dest_code']], 0) + 1
    
    csv_dates[csv_row.get('date', '')] = csv_dates.get(csv_row.get('date', ''), 0) + 1
    json_dates[json_row[col_map['date']]] = json_dates.get(json_row[col_map['date']], 0) + 1
    
    csv_dirs[csv_row.get('direction', '')] = csv_dirs.get(csv_row.get('direction', ''), 0) + 1
    json_dirs[json_row[col_map['direction']]] = json_dirs.get(json_row[col_map['direction']], 0) + 1
    
    csv_statuses[csv_row.get('flight_status', '')] = csv_statuses.get(csv_row.get('flight_status', ''), 0) + 1
    json_statuses[json_row[col_map['flight_status']]] = json_statuses.get(json_row[col_map['flight_status']], 0) + 1
    
    csv_cabins[csv_row.get('cabin_class', '')] = csv_cabins.get(csv_row.get('cabin_class', ''), 0) + 1
    json_cabins[json_row[col_map['cabin_class']]] = json_cabins.get(json_row[col_map['cabin_class']], 0) + 1
    
    csv_stops[csv_row.get('stops', '0')] = csv_stops.get(csv_row.get('stops', '0'), 0) + 1
    json_stops[str(json_row[col_map['stops']])] = json_stops.get(str(json_row[col_map['stops']]), 0) + 1

# E. Check Cancelled count
print(f"Cancelled rows check: CSV={cancelled_csv_count}, JSON={cancelled_json_count}")
if cancelled_csv_count != cancelled_json_count:
    print(f"FAILED: Cancelled flight count mismatch! CSV={cancelled_csv_count}, JSON={cancelled_json_count}")
    sys.exit(1)

# F. Verify distributions
def verify_dist(name, csv_d, json_d):
    if csv_d != json_d:
        print(f"FAILED: Distribution mismatch for '{name}'!")
        print(f"CSV: {csv_d}")
        print(f"JSON: {json_d}")
        sys.exit(1)
    print(f"Distribution '{name}' matches ({len(csv_d)} classes)")

verify_dist("destination_code", csv_dests, json_dests)
verify_dist("date", csv_dates, json_dates)
verify_dist("direction", csv_dirs, json_dirs)
verify_dist("flight_status", csv_statuses, json_statuses)
verify_dist("cabin_class", csv_cabins, json_cabins)
verify_dist("stops", csv_stops, json_stops)

# G. Verify median CO2 values computed in JSON metadata
print("Verifying median CO2 metadata values...")
expected_median_all = 78.6
expected_median_excl_cancelled = 78.6

if abs(json_data.get('meta', {}).get('medianCo2AllFlights', 0.0) - expected_median_all) > 1e-9:
    print(f"FAILED: medianCo2AllFlights metadata mismatch! Expected={expected_median_all}, Got={json_data.get('meta', {}).get('medianCo2AllFlights')}")
    sys.exit(1)
    
if abs(json_data.get('meta', {}).get('medianCo2ExcludingCancelled', 0.0) - expected_median_excl_cancelled) > 1e-9:
    print(f"FAILED: medianCo2ExcludingCancelled metadata mismatch! Expected={expected_median_excl_cancelled}, Got={json_data.get('meta', {}).get('medianCo2ExcludingCancelled')}")
    sys.exit(1)

print("\nSUCCESS: All verifications passed successfully! CSV and array-based JSON are identical in row counts, columns, types, conversions, and distributions.")
sys.exit(0)
