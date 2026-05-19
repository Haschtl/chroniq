import { writeFile } from "node:fs/promises";

const endpoint = "https://query.wikidata.org/sparql";

const autoquartettQuery = `
SELECT ?item ?itemLabel ?manufacturerLabel ?image ?inception ?powerAmount ?powerUnitLabel ?topSpeed ?mass ?length ?width ?height ?countryLabel ?vehicleClassLabel ?article ?sitelinks WHERE {
  ?item wdt:P31 wd:Q3231690;
        wdt:P18 ?image;
        wdt:P176 ?manufacturer;
        wikibase:sitelinks ?sitelinks.
  OPTIONAL { ?item wdt:P571 ?inception. }
  OPTIONAL {
    ?item p:P2109 ?powerStatement.
    ?powerStatement psv:P2109 ?powerValue.
    ?powerValue wikibase:quantityAmount ?powerAmount;
                wikibase:quantityUnit ?powerUnit.
  }
  OPTIONAL { ?item wdt:P2052 ?topSpeed. }
  OPTIONAL { ?item wdt:P2067 ?mass. }
  OPTIONAL { ?item wdt:P2043 ?length. }
  OPTIONAL { ?item wdt:P2049 ?width. }
  OPTIONAL { ?item wdt:P2048 ?height. }
  OPTIONAL { ?item wdt:P495 ?country. }
  OPTIONAL { ?item wdt:P279 ?vehicleClass. }
  OPTIONAL {
    ?article schema:about ?item;
      schema:isPartOf <https://en.wikipedia.org/>.
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en,fr,it,es". }
}
ORDER BY DESC(?sitelinks) ?manufacturerLabel ?itemLabel
LIMIT 180
`;

const autoquartettPowerQuery = `
SELECT ?item ?itemLabel ?manufacturerLabel ?image ?inception ?powerAmount ?powerUnitLabel ?topSpeed ?mass ?length ?width ?height ?countryLabel ?vehicleClassLabel ?article ?sitelinks WHERE {
  ?item wdt:P31/wdt:P279* wd:Q3231690;
        wdt:P18 ?image;
        wdt:P176 ?manufacturer;
        p:P2109 ?powerStatement.
  ?powerStatement psv:P2109 ?powerValue.
  ?powerValue wikibase:quantityAmount ?powerAmount;
              wikibase:quantityUnit ?powerUnit.
  OPTIONAL { ?item wikibase:sitelinks ?sitelinks. }
  OPTIONAL { ?item wdt:P571 ?inception. }
  OPTIONAL { ?item wdt:P2052 ?topSpeed. }
  OPTIONAL { ?item wdt:P2067 ?mass. }
  OPTIONAL { ?item wdt:P2043 ?length. }
  OPTIONAL { ?item wdt:P2049 ?width. }
  OPTIONAL { ?item wdt:P2048 ?height. }
  OPTIONAL { ?item wdt:P495 ?country. }
  OPTIONAL { ?item wdt:P279 ?vehicleClass. }
  OPTIONAL {
    ?article schema:about ?item;
      schema:isPartOf <https://en.wikipedia.org/>.
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en,fr,it,es". }
}
ORDER BY DESC(?sitelinks) ?manufacturerLabel ?itemLabel
LIMIT 80
`;

const artworksQuery = `
SELECT ?item ?itemLabel ?creatorLabel ?image ?inception ?movementLabel ?genreLabel ?collectionLabel ?materialLabel ?countryLabel ?article ?sitelinks WHERE {
  VALUES ?artType { wd:Q3305213 wd:Q860861 }
  ?item wdt:P31 ?artType;
        wdt:P18 ?image;
        wikibase:sitelinks ?sitelinks.
  OPTIONAL { ?item wdt:P170 ?creator. }
  OPTIONAL { ?item wdt:P571 ?inception. }
  OPTIONAL { ?item wdt:P135 ?movement. }
  OPTIONAL { ?item wdt:P136 ?genre. }
  OPTIONAL { ?item wdt:P195 ?collection. }
  OPTIONAL { ?item wdt:P186 ?material. }
  OPTIONAL { ?item wdt:P495 ?country. }
  OPTIONAL {
    ?article schema:about ?item;
      schema:isPartOf <https://en.wikipedia.org/>.
  }
  FILTER(?sitelinks >= 25)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en,fr,it,es". }
}
ORDER BY DESC(?sitelinks) ?itemLabel
LIMIT 220
`;

const queryWikidata = async (query) => {
  const url = `${endpoint}?${new URLSearchParams({ query, format: "json" })}`;
  let lastStatus = "";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": "ChronIQ dataset builder (local development)",
      },
    });
    if (response.ok) return response.json();
    lastStatus = String(response.status);
    await new Promise((resolve) => setTimeout(resolve, attempt * 1250));
  }
  throw new Error(`Wikidata request failed: ${lastStatus}`);
};

