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

// Get all unique destination city names (excluding London airports) for autocomplete suggestions
export const DESTINATION_CITIES = Array.from(
  new Set(
    Object.entries(AIRPORT_TO_CITY)
      .filter(([code]) => !["LHR", "LGW", "STN", "LTN", "LCY", "SEN"].includes(code))
      .map(([, city]) => city)
  )
).sort();

// ─── Generative-UI additions: display-only static data ───

// Country per city, for destination cards ("Barcelona, Spain")
export const CITY_TO_COUNTRY: Record<string, string> = {
  "London Heathrow": "United Kingdom", "London Gatwick": "United Kingdom",
  "London Stansted": "United Kingdom", "London Luton": "United Kingdom",
  "London City": "United Kingdom", "London Southend": "United Kingdom",
  Aarhus: "Denmark", Malaga: "Spain", Alicante: "Spain", Amsterdam: "Netherlands",
  Stockholm: "Sweden", Athens: "Greece", Barcelona: "Spain", Belgrade: "Serbia",
  Berlin: "Germany", Bergen: "Norway", Bilbao: "Spain", Billund: "Denmark",
  Bologna: "Italy", Bordeaux: "France", Burgas: "Bulgaria", Bari: "Italy",
  Brussels: "Belgium", Basel: "Switzerland", Bratislava: "Slovakia", Budapest: "Hungary",
  Paris: "France", Corfu: "Greece", Cologne: "Germany", "Cluj-Napoca": "Romania",
  Copenhagen: "Denmark", Catania: "Italy", Dubrovnik: "Croatia", Dublin: "Ireland",
  Dusseldorf: "Germany", Eindhoven: "Netherlands", Faro: "Portugal", Rome: "Italy",
  Frankfurt: "Germany", Gdansk: "Poland", Gothenburg: "Sweden", Geneva: "Switzerland",
  Hamburg: "Germany", Helsinki: "Finland", Heraklion: "Greece", Iasi: "Romania",
  Ibiza: "Spain", Innsbruck: "Austria", Istanbul: "Turkey", Mykonos: "Greece",
  Santorini: "Greece", Reykjavik: "Iceland", Chisinau: "Moldova", Krakow: "Poland",
  Kosice: "Slovakia", Katowice: "Poland", Kaunas: "Lithuania", Lisbon: "Portugal",
  Ljubljana: "Slovenia", "Las Palmas": "Spain", Luxembourg: "Luxembourg", Lyon: "France",
  Madrid: "Spain", Malta: "Malta", Marseille: "France", Munich: "Germany",
  Milan: "Italy", Naples: "Italy", Nice: "France", Ohrid: "North Macedonia",
  Porto: "Portugal", Cork: "Ireland", Oslo: "Norway", Bucharest: "Romania",
  "Palma de Mallorca": "Spain", Palermo: "Italy", Prague: "Czechia", Pisa: "Italy",
  Rhodes: "Greece", Riga: "Latvia", Rotterdam: "Netherlands", Rovaniemi: "Finland",
  Sarajevo: "Bosnia & Herzegovina", Thessaloniki: "Greece", Skopje: "North Macedonia",
  Shannon: "Ireland", Sofia: "Bulgaria", Split: "Croatia", Seville: "Spain",
  Salzburg: "Austria", Tenerife: "Spain", Podgorica: "Montenegro", Tirana: "Albania",
  Tivat: "Montenegro", Tallinn: "Estonia", Toulouse: "France", Tampere: "Finland",
  Tromso: "Norway", Varna: "Bulgaria", Venice: "Italy", Vienna: "Austria",
  Valencia: "Spain", Vilnius: "Lithuania", Warsaw: "Poland", Wroclaw: "Poland",
  Zagreb: "Croatia", Zurich: "Switzerland",
};

export function getCityCountry(city: string): string {
  return CITY_TO_COUNTRY[city] || "";
}

