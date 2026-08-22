export * from '../../../shared/airportMap';

/** Country labels for destination cards / search UI. */
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
