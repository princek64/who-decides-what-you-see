import pandas as pd
import numpy as np
import random
from datetime import datetime, timedelta

# Reproducible dataset for research validity
random.seed(42)
np.random.seed(42)

# --- 1. CONFIGURATION & DICTIONARIES ---

LONDON_AIRPORTS = {
    "LHR": {"name": "Heathrow", "terminals": ["T2", "T3", "T4", "T5"]},
    "LGW": {"name": "Gatwick", "terminals": ["North", "South"]},
    "STN": {"name": "Stansted", "terminals": ["Main"]},
    "LTN": {"name": "Luton", "terminals": ["Main"]},
    "LCY": {"name": "London City", "terminals": ["Main"]},
    "SEN": {"name": "Southend", "terminals": ["Main"]}
}

SEN_ALLOWED_DESTINATIONS = ["AMS", "CDG", "FAO", "AGP", "PMI", "GVA", "ALC"]

RESTRICTED_DESTINATIONS = {
    "KIV": ["W6", "FR"],   # Chisinau - Wizz Air, Ryanair only
    "KUN": ["FR", "W6"],   # Kaunas - Ryanair, Wizz Air only
    "TOS": ["BY", "FR"],   # Tromso - TUI, Ryanair only
    "RVN": ["BY"],         # Rovaniemi - TUI only
    "TMP": ["W6", "FR"],   # Tampere - Wizz, Ryanair only
    "AAR": ["FR", "W6"],   # Aarhus - Ryanair, Wizz only
    "OHD": ["W6"],         # Ohrid - Wizz only
    "KSC": ["W6", "FR"],   # Kosice - Wizz, Ryanair only
    "TIV": ["FR", "W6"],   # Tivat - Ryanair, Wizz only
}

WINTER_ONLY = ["RVN"]

EU_FLAG_HOMES = {
    "AF": "France", "KL": "Netherlands", "LH": "Germany", "LX": "Switzerland",
    "IB": "Spain", "AZ": "Italy", "TP": "Portugal", "SK": "Denmark",
    "AY": "Finland", "OS": "Austria", "SN": "Belgium", "A3": "Greece",
    "LO": "Poland", "BT": "Latvia", "TK": "Turkey", "OU": "Croatia", "FI": "Iceland",
}

AIRLINES = {
    "Budget": [
        {"name": "easyJet",   "code": "U2", "airports": ["LGW", "STN", "LTN", "SEN"]},
        {"name": "Ryanair",   "code": "FR", "airports": ["STN", "LTN", "LGW"]},
        {"name": "Wizz Air",  "code": "W6", "airports": ["LTN", "LGW", "STN"]},
        {"name": "Vueling",   "code": "VY", "airports": ["LGW", "LHR"]},
        {"name": "Jet2",      "code": "LS", "airports": ["STN", "LTN"]},
        {"name": "Transavia", "code": "HV", "airports": ["LGW", "STN"]},
        {"name": "Norwegian", "code": "DY", "airports": ["LGW", "STN"]},
    ],
    "UK Flag": [
        {"name": "British Airways", "code": "BA", "airports": ["LHR", "LGW", "LCY"]},
    ],
    "EU Flag": [
        {"name": "Air France",         "code": "AF", "airports": ["LHR", "LCY"]},
        {"name": "KLM",                "code": "KL", "airports": ["LHR", "LCY"]},
        {"name": "Lufthansa",          "code": "LH", "airports": ["LHR", "LCY"]},
        {"name": "Swiss",              "code": "LX", "airports": ["LHR", "LCY"]},
        {"name": "Iberia",             "code": "IB", "airports": ["LHR"]},
        {"name": "ITA Airways",        "code": "AZ", "airports": ["LHR"]},
        {"name": "TAP Air Portugal",   "code": "TP", "airports": ["LHR"]},
        {"name": "SAS",                "code": "SK", "airports": ["LHR", "LCY"]},
        {"name": "Finnair",            "code": "AY", "airports": ["LHR"]},
        {"name": "Austrian Airlines",  "code": "OS", "airports": ["LHR", "LCY"]},
        {"name": "Brussels Airlines",  "code": "SN", "airports": ["LHR"]},
        {"name": "Aegean Airlines",    "code": "A3", "airports": ["LHR"]},
        {"name": "LOT Polish Airlines","code": "LO", "airports": ["LHR", "LCY"]},
        {"name": "Air Baltic",         "code": "BT", "airports": ["LGW", "STN"]},
        {"name": "Croatia Airlines",   "code": "OU", "airports": ["LHR"]},
        {"name": "Icelandair",         "code": "FI", "airports": ["LHR", "LGW"]},
        {"name": "Turkish Airlines",   "code": "TK", "airports": ["LHR"]},
    ],
    "Charter": [
        {"name": "TUI Airways", "code": "BY", "airports": ["LGW", "STN", "LTN"]},
    ]
}

