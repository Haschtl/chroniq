import { initialAppState, playerColors } from "../game";
import type {
  AppLanguage,
  AppState,
  AppTheme,
  FinishedGameSummary,
  Game,
  GameMode,
  GuessEntry,
  Player,
  SetupState,
  StopCondition,
} from "../types";
import { createDefaultCustomSetup } from "./customCsv";
import { normalizeSpotifyAdvancedSettings } from "./setupOptions";

const gameModes: GameMode[] = ["spotify-generator", "image-art", "autoquartett", "replay", "custom"];
const themes: AppTheme[] = ["system", "light", "dark"];
const languages: AppLanguage[] = ["de", "en"];

export const normalizeAppState = (raw: unknown): AppState => {
  const base = initialAppState();
  if (!isRecord(raw) || raw.schemaVersion !== 1) return base;

  const parsed = raw as Partial<AppState>;
  return {
    ...base,
    ...parsed,
    preferences: {
      theme: themes.includes(parsed.preferences?.theme as AppTheme) ? parsed.preferences!.theme : base.preferences.theme,
      language: languages.includes(parsed.preferences?.language as AppLanguage)
        ? parsed.preferences!.language
        : base.preferences.language,
    },
    setup: normalizeSetup(parsed.setup),
    activeGame: normalizeGame(parsed.activeGame),
    connectors: Array.isArray(parsed.connectors) ? parsed.connectors : [],
    history: Array.isArray(parsed.history) ? parsed.history.map(normalizeHistoryEntry).filter(isDefined) : [],
  };
};

const normalizeSetup = (setup: unknown): SetupState | undefined => {
  if (!isRecord(setup)) return undefined;
  const mode = gameModes.includes(setup.mode as GameMode) ? (setup.mode as GameMode) : "spotify-generator";
  const players = Array.isArray(setup.players) && setup.players.length >= 2
    ? setup.players.map((player, index) => ({
        name: isRecord(player) && typeof player.name === "string" ? player.name : `Team ${index + 1}`,
        color: isRecord(player) && typeof player.color === "string" ? player.color : playerColors[index % playerColors.length],
      }))
    : createDefaultSetupPlayers();

  return {
    gameName: typeof setup.gameName === "string" ? setup.gameName : "",
    mode,
    players,
    cardChoiceCount: normalizeCardChoiceCount(setup.cardChoiceCount),
    spotifySeed: typeof setup.spotifySeed === "string" ? setup.spotifySeed : "",
    spotifyEntries: normalizeEntries(setup.spotifyEntries),
    spotifyGeneratedCount: asNumber(setup.spotifyGeneratedCount, normalizeEntries(setup.spotifyEntries)?.length ?? 0),
    spotifyExhausted: Boolean(setup.spotifyExhausted),
    spotifyAdvanced: normalizeSpotifyAdvancedSettings(isRecord(setup.spotifyAdvanced) ? setup.spotifyAdvanced : undefined),
    custom: normalizeCustomSetup(setup.custom),
    replayHistoryId: typeof setup.replayHistoryId === "string" ? setup.replayHistoryId : "",
    spotifyPreview: isRecord(setup.spotifyPreview) ? (setup.spotifyPreview as SetupState["spotifyPreview"]) : undefined,
    stopCondition: normalizeStopCondition(setup.stopCondition),
  };
};

const normalizeCustomSetup = (custom: unknown) => {
  const base = createDefaultCustomSetup();
  if (!isRecord(custom)) return base;
  const mapping = isRecord(custom.mapping) ? custom.mapping : {};
  return {
    ...base,
    ...custom,
    sourceUrl: typeof custom.sourceUrl === "string" ? custom.sourceUrl : base.sourceUrl,
    rawText: typeof custom.rawText === "string" ? custom.rawText : base.rawText,
    format: custom.format === "csv" || custom.format === "json" || custom.format === "auto" ? custom.format : base.format,
    delimiter: typeof custom.delimiter === "string" ? custom.delimiter : base.delimiter,
    hasHeader: typeof custom.hasHeader === "boolean" ? custom.hasHeader : base.hasHeader,
    columns: Array.isArray(custom.columns) ? custom.columns.filter((column): column is string => typeof column === "string") : base.columns,
    entries: normalizeEntries(custom.entries) ?? base.entries,
    mapping: {
      title: typeof mapping.title === "string" ? mapping.title : base.mapping.title,
      artist: typeof mapping.artist === "string" ? mapping.artist : base.mapping.artist,
      order: typeof mapping.order === "string" ? mapping.order : base.mapping.order,
      image: typeof mapping.image === "string" ? mapping.image : base.mapping.image,
      audio: typeof mapping.audio === "string" ? mapping.audio : base.mapping.audio,
    },
    orderLabel: typeof custom.orderLabel === "string" ? custom.orderLabel : base.orderLabel,
    extraArtistGuess: typeof custom.extraArtistGuess === "boolean" ? custom.extraArtistGuess : base.extraArtistGuess,
    cardBackKeys: Array.isArray(custom.cardBackKeys) ? custom.cardBackKeys.filter((key): key is string => typeof key === "string") : base.cardBackKeys,
    cardFrontKeys: Array.isArray(custom.cardFrontKeys) ? custom.cardFrontKeys.filter((key): key is string => typeof key === "string") : base.cardFrontKeys,
    extraGuessKeys: Array.isArray(custom.extraGuessKeys) ? custom.extraGuessKeys.filter((key): key is string => typeof key === "string") : base.extraGuessKeys,
  };
};