// Approximate airport coordinates [lat, lon] for the SVG map view.
export const AIRPORT_COORDS: Record<string, [number, number]> = {
  LHR: [51.47, -0.46], LGW: [51.15, -0.19], STN: [51.89, 0.24], LTN: [51.87, -0.37],
  LCY: [51.51, 0.05], SEN: [51.57, 0.70],
  AAR: [56.30, 10.62], AGP: [36.67, -4.50], ALC: [38.28, -0.56], AMS: [52.31, 4.76],
  ARN: [59.65, 17.92], ATH: [37.94, 23.94], BCN: [41.30, 2.08], BEG: [44.82, 20.29],
  BER: [52.36, 13.50], BGO: [60.29, 5.22], BIO: [43.30, -2.91], BLL: [55.74, 9.15],
  BLQ: [44.53, 11.29], BOD: [44.83, -0.70], BOJ: [42.57, 27.52], BRI: [41.14, 16.76],
  BRU: [50.90, 4.48], BSL: [47.59, 7.53], BTS: [48.17, 17.21], BUD: [47.44, 19.26],
  CDG: [49.01, 2.55], CFU: [39.60, 19.91], CGN: [50.87, 7.14], CLJ: [46.79, 23.69],
  CPH: [55.62, 12.65], CTA: [37.47, 15.06], DBV: [42.56, 18.27], DUB: [53.42, -6.27],
  DUS: [51.29, 6.77], EIN: [51.45, 5.37], FAO: [37.01, -7.97], FCO: [41.80, 12.25],
  FRA: [50.03, 8.57], GDN: [54.38, 18.47], GOT: [57.66, 12.28], GVA: [46.24, 6.11],
  HAM: [53.63, 10.00], HEL: [60.32, 24.96], HER: [35.34, 25.18], IAS: [47.18, 27.62],
  IBZ: [38.87, 1.37], INN: [47.26, 11.34], IST: [41.26, 28.74], JMK: [37.44, 25.35],
  JTR: [36.40, 25.48], KEF: [63.99, -22.61], KIV: [46.93, 28.93], KRK: [50.08, 19.78],
  KSC: [48.66, 21.24], KTW: [50.47, 19.08], KUN: [54.96, 24.08], LIS: [38.77, -9.13],
  LJU: [46.22, 14.46], LPA: [27.93, -15.39], LUX: [49.63, 6.20], LYS: [45.73, 5.08],
  MAD: [40.47, -3.56], MLA: [35.86, 14.48], MRS: [43.44, 5.22], MUC: [48.35, 11.79],
  MXP: [45.63, 8.72], NAP: [40.88, 14.29], NCE: [43.66, 7.22], OHD: [41.18, 20.74],
  OPO: [41.24, -8.68], ORK: [51.84, -8.49], OSL: [60.19, 11.10], OTP: [44.57, 26.10],
  PMI: [39.55, 2.74], PMO: [38.18, 13.10], PRG: [50.10, 14.26], PSA: [43.68, 10.39],
  RHO: [36.41, 28.09], RIX: [56.92, 23.97], RTM: [51.96, 4.44], RVN: [66.56, 25.83],
  SJJ: [43.82, 18.33], SKG: [40.52, 22.97], SKP: [41.96, 21.62], SNN: [52.70, -8.92],
  SOF: [42.70, 23.41], SPU: [43.54, 16.30], SVQ: [37.42, -5.90], SZG: [47.79, 13.00],
  TFS: [28.04, -16.57], TGD: [42.36, 19.25], TIA: [41.41, 19.72], TIV: [42.40, 18.72],
  TLL: [59.41, 24.83], TLS: [43.63, 1.37], TMP: [61.41, 23.60], TOS: [69.68, 18.92],
  VAR: [43.23, 27.83], VCE: [45.51, 12.35], VIE: [48.11, 16.57], VLC: [39.49, -0.48],
  VNO: [54.63, 25.29], WAW: [52.17, 20.97], WRO: [51.10, 16.89], ZAG: [45.74, 16.07],
  ZRH: [47.46, 8.55],
};