AIRCRAFT_TYPES = [
    "Airbus A320", "Airbus A321neo", "Boeing 737-800",
    "Boeing 737 MAX 8", "Embraer E190"
]

# Realistic per-airline fleets (short-haul European operations)
AIRLINE_FLEETS = {
    "U2": ["Airbus A319", "Airbus A320", "Airbus A321neo"],          # easyJet: all-Airbus
    "FR": ["Boeing 737-800", "Boeing 737 MAX 8"],                    # Ryanair: all-Boeing
    "W6": ["Airbus A320", "Airbus A321neo"],                         # Wizz Air: all-Airbus
    "VY": ["Airbus A320", "Airbus A321"],                            # Vueling: all-Airbus
    "LS": ["Boeing 737-800", "Airbus A321neo"],                      # Jet2
    "HV": ["Boeing 737-800"],                                        # Transavia
    "DY": ["Boeing 737-800", "Boeing 737 MAX 8"],                    # Norwegian
    "BA": ["Airbus A320", "Airbus A320neo", "Airbus A321neo"],       # British Airways short-haul
    "AF": ["Airbus A320", "Airbus A220-300"],                        # Air France
    "KL": ["Boeing 737-800", "Embraer E195-E2"],                     # KLM
    "LH": ["Airbus A320", "Airbus A320neo", "Airbus A321"],          # Lufthansa
    "LX": ["Airbus A220-300", "Airbus A320neo"],                     # Swiss
    "IB": ["Airbus A320", "Airbus A321"],                            # Iberia
    "AZ": ["Airbus A320", "Airbus A220-300"],                        # ITA Airways
    "TP": ["Airbus A320", "Airbus A321neo"],                         # TAP
    "SK": ["Airbus A320neo"],                                        # SAS
    "AY": ["Airbus A320", "Embraer E190"],                           # Finnair
    "OS": ["Airbus A320", "Embraer E195"],                           # Austrian
    "SN": ["Airbus A319", "Airbus A320"],                            # Brussels Airlines
    "A3": ["Airbus A320", "Airbus A321neo"],                         # Aegean
    "LO": ["Boeing 737 MAX 8", "Embraer E195"],                      # LOT
    "BT": ["Airbus A220-300"],                                       # Air Baltic: all-A220
    "OU": ["Airbus A319", "Airbus A320"],                            # Croatia Airlines
    "FI": ["Boeing 737 MAX 8", "Boeing 757-200"],                    # Icelandair
    "TK": ["Airbus A321", "Boeing 737-800"],                         # Turkish
    "BY": ["Boeing 737-800", "Boeing 737 MAX 8"],                    # TUI Airways
}

# Plausible terminal names for non-London (EU) origin airports on return legs
EU_AIRPORT_TERMINALS = {
    "CDG": ["2A", "2E", "2F"], "FRA": ["1", "2"], "MUC": ["1", "2"],
    "MAD": ["4", "4S"], "BCN": ["1", "2"], "FCO": ["1", "3"],
    "VIE": ["3"], "CPH": ["2", "3"], "BUD": ["2A", "2B"],
    "DUB": ["1", "2"], "HEL": ["2"], "LIS": ["1"], "BER": ["1"],
    "ARN": ["2", "5"], "OSL": ["Main"], "ZRH": ["Main"], "AMS": ["Main"],
    "IST": ["Main"], "WAW": ["Main"], "PRG": ["1", "2"], "ATH": ["Main"],
}