const normalizeGame = (game: unknown): Game | undefined => {
  if (!isRecord(game)) return undefined;
  if (!Array.isArray(game.players) || !isRecord(game.settings) || !isRecord(game.generator)) return undefined;
  return {
    ...(game as unknown as Game),
    settings: {
      ...(game.settings as unknown as Game["settings"]),
      cardChoiceCount: normalizeCardChoiceCount(game.settings.cardChoiceCount),
    },
    players: game.players.map(normalizePlayer),
    guessEntries: normalizeEntries(game.guessEntries) ?? [],
    activeRound: isRecord(game.activeRound)
      ? {
          ...(game.activeRound as unknown as NonNullable<Game["activeRound"]>),
          extraGuesses: isRecord(game.activeRound.extraGuesses) ? stringifyRecord(game.activeRound.extraGuesses) : {},
        }
      : undefined,
  };
};

const normalizeHistoryEntry = (entry: unknown): FinishedGameSummary | undefined => {
  if (!isRecord(entry) || typeof entry.id !== "string") return undefined;
  const players = Array.isArray(entry.players) ? entry.players.map(normalizeHistoryPlayer) : [];
  const replayEntries = normalizeEntries(entry.replayEntries) ?? [];
  const playerTimelines = Array.isArray(entry.playerTimelines)
    ? entry.playerTimelines
        .filter(isRecord)
        .map((timelineEntry) => ({
          id: typeof timelineEntry.id === "string" ? timelineEntry.id : "",
          timeline: normalizeEntries(timelineEntry.timeline) ?? [],
        }))
        .filter((timelineEntry) => timelineEntry.id)
    : players.map((player) => ({ id: player.id, timeline: [] }));

  return {
    ...(entry as unknown as FinishedGameSummary),
    name: typeof entry.name === "string" ? entry.name : "Spiel",
    startedAt: typeof entry.startedAt === "string" ? entry.startedAt : new Date().toISOString(),
    finishedAt: typeof entry.finishedAt === "string" ? entry.finishedAt : new Date().toISOString(),
    players,
    playerTimelines,
    winnerIds: Array.isArray(entry.winnerIds)
      ? entry.winnerIds.filter((winnerId): winnerId is string => typeof winnerId === "string")
      : [],
    rounds: asNumber(entry.rounds, 0),
    replayEntries,
  };
};

const normalizePlayer = (player: unknown, index: number): Player => {
  const source = isRecord(player) ? player : {};
  return {
    id: typeof source.id === "string" ? source.id : `player_${index + 1}`,
    name: typeof source.name === "string" ? source.name : `Team ${index + 1}`,
    color: typeof source.color === "string" ? source.color : playerColors[index % playerColors.length],
    points: asNumber(source.points, 0),
    timeline: normalizeEntries(source.timeline) ?? [],
    extraPoints: asNumber(source.extraPoints, 2),
  };
};

const normalizeHistoryPlayer = (player: unknown, index: number) => {
  const normalized = normalizePlayer(player, index);
  return {
    id: normalized.id,
    name: normalized.name,
    color: normalized.color,
    points: normalized.points,
  };
};

const normalizeEntries = (entries: unknown): GuessEntry[] | undefined =>
  Array.isArray(entries)
    ? entries
        .filter(isRecord)
        .filter((entry) => typeof entry.id === "string")
        .map((entry) => {
          const normalizedEntry = { ...(entry as unknown as GuessEntry) };
          if (isRecord(entry.guessedValues)) normalizedEntry.guessedValues = stringifyRecord(entry.guessedValues);
          else delete normalizedEntry.guessedValues;
          return normalizedEntry;
        })
    : undefined;

const normalizeStopCondition = (condition: unknown): StopCondition => {
  if (!isRecord(condition)) return { type: "maxPoints", points: 10 };
  if (condition.type === "maxRounds") return { type: "maxRounds", rounds: Math.max(1, asNumber(condition.rounds, 12)) };
  if (condition.type === "leadPoints") return { type: "leadPoints", points: Math.max(1, asNumber(condition.points, 3)) };
  return { type: "maxPoints", points: Math.max(1, asNumber(condition.points, 10)) };
};

const normalizeCardChoiceCount = (value: unknown) => Math.max(1, Math.min(20, Math.floor(asNumber(value, 3))));

const createDefaultSetupPlayers = () =>
  Array.from({ length: 3 }, (_, index) => ({
    name: `Team ${index + 1}`,
    color: playerColors[index],
  }));

const stringifyRecord = (record: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [key, typeof value === "string" ? value : String(value)]));

const asNumber = (value: unknown, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;
