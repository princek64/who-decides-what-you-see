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

// Country per city — display-only data for the destination autocomplete
// (Google Flights-style "Barcelona, Spain" rows). Not used in filtering.
export const CITY_TO_COUNTRY: Record<string, string> = {
  "London Heathrow": "United Kingdom",
  "London Gatwick": "United Kingdom",
  "London Stansted": "United Kingdom",
  "London Luton": "United Kingdom",
  "London City": "United Kingdom",
  "London Southend": "United Kingdom",
  Aarhus: "Denmark",
  Malaga: "Spain",
  Alicante: "Spain",
  Amsterdam: "Netherlands",
  Stockholm: "Sweden",
  Athens: "Greece",
  Barcelona: "Spain",
  Belgrade: "Serbia",
  Berlin: "Germany",
  Bergen: "Norway",
  Bilbao: "Spain",
  Billund: "Denmark",
  Bologna: "Italy",
  Bordeaux: "France",
  Burgas: "Bulgaria",
  Bari: "Italy",
  Brussels: "Belgium",
  Basel: "Switzerland",
  Bratislava: "Slovakia",
  Budapest: "Hungary",
  Paris: "France",
  Corfu: "Greece",
  Cologne: "Germany",
  "Cluj-Napoca": "Romania",
  Copenhagen: "Denmark",
  Catania: "Italy",
  Dubrovnik: "Croatia",
  Dublin: "Ireland",
  Dusseldorf: "Germany",
  Eindhoven: "Netherlands",
  Faro: "Portugal",
  Rome: "Italy",
  Frankfurt: "Germany",
  Gdansk: "Poland",
  Gothenburg: "Sweden",
  Geneva: "Switzerland",
  Hamburg: "Germany",
  Helsinki: "Finland",
  Heraklion: "Greece",
  Iasi: "Romania",
  Ibiza: "Spain",
  Innsbruck: "Austria",
  Istanbul: "Turkey",
  Mykonos: "Greece",
  Santorini: "Greece",
  Reykjavik: "Iceland",
  Chisinau: "Moldova",
  Krakow: "Poland",
  Kosice: "Slovakia",
  Katowice: "Poland",
  Kaunas: "Lithuania",
  Lisbon: "Portugal",
  Ljubljana: "Slovenia",
  "Las Palmas": "Spain",
  Luxembourg: "Luxembourg",
  Lyon: "France",
  Madrid: "Spain",
  Malta: "Malta",
  Marseille: "France",
  Munich: "Germany",
  Milan: "Italy",
  Naples: "Italy",
  Nice: "France",
  Ohrid: "North Macedonia",
  Porto: "Portugal",
  Cork: "Ireland",
  Oslo: "Norway",
  Bucharest: "Romania",
  "Palma de Mallorca": "Spain",
  Palermo: "Italy",
  Prague: "Czechia",
  Pisa: "Italy",
  Rhodes: "Greece",
  Riga: "Latvia",
  Rotterdam: "Netherlands",
  Rovaniemi: "Finland",
  Sarajevo: "Bosnia & Herzegovina",
  Thessaloniki: "Greece",
  Skopje: "North Macedonia",
  Shannon: "Ireland",
  Sofia: "Bulgaria",
  Split: "Croatia",
  Seville: "Spain",
  Salzburg: "Austria",
  Tenerife: "Spain",
  Podgorica: "Montenegro",
  Tirana: "Albania",
  Tivat: "Montenegro",
  Tallinn: "Estonia",
  Toulouse: "France",
  Tampere: "Finland",
  Tromso: "Norway",
  Varna: "Bulgaria",
  Venice: "Italy",
  Vienna: "Austria",
  Valencia: "Spain",
  Vilnius: "Lithuania",
  Warsaw: "Poland",
  Wroclaw: "Poland",
  Zagreb: "Croatia",
  Zurich: "Switzerland",
};

export function getCityCountry(city: string): string {
  return CITY_TO_COUNTRY[city] || "";
}

// Build reverse mapping from city to airport codes (lowercase keys for ease of lookup)
export const CITY_TO_CODE: Record<string, string[]> = {};

Object.entries(AIRPORT_TO_CITY).forEach(([code, city]) => {
  const key = city.toLowerCase();
  if (!CITY_TO_CODE[key]) {
    CITY_TO_CODE[key] = [];
  }
  CITY_TO_CODE[key].push(code);
});

// Helper to look up airport code from a city name query
export function getCodesForCityQuery(query: string): string[] {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return [];
  
  // Find cities matching query
  const matchingCodes: string[] = [];
  Object.entries(CITY_TO_CODE).forEach(([city, codes]) => {
    if (city.includes(cleanQuery)) {
      matchingCodes.push(...codes);
    }
  });

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

// Get all unique destination city names (excluding London airports) for autocomplete suggestions
export const DESTINATION_CITIES = Array.from(
  new Set(
    Object.entries(AIRPORT_TO_CITY)
      .filter(([code]) => !["LHR", "LGW", "STN", "LTN", "LCY", "SEN"].includes(code))
      .map(([, city]) => city)
  )
).sort();
