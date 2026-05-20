import type { ReactNode } from "react";

export type MediaData =
  | {
      type: "audio";
      url: string;
      title?: string;
      artist?: string;
    }
  | {
      type: "image";
      url: string;
      alt?: string;
    };

export type GuessValue = number | string | boolean | MediaData | Record<string, string>;
export type GuessEntry = Record<string, GuessValue> & {
  id: string;
  used?: boolean;
  guessedValues?: Record<string, string>;
  name?: string;
  model?: string;
  title?: string;
  artist?: string;
  manufacturer?: string;
  year?: number;
  horsepower?: number;
  albumCover?: Extract<MediaData, { type: "image" }>;
  image?: Extract<MediaData, { type: "image" }>;
  audioPreview?: Extract<MediaData, { type: "audio" }>;
};

export interface Player {
  id: string;
  name: string;
  color: string;
  points: number;
  timeline: GuessEntry[];
  extraPoints: number;
}

export interface MaxPointsCondition {
  type: "maxPoints";
  points: number;
}

export interface MaxRoundsCondition {
  type: "maxRounds";
  rounds: number;
}

export interface LeadPointsCondition {
  type: "leadPoints";
  points: number;
}

export type StopCondition =
  | MaxPointsCondition
  | MaxRoundsCondition
  | LeadPointsCondition;

export interface GameSettings {
  name: string;
  mode: GameMode;
  stopCondition: StopCondition;
  cardChoiceCount: number;
  presentSelector: {
    type: "auto" | "audio" | "image" | "spotify";
    key: string;
  };
  presentSelectors?: {
    type: "auto" | "audio" | "image" | "spotify";
    key: string;
  }[];
  orderSelector: {
    key: string;
    dir: "asc" | "desc";
  };
  extraGuessSelectors: {
    label: string;
    key: string;
    type: "text-loose" | "number" | "text-exact";
  }[];
  displaySelectors: {
    type: "image" | "text";
    key: string;
    label: string;
  }[];
}

export interface GenerateEntriesContext {
  accessToken?: string;
  excludeIds?: string[];
}

export interface GeneratedEntriesResult {
  entries: GuessEntry[];
  nextIndex: number;
  exhausted?: boolean;
}

export interface GuessGenerator {
  id: string;
  label: string;
  type: GameMode;
  generatedCount: number;
  exhausted?: boolean;
  generateEntries?: (
    index: number,
    count: number,
    context?: GenerateEntriesContext,
  ) => GeneratedEntriesResult | Promise<GeneratedEntriesResult>;
  renderOptions?: () => ReactNode;
}

export interface SpotifyGeneratorSettings extends GuessGenerator {
  type: "spotify-generator";
  seed: string;
  connectorId: string;
}

export interface StaticGeneratorSettings extends GuessGenerator {
  type: "image-art" | "autoquartett" | "replay" | "custom";
}

export type GameGeneratorSettings = SpotifyGeneratorSettings | StaticGeneratorSettings;

export type GameMode = "spotify-generator" | "image-art" | "autoquartett" | "replay" | "custom";

export type ConnectorKind = "spotify";

