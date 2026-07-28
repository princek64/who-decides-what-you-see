import Papa from 'papaparse';
import type { Flight } from '../hooks/useFlightFilter';

export interface FlightDataset {
  flights: Flight[];
  medianCo2: number;
}

const CSV_URL = '/ux_research_flights_h2_2026_final.csv';

/** Parsed dataset, kept for the lifetime of the page. */
let cache: FlightDataset | null = null;
/** The request currently in flight, so concurrent callers share ONE fetch.
 *  React StrictMode runs every effect twice in development, which without this
 *  issued two 35 MB requests for the same file. */
let inFlight: Promise<FlightDataset> | null = null;

const parseCsv = async (): Promise<FlightDataset> => {
  const response = await fetch(CSV_URL);
  if (!response.ok) {
    throw new Error('Failed to fetch dataset');
  }
  const csvText = await response.text();

  return new Promise<FlightDataset>((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedData: Flight[] = [];
        const co2Values: number[] = [];

        results.data.forEach((row: any) => {
          // Exclude cancelled flights entirely on load
          if (row.flight_status === 'Cancelled') {
            return;
          }

          const durationMins = parseInt(row.duration_mins, 10) || 0;
          const priceGbp = parseFloat(row.price_gbp) || 0;
          const seatsRemaining = parseInt(row.seats_remaining, 10) || 0;
          const stops = parseInt(row.stops, 10) || 0;
          const co2Kg = parseFloat(row.co2_kg) || 0;

          let departureMins = 0;
          if (row.departure_time) {
            const [h, m] = row.departure_time.split(':');
            departureMins = (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
          }

          if (row.flight_id) {
            parsedData.push({
              flight_id: row.flight_id,
              flight_number: row.flight_number || '',
              origin_code: row.origin_code || '',
              origin_terminal: row.origin_terminal || '',
              dest_code: row.dest_code || '',
              date: row.date || '',
              departure_time: row.departure_time || '',
              arrival_time: row.arrival_time || '',
              arrival_date: row.arrival_date || '',
              duration_mins: durationMins,
              duration_formatted: row.duration_formatted || '',
              direction: row.direction || 'outbound',
              airline_name: row.airline_name || '',
              airline_tier: row.airline_tier || '',
              aircraft_type: row.aircraft_type || '',
              stops: stops,
              layover_details: row.layover_details || '',
              cabin_class: row.cabin_class || '',
              price_gbp: priceGbp,
              currency: row.currency || 'GBP',
              seats_remaining: seatsRemaining,
              baggage_policy: row.baggage_policy || '',
              meal: row.meal || '',
              flexibility_policy: row.flexibility_policy || '',
              co2_kg: co2Kg,
              demand_indicator: row.demand_indicator || '',
              flight_status: row.flight_status || '',
              departure_mins_from_midnight: departureMins,
            });

            if (!isNaN(co2Kg)) {
              co2Values.push(co2Kg);
            }
          }
        });

        let medianCo2 = 80;
        if (co2Values.length > 0) {
          co2Values.sort((a, b) => a - b);
          const mid = Math.floor(co2Values.length / 2);
          medianCo2 =
            co2Values.length % 2 !== 0 ? co2Values[mid] : (co2Values[mid - 1] + co2Values[mid]) / 2;
        }

        resolve({ flights: parsedData, medianCo2 });
      },
      error: (err: any) => reject(err),
    });
  });
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
