"""
Manipulates EXISTING records in the flight dataset to make three benchmark
tasks work properly. Does not add new rows, only edits values on rows that
already match the target routes (outbound legs to the target destination).

Column names below match the real CSV
(data/ux_research_flights_h2_2026_final.csv):
  flight_id,flight_number,origin_code,origin_terminal,dest_code,date,
  departure_time,arrival_time,arrival_date,duration_mins,duration_formatted,
  direction,airline_name,airline_tier,aircraft_type,stops,layover_details,
  cabin_class,price_gbp,currency,seats_remaining,baggage_policy,meal,
  flexibility_policy,co2_kg,demand_indicator,flight_status
"""

import pandas as pd
import numpy as np

CSV_PATH = "data/ux_research_flights_h2_2026_final.csv"
OUT_PATH = "data/ux_research_flights_h2_2026_final.csv"

COL_DEST = "dest_code"
COL_ORIGIN = "origin_code"
COL_DIRECTION = "direction"       # "outbound" / "return"
COL_DATE = "date"                 # "YYYY-MM-DD"
COL_DEP_TIME = "departure_time"   # "HH:MM"
COL_PRICE = "price_gbp"
COL_STOPS = "stops"

DEST_AMSTERDAM = "AMS"
DEST_ROME = "FCO"
DEST_PARIS = "CDG"

np.random.seed(42)

df = pd.read_csv(CSV_PATH, dtype={COL_DATE: str, COL_DEP_TIME: str})

print("Loaded", len(df), "rows")
print(df.columns.tolist())


def outbound_mask(df, dest_code):
    return (df[COL_DEST] == dest_code) & (df[COL_DIRECTION] == "outbound")


# ---------- 1. Amsterdam: spread times and prices for evening flights ----------
def fix_amsterdam(df):
    idx = df[outbound_mask(df, DEST_AMSTERDAM)].index

    if len(idx) < 5:
        print(f"Warning: only {len(idx)} Amsterdam outbound rows found, need at least 5")

    sample_idx = np.random.choice(idx, size=min(5, len(idx)), replace=False)

    evening_times = ["18:15", "19:30", "20:45", "22:00", "23:15"]
    prices = [58, 69, 74, 79, 89]  # mix of under and over £80, on purpose

    for i, row_idx in enumerate(sample_idx):
        df.loc[row_idx, COL_DEP_TIME] = evening_times[i % len(evening_times)]
        df.loc[row_idx, COL_PRICE] = prices[i % len(prices)]

    print(f"Amsterdam: adjusted {len(sample_idx)} rows")
    return df


# ---------- 2. Rome: ensure direct and 1-stop options exist across dates ----------
def fix_rome(df):
    idx = df[outbound_mask(df, DEST_ROME)].index

    if len(idx) < 6:
        print(f"Warning: only {len(idx)} Rome outbound rows found, need at least 6")

    sample_idx = np.random.choice(idx, size=min(6, len(idx)), replace=False)
    half = len(sample_idx) // 2

    for row_idx in sample_idx[:half]:
        df.loc[row_idx, COL_STOPS] = 0
        df.loc[row_idx, COL_PRICE] = np.random.randint(90, 140)
        new_date = pd.Timestamp.now() + pd.Timedelta(days=int(np.random.randint(7, 90)))
        df.loc[row_idx, COL_DATE] = new_date.strftime("%Y-%m-%d")

    for row_idx in sample_idx[half:]:
        df.loc[row_idx, COL_STOPS] = 1
        df.loc[row_idx, COL_PRICE] = np.random.randint(55, 95)
        new_date = pd.Timestamp.now() + pd.Timedelta(days=int(np.random.randint(7, 90)))
        df.loc[row_idx, COL_DATE] = new_date.strftime("%Y-%m-%d")

    print(f"Rome: adjusted {len(sample_idx)} rows ({half} direct, {len(sample_idx)-half} one-stop)")
    return df


# ---------- 3. Paris: make specific weekends noticeably cheaper ----------
def fix_paris(df):
    idx = df[outbound_mask(df, DEST_PARIS)].index

    if len(idx) < 10:
        print(f"Warning: only {len(idx)} Paris outbound rows found, need at least 10")

    today = pd.Timestamp.now()
    cheap_weekends = []
    for weeks_out in [3, 7, 11]:
        friday = today + pd.Timedelta(weeks=weeks_out)
        friday -= pd.Timedelta(days=friday.dayofweek - 4)  # snap to nearest Friday
        cheap_weekends.append(friday)

    sample_idx = np.random.choice(idx, size=min(9, len(idx)), replace=False)
    chunks = np.array_split(sample_idx, 3)

    for weekend_date, chunk in zip(cheap_weekends, chunks):
        for row_idx in chunk:
            df.loc[row_idx, COL_DATE] = weekend_date.strftime("%Y-%m-%d")
            df.loc[row_idx, COL_PRICE] = np.random.randint(40, 65)  # noticeably cheap

    print(f"Paris: set {len(sample_idx)} rows across 3 cheap weekends")
    return df


df = fix_amsterdam(df)
df = fix_rome(df)
df = fix_paris(df)

df.to_csv(OUT_PATH, index=False)
print("Saved to", OUT_PATH)
