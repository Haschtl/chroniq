import type { CustomSetupState, GameSettings, GuessEntry, GuessValue, MediaData } from "../types";

const reservedCustomKeys = new Set(["id", "used", "guessedValues"]);

export const createDefaultCustomSetup = (): CustomSetupState => ({
  sourceUrl: "",
  rawText: "",
  format: "auto",
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
  cardBackKeys: [],
  cardFrontKeys: [],
  extraGuessKeys: [],
});

export const buildCustomEntries = (setup: CustomSetupState): CustomSetupState => {
  const parsed = parseCustomSource(setup);
  const columns = parsed.columns;
  const mapping = normalizeCustomMapping(setup.mapping, columns);
  const orderKey = mapping.order;
  const fallbackCardBackKeys = [mapping.audio ? "audioPreview" : "image"].filter(Boolean);
  const fallbackCardFrontKeys = [mapping.image ? "image" : "", mapping.title || "title", mapping.artist || "", orderKey || "year"].filter(Boolean);
  const fallbackExtraGuessKeys = setup.extraArtistGuess && mapping.artist ? [mapping.artist] : [];
  const cardBackKeys = normalizeCustomKeyList(setup.cardBackKeys, columns, fallbackCardBackKeys);
  const cardFrontKeys = normalizeCustomKeyList(setup.cardFrontKeys, columns, fallbackCardFrontKeys);
  const extraGuessKeys = normalizeCustomKeyList(setup.extraGuessKeys, columns, fallbackExtraGuessKeys);

  const entries = orderKey
    ? parsed.records
        .map((record, index) => createCustomEntry(record, index, mapping, orderKey))
        .filter((entry): entry is GuessEntry => Boolean(entry))
    : [];

  return {
    ...setup,
    columns,
    mapping,
    cardBackKeys,
    cardFrontKeys,
    extraGuessKeys,
    entries,
  };
};

export const parseCustomSource = (setup: CustomSetupState) => {
  const format = resolveCustomFormat(setup.rawText, setup.format);
  return format === "json" ? parseJsonRecords(setup.rawText) : parseTableRecords(setup);
};

export const resolveCustomFormat = (rawText: string, format: CustomSetupState["format"] = "auto") => {
  if (format !== "auto") return format;
  const trimmed = rawText.trim();
  return trimmed.startsWith("[") || trimmed.startsWith("{") ? "json" : "csv";
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
  presentSelector: getCustomPresentSelector(setup.cardBackKeys[0] ?? setup.mapping.audio ?? setup.mapping.image),
  presentSelectors: setup.cardBackKeys.map(getCustomPresentSelector),
  orderSelector: {
    key: setup.mapping.order || "year",
    dir: "asc",
  },
  extraGuessSelectors: setup.extraGuessKeys.map((key) => ({ label: getCustomKeyLabel(key, setup), key, type: "text-loose" })),
  displaySelectors: setup.cardFrontKeys.map((key) => getCustomDisplaySelector(key, setup)),
});

const parseTableRecords = (setup: CustomSetupState) => {
  const delimiter = resolveDelimiter(setup.rawText, setup.delimiter);
  const rows = parseCsv(setup.rawText, delimiter).filter((row) => row.some((cell) => cell.trim()));
  const header = setup.hasHeader ? rows[0] ?? [] : [];
  const dataRows = setup.hasHeader ? rows.slice(1) : rows;
  const maxColumns = Math.max(header.length, ...rows.map((row) => row.length), 0);
  const columns = Array.from({ length: maxColumns }, (_, index) => header[index]?.trim() || `Spalte ${index + 1}`);
  const records = dataRows.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]?.trim() ?? ""])));
  return { columns, records, rowCount: dataRows.length };
};

const parseJsonRecords = (rawText: string) => {
  const parsed = JSON.parse(rawText) as unknown;
  const items = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.items) ? parsed.items : [];
  const records = items.filter(isRecord).map((record) => flattenRecord(record));
  const columns = Array.from(new Set(records.flatMap((record) => Object.keys(record))));
  return { columns, records, rowCount: records.length };
};