def pick_aircraft(airline_code, london_airport):
    # London City's short runway only handles small regional jets
    if london_airport == "LCY":
        return "Embraer E190"
    fleet = AIRLINE_FLEETS.get(airline_code, AIRCRAFT_TYPES)
    return random.choice(fleet)

# --- 2. HELPER FUNCTIONS ---

def format_duration(minutes):
    return f"{minutes // 60}h {minutes % 60}m"

def get_base_duration(country):
    durations = {
        "Ireland": 75, "France": 90, "Belgium": 75, "Netherlands": 75,
        "Luxembourg": 80, "Germany": 100, "Switzerland": 100, "Denmark": 110,
        "Austria": 135, "Italy": 140, "Spain": 140, "Portugal": 160,
        "Croatia": 140, "Poland": 130, "Hungary": 140, "Czechia": 120,
        "Slovakia": 130, "Sweden": 140, "Norway": 130, "Finland": 170,
        "Estonia": 160, "Latvia": 150, "Lithuania": 150, "Greece": 210,
        "Turkey": 240, "Iceland": 190, "Bulgaria": 190, "Romania": 180,
        "Albania": 170, "Serbia": 150, "Bosnia": 150, "Montenegro": 160,
        "North Macedonia": 170, "Malta": 190, "Moldova": 185,
    }
    return durations.get(country, 140)

def calculate_price(days_until_flight, is_weekend, airline_tier, cabin, is_direct):
    if airline_tier == "Budget":
        base = random.uniform(21, 80)
    elif airline_tier in ["UK Flag", "EU Flag"]:
        base = random.uniform(80, 200)
    else:  # Charter
        base = random.uniform(60, 150)

    if days_until_flight < 7:
        base *= 2.5
    elif days_until_flight < 21:
        base *= 1.5
    else:
        base *= 0.8

    if is_weekend:
        base *= 1.3

    if cabin == "Premium Economy":
        base *= 2.0
    elif cabin == "Business":
        base *= 3.5

    if not is_direct:
        base *= 0.70

    base *= random.uniform(0.85, 1.15)

    if cabin == "Economy":
        return soft_clamp(base, 21, 300)
    elif cabin == "Premium Economy":
        return soft_clamp(base, 180, 800)
    else:
        return soft_clamp(base, 320, 1500)

def soft_clamp(value, lo, hi):
    """Keep prices in a realistic band without piling thousands of fares
    on the exact boundary value (which looks fake in a sorted list)."""
    span = hi - lo
    if value < lo:
        value = lo + abs(random.gauss(0, span * 0.04))
    elif value > hi:
        value = hi - abs(random.gauss(0, span * 0.08))
    value = min(max(value, lo), hi)
    return round(value, 2)

def calculate_co2(base_duration, airline_tier, is_direct):
    base_co2 = base_duration * 0.5
    if airline_tier == "Budget":
        base_co2 *= 1.1
    if not is_direct:
        base_co2 *= 1.3
    return round(base_co2 + random.uniform(-10, 10), 1)

def determine_policies(airline_tier, cabin):
    if cabin == "Business":
        return "2x 32kg checked bag included", "Included", "Fully flexible"
    if cabin == "Premium Economy":
        return "1x 23kg checked bag included", "Included", "Changeable for a fee"
    if airline_tier == "Budget":
        return "Cabin bag only", "Buy on board", "Non-refundable"
    return "1x 23kg checked bag included", "Included", "Changeable for a fee"

def seats_to_demand(seats):
    if seats <= 5: return "Filling Fast"
    elif seats <= 15: return "High"
    elif seats <= 30: return "Medium"
    else: return "Low"

def get_arrival(flight_date, dep_time, duration_mins):
    dep_dt = datetime.strptime(
        f"{flight_date.strftime('%Y-%m-%d')} {dep_time}", "%Y-%m-%d %H:%M"
    )
    arr_dt = dep_dt + timedelta(minutes=duration_mins)
    return arr_dt.strftime("%H:%M"), arr_dt.strftime("%Y-%m-%d")

# --- 3. GENERATION LOOP ---

