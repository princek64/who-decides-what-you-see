export const AIRPORT_TO_CITY: Record<string, string> = {
  LHR: "London Heathrow",
  LGW: "London Gatwick",
  STN: "London Stansted",
  LTN: "London Luton",
  LCY: "London City",
  SEN: "London Southend",
  AAR: "Aarhus",
  AGP: "Malaga",
  ALC: "Alicante",
  AMS: "Amsterdam",
  ARN: "Stockholm",
  ATH: "Athens",
  BCN: "Barcelona",
  BEG: "Belgrade",
  BER: "Berlin",
  BGO: "Bergen",
  BIO: "Bilbao",
  BLL: "Billund",
  BLQ: "Bologna",
  BOD: "Bordeaux",
  BOJ: "Burgas",
  BRI: "Bari",
  BRU: "Brussels",
  BSL: "Basel",
  BTS: "Bratislava",
  BUD: "Budapest",
  CDG: "Paris",
  CFU: "Corfu",
  CGN: "Cologne",
  CLJ: "Cluj-Napoca",
  CPH: "Copenhagen",
  CTA: "Catania",
  DBV: "Dubrovnik",
  DUB: "Dublin",
  DUS: "Dusseldorf",
  EIN: "Eindhoven",
  FAO: "Faro",
  FCO: "Rome",
  FRA: "Frankfurt",
  GDN: "Gdansk",
  GOT: "Gothenburg",
  GVA: "Geneva",
  HAM: "Hamburg",
  HEL: "Helsinki",
  HER: "Heraklion",
  IAS: "Iasi",
  IBZ: "Ibiza",
  INN: "Innsbruck",
  IST: "Istanbul",
  JMK: "Mykonos",
  JTR: "Santorini",
  KEF: "Reykjavik",
  KIV: "Chisinau",
  KRK: "Krakow",
  KSC: "Kosice",
  KTW: "Katowice",
  KUN: "Kaunas",
  LIS: "Lisbon",
  LJU: "Ljubljana",
  LPA: "Las Palmas",
  LUX: "Luxembourg",
  LYS: "Lyon",
  MAD: "Madrid",
  MLA: "Malta",
  MRS: "Marseille",
  MUC: "Munich",
  MXP: "Milan",
  NAP: "Naples",
  NCE: "Nice",
  OHD: "Ohrid",
  OPO: "Porto",
  ORK: "Cork",
  OSL: "Oslo",
  OTP: "Bucharest",
  PMI: "Palma de Mallorca",
  PMO: "Palermo",
  PRG: "Prague",
  PSA: "Pisa",
  RHO: "Rhodes",
  RIX: "Riga",
  RTM: "Rotterdam",
  RVN: "Rovaniemi",
  SJJ: "Sarajevo",
  SKG: "Thessaloniki",
  SKP: "Skopje",
  SNN: "Shannon",
  SOF: "Sofia",
  SPU: "Split",
  SVQ: "Seville",
  SZG: "Salzburg",
  TFS: "Tenerife",
  TGD: "Podgorica",
  TIA: "Tirana",
  TIV: "Tivat",
  TLL: "Tallinn",
  TLS: "Toulouse",
  TMP: "Tampere",
  TOS: "Tromso",
  VAR: "Varna",
  VCE: "Venice",
  VIE: "Vienna",
  VLC: "Valencia",
  VNO: "Vilnius",
  WAW: "Warsaw",
  WRO: "Wroclaw",
  ZAG: "Zagreb",
  ZRH: "Zurich"
};

// Local / alternate spellings of cities that ARE in the network. Users type the
// name they know ("Sevilla", "Roma", "Firenze", "München"), and the English
// label above is the only spelling the lookup knew — so a city that is very
// much in the dataset came back as "not in this flight network". Keys are
// lowercase, accent-free (the query is normalised the same way before lookup).
// Only aliases for codes present in AIRPORT_TO_CITY belong here.
const CITY_ALIASES: Record<string, string> = {
  sevilla: 'SVQ',
  seville: 'SVQ',
  roma: 'FCO',
  milano: 'MXP',
  venezia: 'VCE',
  napoli: 'NAP',
  munchen: 'MUC',
  muenchen: 'MUC',
  koln: 'CGN',
  koeln: 'CGN',
  cologne: 'CGN',
  wien: 'VIE',
  praha: 'PRG',
  warszawa: 'WAW',
  lisboa: 'LIS',
  kobenhavn: 'CPH',
  copenhague: 'CPH',
  goteborg: 'GOT',
  gothenburg: 'GOT',
  athina: 'ATH',
  geneve: 'GVA',
  genf: 'GVA',
  zuerich: 'ZRH',
  bruxelles: 'BRU',
  brussel: 'BRU',
  mallorca: 'PMI',
  majorca: 'PMI',
  palma: 'PMI',
  duesseldorf: 'DUS',
  krakow: 'KRK',
  cracow: 'KRK',
  kerkyra: 'CFU',
  thira: 'JTR',
  bucuresti: 'OTP',
  beograd: 'BEG',
  lissabon: 'LIS',
  eivissa: 'IBZ',
  malaga: 'AGP',
  reykjavik: 'KEF',
  gdansk: 'GDN',
  wroclaw: 'WRO',
  marseilles: 'MRS',
};

