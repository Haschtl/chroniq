import type { CustomSetupState, GameSettings, GuessEntry } from "../types";

export const createDefaultCustomSetup = (): CustomSetupState => ({
  sourceUrl: "",
  rawText: "",
  delimiter: "auto",
  hasHeader: true,
  columns: [],
  entries: [],
  mapping: {
    title: "",
    artist: "",
    order: "",
    image: "",
    audio: "",
  },
  orderLabel: "Wert",
  extraArtistGuess: true,
});

export const buildCustomEntries = (setup: CustomSetupState): CustomSetupState => {
  const delimiter = resolveDelimiter(setup.rawText, setup.delimiter);
  const rows = parseCsv(setup.rawText, delimiter).filter((row) => row.some((cell) => cell.trim()));
  const header = setup.hasHeader ? rows[0] ?? [] : [];
  const dataRows = setup.hasHeader ? rows.slice(1) : rows;
  const maxColumns = Math.max(header.length, ...rows.map((row) => row.length), 0);
  const columns = Array.from({ length: maxColumns }, (_, index) => header[index]?.trim() || `Spalte ${index + 1}`);
  const mapping = normalizeCustomMapping(setup.mapping, columns);
  const columnIndex = (name: string) => columns.indexOf(name);
  const titleIndex = columnIndex(mapping.title);
  const artistIndex = columnIndex(mapping.artist);
  const orderIndex = columnIndex(mapping.order);
  const imageIndex = columnIndex(mapping.image);
  const audioIndex = columnIndex(mapping.audio);

  const entries =
    orderIndex === -1
      ? []
      : dataRows
          .map((row, index) => {
            const orderValue = parseCustomNumber(row[orderIndex]);
            if (orderValue === undefined) return undefined;
            const title = titleIndex >= 0 ? row[titleIndex]?.trim() : "";
            const artist = artistIndex >= 0 ? row[artistIndex]?.trim() : "";
            const imageUrl = imageIndex >= 0 ? row[imageIndex]?.trim() : "";
            const audioUrl = audioIndex >= 0 ? row[audioIndex]?.trim() : "";
            const entry: GuessEntry = {
              id: `custom_${index + 1}`,
              used: false,
              title: title || `Karte ${index + 1}`,
              artist,
              year: orderValue,
            };
            if (imageUrl) {
              entry.image = { type: "image", url: imageUrl, alt: title || `Karte ${index + 1}` };
              entry.albumCover = entry.image;
            }
            if (audioUrl) {
              entry.audioPreview = { type: "audio", url: audioUrl, title, artist };
            }
            return entry;
          })
          .filter((entry): entry is GuessEntry => Boolean(entry));

  return {
    ...setup,
    columns,
    mapping,
    entries,
  };
};

export const resolveDelimiter = (rawText: string, delimiter: string) => {
  if (delimiter !== "auto") return delimiter;
  const firstLine = rawText.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];
  return candidates
    .map((candidate) => ({ candidate, count: firstLine.split(candidate).length }))
    .sort((left, right) => right.count - left.count)[0]?.candidate ?? ",";
};

export const parseCsv = (rawText: string, delimiter: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < rawText.length; index += 1) {
    const char = rawText[index];
    const next = rawText[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
};

export const createCustomGameSettings = (setup: CustomSetupState): GameSettings => ({
  name: "Custom",
  mode: "custom",
  stopCondition: { type: "maxPoints", points: 10 },
  cardChoiceCount: 3,
  presentSelector: {
    type: setup.mapping.audio ? "audio" : "image",
    key: setup.mapping.audio ? "audioPreview" : "image",
  },
  orderSelector: {
    key: "year",
    dir: "asc",
  },
  extraGuessSelectors: setup.extraArtistGuess ? [{ type: "text-loose", key: "artist", label: "Artist" }] : [],
  displaySelectors: [
    ...(setup.mapping.image ? [{ label: "Bild", key: "image", type: "image" as const }] : []),
    { label: setup.orderLabel || "Wert", key: "year", type: "text" as const },
  ],
});

const normalizeCustomMapping = (mapping: CustomSetupState["mapping"], columns: string[]) => ({
  title: columns.includes(mapping.title) ? mapping.title : guessColumn(columns, ["title", "titel", "name"]),
  artist: columns.includes(mapping.artist) ? mapping.artist : guessColumn(columns, ["artist", "kuenstler", "künstler", "maker"]),
  order: columns.includes(mapping.order) ? mapping.order : guessColumn(columns, ["year", "jahr", "date", "wert", "ps", "horsepower"]),
  image: columns.includes(mapping.image) ? mapping.image : guessColumn(columns, ["image", "bild", "cover", "imageurl", "url"]),
  audio: columns.includes(mapping.audio) ? mapping.audio : guessColumn(columns, ["audio", "preview", "mp3", "sound"]),
});

const guessColumn = (columns: string[], candidates: string[]) => {
  const normalizedCandidates = candidates.map(normalizeColumnName);
  return columns.find((column) => normalizedCandidates.some((candidate) => normalizeColumnName(column).includes(candidate))) ?? "";
};

const normalizeColumnName = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");

const parseCustomNumber = (value: string | undefined) => {
  const normalized = value?.trim().replace(",", ".").match(/-?\d+(\.\d+)?/)?.[0];
  if (!normalized) return undefined;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
};