def generate_dataset(destinations):
    records = []
    flight_id_counter = 1
    flight_number_tracker = {}

    # UPDATED DATES: H2 2026
    start_date = datetime(2026, 7, 1)
    end_date = datetime(2026, 12, 31)
    today = datetime.now()

    for i in range((end_date - start_date).days + 1):
        flight_date = start_date + timedelta(days=i)
        is_weekend = flight_date.weekday() >= 5
        days_until = max((flight_date - today).days, 1)
        month = flight_date.month

        for dest in destinations:
            dest_code = dest["code"]

            # Skip winter-only destinations in summer/early autumn months
            if dest_code in WINTER_ONLY and month in [7, 8, 9, 10]:
                continue

            valid_london_airports = list(LONDON_AIRPORTS.keys())
            if dest_code not in SEN_ALLOWED_DESTINATIONS and "SEN" in valid_london_airports:
                valid_london_airports.remove("SEN")

            for direction in ["outbound", "return"]:
                num_direct = random.randint(2, 4)
                num_connecting = random.randint(1, 2) if dest.get("hubs") else 0
                total_flights = num_direct + num_connecting

                for j in range(total_flights):
                    is_direct = j < num_direct
                    london_airport = random.choice(valid_london_airports)

                    eligible_airlines = []
                    for tier, carriers in AIRLINES.items():
                        for carrier in carriers:
                            if london_airport not in carrier["airports"]:
                                continue

                            code = carrier["code"]

                            if dest_code in RESTRICTED_DESTINATIONS:
                                if code not in RESTRICTED_DESTINATIONS[dest_code]:
                                    continue

                            if code == "VY" and dest["country"] not in ["Spain", "France", "Italy"]:
                                continue

                            if code in ["LS", "HV"] and dest["country"] in [
                                "Germany", "Belgium", "Luxembourg", "Netherlands",
                                "Switzerland", "Austria", "Czechia", "Poland",
                                "Hungary", "Slovakia", "Estonia", "Latvia",
                                "Lithuania", "Moldova", "Serbia", "Bosnia",
                                "North Macedonia", "Albania", "Slovenia"
                            ]:
                                continue

                            if is_direct and tier == "EU Flag":
                                if code in EU_FLAG_HOMES and dest["country"] != EU_FLAG_HOMES[code]:
                                    continue

                            eligible_airlines.append({**carrier, "tier": tier})

                    if not eligible_airlines:
                        if london_airport in ["LHR", "LCY"]:
                            eligible_airlines.append({
                                "name": "British Airways", "code": "BA",
                                "tier": "UK Flag", "airports": ["LHR", "LGW", "LCY"]
                            })
                        else:
                            eligible_airlines.append({
                                "name": "easyJet", "code": "U2",
                                "tier": "Budget", "airports": ["LGW", "STN", "LTN", "SEN"]
                            })

                    chosen = random.choice(eligible_airlines)
                    tier = chosen["tier"]
                    airline_name = chosen["name"]
                    airline_code = chosen["code"]

                    date_str = flight_date.strftime("%Y-%m-%d")
                    fn_key = f"{airline_code}-{date_str}"
                    if fn_key not in flight_number_tracker:
                        flight_number_tracker[fn_key] = set()
                    attempts = 0
                    while True:
                        fn_num = random.randint(1000, 9999)
                        if fn_num not in flight_number_tracker[fn_key] or attempts > 20:
                            flight_number_tracker[fn_key].add(fn_num)
                            break
                        attempts += 1
                    flight_number = f"{airline_code}{fn_num}"

                    # London airports have night curfews (~06:00-22:30 departures).
                    # EU-origin return legs also see early (05:xx) and late (23:xx) departures.
                    if direction == "outbound":
                        dep_hour = random.choices(
                            range(6, 23),
                            weights=[6, 8, 9, 9, 8, 8, 7, 8, 8, 8, 8, 8, 7, 6, 5, 3, 1],
                        )[0]
                    else:
                        dep_hour = random.choices(
                            range(5, 24),
                            weights=[2, 6, 8, 9, 9, 8, 8, 7, 8, 8, 8, 8, 8, 7, 6, 5, 3, 2, 1],
                        )[0]
                    dep_minute = random.choice([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])
                    dep_time = f"{dep_hour:02d}:{dep_minute:02d}"

                    base_dur = get_base_duration(dest["country"])
                    if is_direct:
                        duration_mins = base_dur + random.randint(-10, 10)
                        layover_details = None
                        stops = 0
                    else:
                        hub_code = random.choice(dest["hubs"])
                        # Handle potential missing hub info gracefully
                        hub_info = next((d for d in destinations if d["code"] == hub_code), None)
                        if hub_info:
                            hub_city, hub_country = hub_info["city"], hub_info["country"]
                        else:
                            hub_city, hub_country = hub_code, "Europe"
                        
                        layover_mins = random.randint(75, 180)
                        layover_details = f"{hub_code}, {hub_city}, {hub_country}, {format_duration(layover_mins)}"
                        duration_mins = base_dur + layover_mins + random.randint(30, 60)
                        stops = 1

                    arrival_time, arrival_date = get_arrival(flight_date, dep_time, duration_mins)
                    terminal = random.choice(LONDON_AIRPORTS[london_airport]["terminals"])

                    if tier in ["UK Flag", "EU Flag"]:
                        cabin = random.choice(["Economy", "Economy", "Premium Economy", "Business"])
                    else:
                        cabin = "Economy"

                    price = calculate_price(days_until, is_weekend, tier, cabin, is_direct)
                    baggage, meal, flex = determine_policies(tier, cabin)
                    co2 = calculate_co2(base_dur, tier, is_direct)

                    flight_status = random.choice(
                        ["Scheduled"] * 10 + ["On time", "Delayed", "Cancelled"]
                    )

                    if flight_status == "Cancelled":
                        # A cancelled flight keeps its fare and CO2 estimate;
                        # it simply has no seats available to book.
                        seats = 0
                        demand = "Low"
                    else:
                        seats = random.randint(1, 50)
                        demand = seats_to_demand(seats)

                    if direction == "outbound":
                        origin_code = london_airport
                        origin_terminal = terminal
                        final_dest_code = dest_code
                    else:
                        origin_code = dest_code
                        origin_terminal = random.choice(
                            EU_AIRPORT_TERMINALS.get(dest_code, ["Main"])
                        )
                        final_dest_code = london_airport

                    records.append({
                        "flight_id":          f"FL-{airline_code}-{str(flight_id_counter).zfill(6)}",
                        "flight_number":       flight_number,
                        "origin_code":         origin_code,
                        "origin_terminal":     origin_terminal,
                        "dest_code":           final_dest_code,
                        "date":                date_str,
                        "departure_time":      dep_time,
                        "arrival_time":        arrival_time,
                        "arrival_date":        arrival_date,
                        "duration_mins":       duration_mins,
                        "duration_formatted":  format_duration(duration_mins),
                        "direction":           direction,
                        "airline_name":        airline_name,
                        "airline_tier":        tier,
                        "aircraft_type":       pick_aircraft(airline_code, london_airport),
                        "stops":               stops,
                        "layover_details":     layover_details,
                        "cabin_class":         cabin,
                        "price_gbp":           price,
                        "currency":            "GBP",
                        "seats_remaining":     seats,
                        "baggage_policy":      baggage,
                        "meal":                meal,
                        "flexibility_policy":  flex,
                        "co2_kg":              co2,
                        "demand_indicator":    demand,
                        "flight_status":       flight_status,
                    })

                    flight_id_counter += 1

    return pd.DataFrame(records)

