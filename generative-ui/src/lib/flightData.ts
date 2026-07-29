import type { Flight } from '../hooks/useFlightFilter';

export interface FlightDataset {
  flights: Flight[];
  medianCo2: number;
}

const JSON_URL = '/flightlab-study-flights.json';

/** Parsed dataset, kept for the lifetime of the page. */
let cache: FlightDataset | null = null;
/** The request currently in flight, so concurrent callers share ONE fetch.
 *  React StrictMode runs every effect twice in development, which without this
 *  issued two 35 MB requests for the same file. */
let inFlight: Promise<FlightDataset> | null = null;

const parseCsv = async (): Promise<FlightDataset> => {
  const response = await fetch(JSON_URL);
  if (!response.ok) {
    throw new Error('Failed to fetch dataset');
  }
  const data = await response.json();
  
  const colMap = data.meta.columns.reduce((acc: Record<string, number>, name: string, index: number) => {
    acc[name] = index;
    return acc;
  }, {});

  const parsedData: Flight[] = [];
  const rows = data.rows;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const status = row[colMap.flight_status];
    if (status === 'Cancelled') continue;
    
    parsedData.push({
      flight_id: row[colMap.flight_id],
      flight_number: row[colMap.flight_number],
      origin_code: row[colMap.origin_code],
      origin_terminal: row[colMap.origin_terminal],
      dest_code: row[colMap.dest_code],
      date: row[colMap.date],
      departure_time: row[colMap.departure_time],
      arrival_time: row[colMap.arrival_time],
      arrival_date: row[colMap.arrival_date],
      duration_mins: row[colMap.duration_mins],
      duration_formatted: row[colMap.duration_formatted],
      direction: row[colMap.direction],
      airline_name: row[colMap.airline_name],
      airline_tier: row[colMap.airline_tier],
      aircraft_type: row[colMap.aircraft_type],
      stops: row[colMap.stops],
      layover_details: row[colMap.layover_details],
      cabin_class: row[colMap.cabin_class],
      price_gbp: row[colMap.price_gbp],
      seats_remaining: row[colMap.seats_remaining],
      baggage_policy: row[colMap.baggage_policy],
      meal: row[colMap.meal],
      flexibility_policy: row[colMap.flexibility_policy],
      co2_kg: row[colMap.co2_kg],
      demand_indicator: row[colMap.demand_indicator],
      flight_status: status,
      departure_mins_from_midnight: row[colMap.departure_mins_from_midnight]
    });
  }

  const medianCo2 = data.meta.medianCo2ExcludingCancelled;

  return { flights: parsedData, medianCo2 };
};

/**
 * The dataset, fetched and parsed at most ONCE per page load. The second and
 * later callers get the cached rows (or join the request already running)
 * rather than re-downloading 35 MB. A failed load is not cached, so a retry
 * can still succeed.
 */
export const loadFlightData = (): Promise<FlightDataset> => {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;

  inFlight = parseCsv()
    .then((dataset) => {
      cache = dataset;
      inFlight = null;
      return dataset;
    })
    .catch((err) => {
      inFlight = null;
      throw err;
    });

  return inFlight;
};