const createCustomEntry = (
  record: Record<string, string>,
  index: number,
  mapping: CustomSetupState["mapping"],
  orderKey: string,
) => {
  const orderValue = parseCustomNumber(record[orderKey]);
  if (orderValue === undefined) return undefined;
  const title = mapping.title ? record[mapping.title]?.trim() : "";
  const artist = mapping.artist ? record[mapping.artist]?.trim() : "";
  const imageUrl = mapping.image ? record[mapping.image]?.trim() : "";
  const audioUrl = mapping.audio ? record[mapping.audio]?.trim() : "";
  const entry: GuessEntry = {
    id: `custom_${index + 1}`,
    used: false,
    title: title || `Karte ${index + 1}`,
    artist,
    year: orderValue,
    [orderKey]: orderValue,
  };

  for (const [key, value] of Object.entries(record)) {
    if (!key || reservedCustomKeys.has(key) || value === "") continue;
    if (key === orderKey) {
      entry[key] = orderValue;
    } else if (key !== mapping.image && key !== mapping.audio) {
      entry[key] = value;
    }
  }

  if (imageUrl) {
    const image = { type: "image", url: imageUrl, alt: title || `Karte ${index + 1}` } satisfies Extract<MediaData, { type: "image" }>;
    entry.image = image;
    entry.albumCover = image;
    if (mapping.image) entry[mapping.image] = image;
  }
  if (audioUrl) {
    const audio = { type: "audio", url: audioUrl, title, artist } satisfies Extract<MediaData, { type: "audio" }>;
    entry.audioPreview = audio;
    if (mapping.audio) entry[mapping.audio] = audio;
  }
  return entry;
};

const normalizeCustomMapping = (mapping: CustomSetupState["mapping"], columns: string[]) => ({
  title: columns.includes(mapping.title) ? mapping.title : guessColumn(columns, ["title", "titel", "name"]),
  artist: columns.includes(mapping.artist) ? mapping.artist : guessColumn(columns, ["artist", "kuenstler", "künstler", "maker", "author"]),
  order: columns.includes(mapping.order) ? mapping.order : guessColumn(columns, ["year", "jahr", "date", "wert", "ps", "horsepower"]),
  image: columns.includes(mapping.image) ? mapping.image : guessColumn(columns, ["image", "bild", "cover", "imageurl", "url"]),
  audio: columns.includes(mapping.audio) ? mapping.audio : guessColumn(columns, ["audio", "preview", "mp3", "sound"]),
});

const normalizeCustomKeyList = (keys: string[] | undefined, columns: string[], fallback: string[]) => {
  const allowed = new Set([...columns, "image", "albumCover", "audioPreview", "title", "artist", "year"]);
  const normalized = (keys ?? []).filter((key, index, all) => allowed.has(key) && all.indexOf(key) === index);
  const fallbackKeys = fallback.filter((key, index, all) => allowed.has(key) && all.indexOf(key) === index);
  return normalized.length ? normalized : fallbackKeys;
};

const getCustomPresentSelector = (key: string): GameSettings["presentSelector"] => {
  if (key === "audioPreview") return { type: "audio", key };
  if (key === "image" || key === "albumCover") return { type: "image", key };
  return { type: "auto", key };
};

const getCustomDisplaySelector = (key: string, setup: CustomSetupState): GameSettings["displaySelectors"][number] => ({
  label: getCustomKeyLabel(key, setup),
  key,
  type: key === "image" || key === "albumCover" || key === setup.mapping.image ? "image" : "text",
});

const getCustomKeyLabel = (key: string, setup: CustomSetupState) => {
  if (key === setup.mapping.order || key === "year") return setup.orderLabel || key;
  if (key === "audioPreview") return "Audio";
  if (key === "albumCover" || key === "image") return "Bild";
  return key;
};

const guessColumn = (columns: string[], candidates: string[]) => {
  const normalizedCandidates = candidates.map(normalizeColumnName);
  return columns.find((column) => normalizedCandidates.some((candidate) => normalizeColumnName(column).includes(candidate))) ?? "";
};

const flattenRecord = (record: Record<string, unknown>, prefix = ""): Record<string, string> =>
  Object.fromEntries(
    Object.entries(record).flatMap(([key, value]) => {
      const nextKey = prefix ? `${prefix}.${key}` : key;
      if (isRecord(value)) return Object.entries(flattenRecord(value, nextKey));
      if (Array.isArray(value)) return [[nextKey, value.map(formatJsonValue).join(", ")]];
      return [[nextKey, formatJsonValue(value)]];
    }),
  );

const formatJsonValue = (value: unknown) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

const normalizeColumnName = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");

const parseCustomNumber = (value: GuessValue | undefined) => {
  const normalized = String(value ?? "").trim().replace(",", ".").match(/-?\d+(\.\d+)?/)?.[0];
  if (!normalized) return undefined;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
