import type { GuessEntry, MediaData } from "./types";

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

interface SparqlBindingValue {
  value: string;
}

interface AutoquartettBinding {
  item?: SparqlBindingValue;
  itemLabel?: SparqlBindingValue;
  manufacturerLabel?: SparqlBindingValue;
  image?: SparqlBindingValue;
  inception?: SparqlBindingValue;
  powerAmount?: SparqlBindingValue;
  powerUnitLabel?: SparqlBindingValue;
}

interface SparqlResponse {
  results?: {
    bindings?: AutoquartettBinding[];
  };
}

export const loadWikidataAutoquartettEntries = async (limit = 60): Promise<GuessEntry[]> => {
  const response = await fetch(`${WIKIDATA_ENDPOINT}?${new URLSearchParams({ query: autoquartettQuery(limit), format: "json" })}`, {
    headers: {
      Accept: "application/sparql-results+json",
    },
  });

  if (!response.ok) {
    throw new Error(`Wikidata konnte nicht geladen werden (${response.status}).`);
  }

  const data = (await response.json()) as SparqlResponse;
  return (data.results?.bindings ?? []).map(toAutoquartettEntry).filter((entry): entry is GuessEntry => Boolean(entry));
};

const autoquartettQuery = (limit: number) => `
SELECT ?item ?itemLabel ?manufacturerLabel ?image ?inception ?powerAmount ?powerUnitLabel WHERE {
  ?item wdt:P31/wdt:P279* wd:Q3231690;
        wdt:P18 ?image;
        wdt:P176 ?manufacturer;
        wdt:P571 ?inception;
        p:P2109 ?powerStatement.
  ?powerStatement psv:P2109 ?powerValue.
  ?powerValue wikibase:quantityAmount ?powerAmount;
              wikibase:quantityUnit ?powerUnit.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }
}
ORDER BY MD5(CONCAT(STR(?item), STR(NOW())))
LIMIT ${Math.max(1, Math.min(200, limit))}
`;

const toAutoquartettEntry = (binding: AutoquartettBinding): GuessEntry | undefined => {
  const itemUrl = binding.item?.value;
  const model = binding.itemLabel?.value;
  const manufacturer = binding.manufacturerLabel?.value;
  const imageUrl = binding.image?.value;
  const year = binding.inception?.value ? new Date(binding.inception.value).getUTCFullYear() : undefined;
  const horsepower = toHorsepower(Number(binding.powerAmount?.value), binding.powerUnitLabel?.value ?? "");

  if (!itemUrl || !model || !manufacturer || !imageUrl || !year || !horsepower) return undefined;

  const image: Extract<MediaData, { type: "image" }> = {
    type: "image",
    url: imageUrl,
    alt: `${manufacturer} ${model}`,
  };

  return {
    id: `wikidata_${itemUrl.split("/").pop()}`,
    used: false,
    name: model,
    title: model,
    artist: manufacturer,
    manufacturer,
    year,
    horsepower,
    image,
    albumCover: image,
    sourceUrl: itemUrl,
  };
};

const toHorsepower = (amount: number, unitLabel: string) => {
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const unit = unitLabel.toLowerCase();
  if (unit.includes("watt") && !unit.includes("kilowatt")) return Math.round(amount / 735.499);
  if (unit.includes("kilowatt")) return Math.round(amount * 1.35962);
  return Math.round(amount);
};