// Strip diacritics and case so "Málaga", "malaga" and "MALAGA" are one key.
const normalizeCityQuery = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

// Build reverse mapping from city to airport codes (lowercase keys for ease of lookup)
export const CITY_TO_CODE: Record<string, string[]> = {};

Object.entries(AIRPORT_TO_CITY).forEach(([code, city]) => {
  const key = normalizeCityQuery(city);
  if (!CITY_TO_CODE[key]) {
    CITY_TO_CODE[key] = [];
  }
  CITY_TO_CODE[key].push(code);
});

// Helper to look up airport code from a city name query
export function getCodesForCityQuery(query: string): string[] {
  const cleanQuery = normalizeCityQuery(query);
  if (!cleanQuery) return [];

  // Find cities matching query
  const matchingCodes: string[] = [];
  Object.entries(CITY_TO_CODE).forEach(([city, codes]) => {
    if (city.includes(cleanQuery)) {
      matchingCodes.push(...codes);
    }
  });

  // Alternate spelling of a city we DO serve ("sevilla" -> SVQ). Checked after
  // the English labels so an exact label match keeps its existing behaviour.
  // Three characters minimum: a 1-2 letter fragment is a substring of half the
  // alias table and would resolve to an arbitrary city.
  if (cleanQuery.length >= 3) {
    Object.entries(CITY_ALIASES).forEach(([alias, code]) => {
      if (alias.includes(cleanQuery) && AIRPORT_TO_CITY[code] && !matchingCodes.includes(code)) {
        matchingCodes.push(code);
      }
    });
  }

  // Also match raw codes just in case
  const upperQuery = cleanQuery.toUpperCase();
  if (AIRPORT_TO_CITY[upperQuery] && !matchingCodes.includes(upperQuery)) {
    matchingCodes.push(upperQuery);
  }

  return matchingCodes;
}

// Get city name for display or default to code
export function getCityName(code: string): string {
  return AIRPORT_TO_CITY[code] || code;
}

/** Destination cities in-network that count as Eastern Europe. */
export const EASTERN_EUROPE_CITIES = [
  'Warsaw',
  'Krakow',
  'Gdansk',
  'Katowice',
  'Wroclaw',
  'Prague',
  'Bratislava',
  'Kosice',
  'Budapest',
  'Bucharest',
  'Cluj-Napoca',
  'Iasi',
  'Sofia',
  'Varna',
  'Tallinn',
  'Riga',
  'Vilnius',
  'Kaunas',
  'Zagreb',
  'Split',
  'Dubrovnik',
  'Ljubljana',
  'Belgrade',
  'Sarajevo',
  'Tirana',
  'Skopje',
  'Ohrid',
  'Chisinau',
  'Podgorica',
  'Tivat',
] as const;

/** Airport codes for the Eastern Europe allowlist (cached). */
let _easternCodes: Set<string> | null = null;
export const easternEuropeAirportCodes = (): Set<string> => {
  if (_easternCodes) return _easternCodes;
  const codes = new Set<string>();
  for (const city of EASTERN_EUROPE_CITIES) {
    for (const c of getCodesForCityQuery(city)) codes.add(c);
  }
  _easternCodes = codes;
  return codes;
};

// Get all unique destination city names (excluding London airports) for autocomplete suggestions
export const DESTINATION_CITIES = Array.from(
  new Set(
    Object.entries(AIRPORT_TO_CITY)
      .filter(([code]) => !["LHR", "LGW", "STN", "LTN", "LCY", "SEN"].includes(code))
      .map(([, city]) => city)
  )
).sort();