# ==============================================================================
# IMPORTANT: PASTE YOUR ENTIRE `DESTINATIONS = [...]` ARRAY HERE!
# (The one containing VIE, SZG, BRU, CDG, etc.)
# ==============================================================================

# Destinations
DESTINATIONS = [
    # --- Western Europe ---
    {"code": "VIE", "city": "Vienna", "country": "Austria", "hubs": ["FRA", "MUC", "ZRH", "AMS"]},
    {"code": "SZG", "city": "Salzburg", "country": "Austria", "hubs": ["FRA", "MUC"]},
    {"code": "INN", "city": "Innsbruck", "country": "Austria", "hubs": ["FRA", "VIE"]},
    {"code": "BRU", "city": "Brussels", "country": "Belgium", "hubs": []}, # Too close for practical layovers
    {"code": "CDG", "city": "Paris", "country": "France", "hubs": []},
    {"code": "NCE", "city": "Nice", "country": "France", "hubs": ["CDG", "FRA", "MUC", "AMS"]},
    {"code": "LYS", "city": "Lyon", "country": "France", "hubs": ["CDG", "FRA"]},
    {"code": "BOD", "city": "Bordeaux", "country": "France", "hubs": ["CDG", "AMS"]},
    {"code": "TLS", "city": "Toulouse", "country": "France", "hubs": ["CDG", "FRA", "MUC"]},
    {"code": "MRS", "city": "Marseille", "country": "France", "hubs": ["CDG", "MUC", "FRA"]},
    {"code": "BER", "city": "Berlin", "country": "Germany", "hubs": ["FRA", "MUC", "AMS"]},
    {"code": "MUC", "city": "Munich", "country": "Germany", "hubs": ["FRA", "AMS"]},
    {"code": "FRA", "city": "Frankfurt", "country": "Germany", "hubs": ["MUC", "AMS"]},
    {"code": "HAM", "city": "Hamburg", "country": "Germany", "hubs": ["FRA", "MUC", "AMS"]},
    {"code": "CGN", "city": "Cologne", "country": "Germany", "hubs": ["MUC"]},
    {"code": "DUS", "city": "Dusseldorf", "country": "Germany", "hubs": ["FRA", "MUC", "AMS"]},
    {"code": "LUX", "city": "Luxembourg City", "country": "Luxembourg", "hubs": ["FRA", "MUC", "AMS"]},
    {"code": "AMS", "city": "Amsterdam", "country": "Netherlands", "hubs": ["CDG"]},
    {"code": "RTM", "city": "Rotterdam", "country": "Netherlands", "hubs": []},
    {"code": "EIN", "city": "Eindhoven", "country": "Netherlands", "hubs": []},
    {"code": "ZRH", "city": "Zurich", "country": "Switzerland", "hubs": ["FRA", "MUC"]},
    {"code": "GVA", "city": "Geneva", "country": "Switzerland", "hubs": ["ZRH", "FRA", "CDG"]},
    {"code": "BSL", "city": "Basel", "country": "Switzerland", "hubs": ["FRA", "MUC"]},

    # --- Northern Europe ---
    {"code": "CPH", "city": "Copenhagen", "country": "Denmark", "hubs": ["AMS", "FRA", "MUC"]},
    {"code": "BLL", "city": "Billund", "country": "Denmark", "hubs": ["CPH", "AMS", "FRA"]},
    {"code": "AAR", "city": "Aarhus", "country": "Denmark", "hubs": ["CPH"]},
    {"code": "TLL", "city": "Tallinn", "country": "Estonia", "hubs": ["HEL", "RIX", "WAW", "FRA"]},
    {"code": "HEL", "city": "Helsinki", "country": "Finland", "hubs": ["ARN", "CPH", "FRA"]},
    {"code": "RVN", "city": "Rovaniemi", "country": "Finland", "hubs": ["HEL"]},
    {"code": "TMP", "city": "Tampere", "country": "Finland", "hubs": ["HEL", "RIX"]},
    {"code": "KEF", "city": "Reykjavik", "country": "Iceland", "hubs": ["CPH", "AMS"]},
    {"code": "DUB", "city": "Dublin", "country": "Ireland", "hubs": []},
    {"code": "ORK", "city": "Cork", "country": "Ireland", "hubs": ["AMS", "CDG"]},
    {"code": "SNN", "city": "Shannon", "country": "Ireland", "hubs": []},
    {"code": "RIX", "city": "Riga", "country": "Latvia", "hubs": ["HEL", "FRA", "WAW"]},
    {"code": "VNO", "city": "Vilnius", "country": "Lithuania", "hubs": ["RIX", "WAW", "FRA"]},
    {"code": "KUN", "city": "Kaunas", "country": "Lithuania", "hubs": ["RIX", "WAW"]},
    {"code": "OSL", "city": "Oslo", "country": "Norway", "hubs": ["CPH", "AMS", "FRA"]},
    {"code": "BGO", "city": "Bergen", "country": "Norway", "hubs": ["OSL", "CPH", "AMS"]},
    {"code": "TOS", "city": "Tromso", "country": "Norway", "hubs": ["OSL"]},
    {"code": "ARN", "city": "Stockholm", "country": "Sweden", "hubs": ["CPH", "HEL", "FRA"]},
    {"code": "GOT", "city": "Gothenburg", "country": "Sweden", "hubs": ["ARN", "CPH", "AMS"]},

    # --- Southern Europe ---
    {"code": "TIA", "city": "Tirana", "country": "Albania", "hubs": ["VIE", "FRA", "MUC", "FCO"]},
    {"code": "SJJ", "city": "Sarajevo", "country": "Bosnia", "hubs": ["VIE", "MUC", "ZRH", "IST"]},
    {"code": "ZAG", "city": "Zagreb", "country": "Croatia", "hubs": ["FRA", "MUC", "VIE"]},
    {"code": "SPU", "city": "Split", "country": "Croatia", "hubs": ["FRA", "MUC", "ZAG"]},
    {"code": "DBV", "city": "Dubrovnik", "country": "Croatia", "hubs": ["FRA", "MUC", "ZAG"]},
    {"code": "ATH", "city": "Athens", "country": "Greece", "hubs": ["MUC", "FRA", "ZRH", "CDG"]},
    {"code": "SKG", "city": "Thessaloniki", "country": "Greece", "hubs": ["ATH", "MUC", "FRA"]},
    {"code": "JTR", "city": "Santorini", "country": "Greece", "hubs": ["ATH"]},
    {"code": "JMK", "city": "Mykonos", "country": "Greece", "hubs": ["ATH"]},
    {"code": "RHO", "city": "Rhodes", "country": "Greece", "hubs": ["ATH", "MUC"]},
    {"code": "CFU", "city": "Corfu", "country": "Greece", "hubs": ["ATH"]},
    {"code": "HER", "city": "Heraklion", "country": "Greece", "hubs": ["ATH", "FRA"]},
    {"code": "FCO", "city": "Rome", "country": "Italy", "hubs": ["MUC", "FRA", "CDG", "ZRH"]},
    {"code": "MXP", "city": "Milan", "country": "Italy", "hubs": ["FRA", "MUC", "CDG"]},
    {"code": "VCE", "city": "Venice", "country": "Italy", "hubs": ["FRA", "MUC", "ZRH"]},
    {"code": "NAP", "city": "Naples", "country": "Italy", "hubs": ["MUC", "FRA", "ZRH"]},
    {"code": "BLQ", "city": "Bologna", "country": "Italy", "hubs": ["FRA", "MUC", "CDG"]},
    {"code": "PSA", "city": "Pisa", "country": "Italy", "hubs": ["FRA", "MUC"]},
    {"code": "BRI", "city": "Bari", "country": "Italy", "hubs": ["FCO", "MUC"]},
    {"code": "PMO", "city": "Palermo", "country": "Italy", "hubs": ["FCO", "MXP"]},
    {"code": "CTA", "city": "Catania", "country": "Italy", "hubs": ["FCO", "MUC"]},
    {"code": "MLA", "city": "Malta Luqa", "country": "Malta", "hubs": ["FRA", "MUC", "FCO"]},
    {"code": "TGD", "city": "Podgorica", "country": "Montenegro", "hubs": ["VIE", "BEG", "IST"]},
    {"code": "TIV", "city": "Tivat", "country": "Montenegro", "hubs": ["BEG"]},
    {"code": "SKP", "city": "Skopje", "country": "North Macedonia", "hubs": ["VIE", "ZAG"]},
    {"code": "OHD", "city": "Ohrid", "country": "North Macedonia", "hubs": ["BEG"]},
    {"code": "LIS", "city": "Lisbon", "country": "Portugal", "hubs": ["MAD", "FRA", "AMS", "CDG"]},
    {"code": "OPO", "city": "Porto", "country": "Portugal", "hubs": ["LIS", "MAD", "FRA"]},
    {"code": "FAO", "city": "Faro", "country": "Portugal", "hubs": ["LIS", "MAD"]},
    {"code": "BEG", "city": "Belgrade", "country": "Serbia", "hubs": ["FRA", "MUC", "VIE"]},
    {"code": "LJU", "city": "Ljubljana", "country": "Slovenia", "hubs": ["FRA", "MUC", "ZRH"]},
    {"code": "MAD", "city": "Madrid", "country": "Spain", "hubs": ["FRA", "CDG", "AMS"]},
    {"code": "BCN", "city": "Barcelona", "country": "Spain", "hubs": ["MAD", "CDG", "FRA", "MUC"]},
    {"code": "AGP", "city": "Malaga", "country": "Spain", "hubs": ["MAD", "BCN"]},
    {"code": "SVQ", "city": "Seville", "country": "Spain", "hubs": ["MAD", "BCN"]},
    {"code": "VLC", "city": "Valencia", "country": "Spain", "hubs": ["MAD", "FRA", "CDG"]},
    {"code": "PMI", "city": "Palma Mallorca", "country": "Spain", "hubs": ["MAD", "BCN"]},
    {"code": "IBZ", "city": "Ibiza", "country": "Spain", "hubs": ["MAD", "BCN"]},
    {"code": "ALC", "city": "Alicante", "country": "Spain", "hubs": ["MAD", "AMS"]},
    {"code": "BIO", "city": "Bilbao", "country": "Spain", "hubs": ["MAD", "FRA", "MUC"]},
    {"code": "LPA", "city": "Gran Canaria", "country": "Spain", "hubs": ["MAD", "BCN"]},
    {"code": "TFS", "city": "Tenerife", "country": "Spain", "hubs": ["MAD", "BCN"]},
    {"code": "IST", "city": "Istanbul", "country": "Turkey", "hubs": ["FRA", "MUC"]},

    # --- Eastern Europe ---
    {"code": "SOF", "city": "Sofia", "country": "Bulgaria", "hubs": ["FRA", "MUC", "VIE"]},
    {"code": "VAR", "city": "Varna", "country": "Bulgaria", "hubs": ["SOF", "VIE"]},
    {"code": "BOJ", "city": "Burgas", "country": "Bulgaria", "hubs": ["SOF", "WAW"]},
    {"code": "PRG", "city": "Prague", "country": "Czechia", "hubs": ["FRA", "MUC", "AMS", "CDG"]},
    {"code": "BUD", "city": "Budapest", "country": "Hungary", "hubs": ["FRA", "MUC", "AMS", "WAW"]},
    {"code": "KIV", "city": "Chisinau", "country": "Moldova", "hubs": ["OTP", "VIE", "WAW"]},
    {"code": "WAW", "city": "Warsaw", "country": "Poland", "hubs": ["FRA", "MUC", "AMS"]},
    {"code": "KRK", "city": "Krakow", "country": "Poland", "hubs": ["WAW", "FRA", "MUC"]},
    {"code": "GDN", "city": "Gdansk", "country": "Poland", "hubs": ["WAW", "CPH", "FRA", "MUC"]},
    {"code": "WRO", "city": "Wroclaw", "country": "Poland", "hubs": ["WAW", "FRA", "MUC"]},
    {"code": "KTW", "city": "Katowice", "country": "Poland", "hubs": ["WAW", "FRA"]},
    {"code": "OTP", "city": "Bucharest", "country": "Romania", "hubs": ["FRA", "MUC", "VIE"]},
    {"code": "CLJ", "city": "Cluj-Napoca", "country": "Romania", "hubs": ["OTP", "MUC"]},
    {"code": "IAS", "city": "Iasi", "country": "Romania", "hubs": ["OTP", "VIE"]},
    {"code": "BTS", "city": "Bratislava", "country": "Slovakia", "hubs": ["PRG"]},
    {"code": "KSC", "city": "Kosice", "country": "Slovakia", "hubs": ["VIE", "WAW", "PRG"]}
]

# --- 4. RUN GENERATOR ---

print("Starting flight generation... this might take a few seconds.")
df = generate_dataset(DESTINATIONS)

# UPDATED FILENAME: h2_2026
filename = "ux_research_flights_h2_2026_final.csv"
df.to_csv(filename, index=False)

print(f"Success! Generated {len(df)} flight records and saved to {filename}.")