const value = (binding, key) => binding[key]?.value ?? "";
const numberValue = (binding, key) => {
  const number = Number(value(binding, key));
  return Number.isFinite(number) ? number : undefined;
};
const yearValue = (binding, key) => {
  const raw = value(binding, key);
  if (!raw) return undefined;
  const year = new Date(raw).getUTCFullYear();
  return Number.isFinite(year) ? year : undefined;
};
const entityId = (url) => url.split("/").pop() ?? url;

const toHorsepower = (amount, unitLabel) => {
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const unit = unitLabel.toLowerCase();
  if (unit.includes("watt") && !unit.includes("kilowatt")) return Math.round(amount / 735.499);
  if (unit.includes("kilowatt")) return Math.round(amount * 1.35962);
  return Math.round(amount);
};

const normalizeAutoquartett = (data) => {
  const seen = new Set();
  return (data.results?.bindings ?? [])
    .map((binding) => {
      const sourceUrl = value(binding, "item");
      const id = entityId(sourceUrl);
      const horsepower = toHorsepower(numberValue(binding, "powerAmount"), value(binding, "powerUnitLabel"));
      if (!id || seen.has(id)) return undefined;
      seen.add(id);
      const manufacturer = value(binding, "manufacturerLabel");
      const model = value(binding, "itemLabel");
      const topSpeedKmh = numberValue(binding, "topSpeed");
      return {
        id,
        title: model,
        manufacturer,
        model,
        year: yearValue(binding, "inception"),
        horsepower,
        topSpeedKmh: topSpeedKmh && topSpeedKmh > 0 ? topSpeedKmh : undefined,
        massKg: numberValue(binding, "mass"),
        lengthMm: numberValue(binding, "length"),
        widthMm: numberValue(binding, "width"),
        heightMm: numberValue(binding, "height"),
        country: value(binding, "countryLabel"),
        vehicleClass: value(binding, "vehicleClassLabel"),
        sitelinks: numberValue(binding, "sitelinks"),
        image: value(binding, "image"),
        sourceUrl,
        wikipediaUrl: value(binding, "article"),
      };
    })
    .filter(Boolean)
    .filter((entry) => entry.manufacturer && !/^Q\d+$/.test(entry.manufacturer) && entry.model && entry.image);
};

const normalizeArtworks = (data) => {
  const seen = new Set();
  return (data.results?.bindings ?? [])
    .map((binding) => {
      const sourceUrl = value(binding, "item");
      const id = entityId(sourceUrl);
      if (!id || seen.has(id)) return undefined;
      seen.add(id);
      return {
        id,
        title: value(binding, "itemLabel"),
        artist: value(binding, "creatorLabel"),
        year: yearValue(binding, "inception"),
        movement: value(binding, "movementLabel"),
        genre: value(binding, "genreLabel"),
        collection: value(binding, "collectionLabel"),
        material: value(binding, "materialLabel"),
        country: value(binding, "countryLabel"),
        sitelinks: numberValue(binding, "sitelinks"),
        image: value(binding, "image"),
        sourceUrl,
        wikipediaUrl: value(binding, "article"),
      };
    })
    .filter(Boolean)
    .filter((entry) => entry.title && entry.image);
};

const writeDataset = async (path, title, query, items) => {
  await writeFile(
    path,
    `${JSON.stringify(
      {
        title,
        generatedAt: new Date().toISOString(),
        license: "Structured data from Wikidata (CC0). Image URLs point to Wikimedia Commons files with per-file licenses.",
        source: "https://query.wikidata.org/",
        query,
        items,
      },
      null,
      2,
    )}\n`,
  );
};

const main = async () => {
  const autoquartett = await queryWikidata(autoquartettQuery);
  const autoquartettPower = await queryWikidata(autoquartettPowerQuery);
  const artworks = await queryWikidata(artworksQuery);

  const autoquartettItems = mergeById([
    ...normalizeAutoquartett(autoquartett),
    ...normalizeAutoquartett(autoquartettPower),
  ]);
  const artworkItems = normalizeArtworks(artworks);

  await writeDataset("public/data/autoquartett.wikidata.json", "Autoquartett Wikidata", `${autoquartettQuery}\n\n# Power enrichment\n${autoquartettPowerQuery}`, autoquartettItems);
  await writeDataset("public/data/artworks.wikidata.json", "Berühmte Kunstwerke Wikidata", artworksQuery, artworkItems);

  console.log(`autoquartett: ${autoquartettItems.length}`);
  console.log(`artworks: ${artworkItems.length}`);
};

const mergeById = (items) => {
  const merged = new Map();
  for (const item of items) {
    const current = merged.get(item.id) ?? {};
    merged.set(item.id, { ...current, ...Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined && value !== "")) });
  }
  return [...merged.values()];
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