export interface DataConnector {
  id: string;
  kind: ConnectorKind;
  label: string;
  status: "not-configured" | "configured";
  clientId?: string;
  auth?: {
    accessToken: string;
    refreshToken?: string;
    expiresAt: string;
    scope: string;
    tokenType: string;
  };
  account?: {
    id: string;
    displayName?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export type GamePhase =
  | "pick-card"
  | "present-card"
  | "place-card"
  | "extra-guesses"
  | "challenge"
  | "round-result"
  | "finished";

export interface RoundState {
  id: string;
  roundNumber: number;
  playerId: string;
  entryId?: string;
  proposedIndex?: number;
  extraGuesses: Record<string, string>;
  challengerId?: string;
  result?: RoundResult;
}

export interface RoundResult {
  activePlayerCorrect: boolean;
  challenged: boolean;
  challengerWasRight: boolean;
  awardedPlayerId?: string;
  correctionClaims?: RoundCorrectionClaim[];
  extraGuessesCorrect?: boolean;
  extraPointAwardedPlayerId?: string;
  message?: string;
}

export interface RoundCorrectionClaim {
  playerId: string;
  proposedIndex: number;
}

export interface Game {
  id: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  players: Player[];
  settings: GameSettings;
  generator: GameGeneratorSettings;
  guessEntries: GuessEntry[];
  currentPlayerIndex: number;
  roundNumber: number;
  phase: GamePhase;
  activeRound?: RoundState;
}

export interface FinishedGameSummary {
  id: string;
  name: string;
  settings?: GameSettings;
  startedAt: string;
  finishedAt: string;
  players: Pick<Player, "id" | "name" | "color" | "points">[];
  playerTimelines?: Pick<Player, "id" | "timeline">[];
  winnerIds: string[];
  rounds: number;
  replayEntries?: GuessEntry[];
}

export interface AppState {
  schemaVersion: 1;
  activeGame?: Game;
  preferences: AppPreferences;
  setup?: SetupState;
  history: FinishedGameSummary[];
  connectors: DataConnector[];
}

export type AppTheme = "system" | "light" | "dark";

export type AppLanguage = "de" | "en";

export interface AppPreferences {
  theme: AppTheme;
  language: AppLanguage;
}

export interface SetupState {
  gameName: string;
  mode: GameMode;
  players: NewGamePlayerInput[];
  cardChoiceCount: number;
  spotifySeed: string;
  spotifyEntries?: GuessEntry[];
  spotifyGeneratedCount?: number;
  spotifyExhausted?: boolean;
  spotifyAdvanced?: SpotifyAdvancedSettings;
  custom?: CustomSetupState;
  replayHistoryId?: string;
  spotifyPreview?: {
    id: string;
    type: "track" | "playlist" | "artist";
    title: string;
    subtitle: string;
    totalTracks?: number;
    imageUrl?: string;
    externalUrl: string;
    strategy: string;
  };
  stopCondition: StopCondition;
}

export type SpotifyOrderKey = "year" | "durationMs";
export type SpotifyCardKey = "title" | "artist" | "year" | "durationMs" | "albumCover" | "audioPreview";
export type SpotifyCardFrontKey = SpotifyCardKey;
export type SpotifyCardBackKey = SpotifyCardKey;
export type SpotifyExtraGuessKey = "title" | "artist" | "year" | "durationMs";

export interface SpotifyAdvancedSettings {
  cardBackKeys: SpotifyCardBackKey[];
  orderKey: SpotifyOrderKey;
  cardFrontKeys: SpotifyCardFrontKey[];
  extraGuessKeys: SpotifyExtraGuessKey[];
}

export interface CustomSetupState {
  sourceUrl: string;
  rawText: string;
  format: "auto" | "csv" | "json";
  delimiter: string;
  hasHeader: boolean;
  columns: string[];
  entries: GuessEntry[];
  mapping: {
    title: string;
    artist: string;
    order: string;
    image: string;
    audio: string;
  };
  orderLabel: string;
  extraArtistGuess: boolean;
  cardBackKeys: string[];
  cardFrontKeys: string[];
  extraGuessKeys: string[];
}

export interface NewGamePlayerInput {
  name: string;
  color: string;
}

export interface NewGameInput {
  gameName: string;
  mode: GameMode;
  players: NewGamePlayerInput[];
  spotifySeed: string;
  replayEntries?: GuessEntry[];
  replayHistoryId?: string;
  replaySettings?: GameSettings;
  customEntries?: GuessEntry[];
  customSettings?: GameSettings;
  imageArtEntries?: GuessEntry[];
  autoquartettEntries?: GuessEntry[];
  spotifyEntries?: GuessEntry[];
  spotifyGeneratedCount?: number;
  spotifyExhausted?: boolean;
  spotifyAdvanced?: SpotifyAdvancedSettings;
  stopCondition: StopCondition;
  cardChoiceCount: number;
  spotifyConnectorId: string;
}
