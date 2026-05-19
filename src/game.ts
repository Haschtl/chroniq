import type {
  AppState,
  FinishedGameSummary,
  Game,
  GameGeneratorSettings,
  GameMode,
  GameSettings,
  GuessEntry,
  MediaData,
  NewGameInput,
  Player,
  RoundCorrectionClaim,
  RoundResult,
} from "./types";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export const initialAppState = (): AppState => ({
  schemaVersion: 1,
  preferences: {
    theme: "system",
    language: "de",
  },
  history: [],
  connectors: [],
});

export const getConfiguredSpotifyConnector = (state: AppState) =>
  state.connectors.find(
    (connector) =>
      connector.kind === "spotify" &&
      connector.status === "configured" &&
      connector.auth &&
      new Date(connector.auth.expiresAt).getTime() > Date.now(),
  );

export const playerColors = ["#ef6f4d", "#47a66b", "#3b82c4", "#e7b10a", "#8b5cf6", "#d94f70"];

const spotifyHitsterSettings: GameSettings = {
  name: "Spotify-Generator",
  mode: "spotify-generator",
  stopCondition: { type: "maxPoints", points: 10 },
  presentSelector: {
    type: "audio",
    key: "audioPreview",
  },
  orderSelector: {
    key: "year",
    dir: "asc",
  },
  extraGuessSelectors: [
    { type: "text-loose", key: "title", label: "Titel" },
    { type: "text-loose", key: "artist", label: "Artist" },
  ],
  displaySelectors: [
    { label: "Album", key: "albumCover", type: "image" },
    { label: "Jahr", key: "year", type: "text" },
  ],
};

const replaySettings: GameSettings = {
  ...spotifyHitsterSettings,
  name: "Replay",
  mode: "replay",
};

const imageArtSettings: GameSettings = {
  name: "Bild-Kuenstler",
  mode: "image-art",
  stopCondition: { type: "maxPoints", points: 10 },
  presentSelector: {
    type: "image",
    key: "image",
  },
  orderSelector: {
    key: "year",
    dir: "asc",
  },
  extraGuessSelectors: [
    { type: "text-loose", key: "artist", label: "Kuenstler" },
  ],
  displaySelectors: [
    { label: "Bild", key: "image", type: "image" },
    { label: "Jahr", key: "year", type: "text" },
  ],
};

const autoquartettSettings: GameSettings = {
  name: "Autoquartett",
  mode: "autoquartett",
  stopCondition: { type: "maxPoints", points: 10 },
  presentSelector: {
    type: "image",
    key: "image",
  },
  orderSelector: {
    key: "horsepower",
    dir: "asc",
  },
  extraGuessSelectors: [],
  displaySelectors: [
    { label: "Bild", key: "image", type: "image" },
    { label: "Baujahr", key: "year", type: "text" },
    { label: "PS", key: "horsepower", type: "text" },
  ],
};

const customSettings: GameSettings = {
  name: "Custom",
  mode: "custom",
  stopCondition: { type: "maxPoints", points: 10 },
  presentSelector: {
    type: "image",
    key: "image",
  },
  orderSelector: {
    key: "year",
    dir: "asc",
  },
  extraGuessSelectors: [],
  displaySelectors: [
    { label: "Bild", key: "image", type: "image" },
    { label: "Wert", key: "year", type: "text" },
  ],
};

const demoEntries: Omit<GuessEntry, "id" | "used">[] = [
  {
    title: "Billie Jean",
    artist: "Michael Jackson",
    year: 1982,
    spotifyUrl: "https://open.spotify.com/track/5ChkMS8OtdzJeqyybCc9R5",
    audioPreview: {
      type: "audio",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    },
    albumCover: {
      type: "image",
      url: "https://i.scdn.co/image/ab67616d0000b2737027294551db4fda68b5ddac",
      alt: "Thriller album cover",
    },
  },
  {
    title: "Smells Like Teen Spirit",
    artist: "Nirvana",
    year: 1991,
    spotifyUrl: "https://open.spotify.com/track/5ghIJDpPoe3CfHMGu71E6T",
    audioPreview: {
      type: "audio",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    },
    albumCover: {
      type: "image",
      url: "https://i.scdn.co/image/ab67616d0000b273fbc71b99f9c1296c56dd51b6",
      alt: "Nevermind album cover",
    },
  },
  {
    title: "Around the World",
    artist: "Daft Punk",
    year: 1997,
    spotifyUrl: "https://open.spotify.com/track/1pKYYY0dkg23sQQXi0Q5zN",
    audioPreview: {
      type: "audio",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    },
    albumCover: {
      type: "image",
      url: "https://i.scdn.co/image/ab67616d0000b273b33d46dfa2635a47eebf63b2",
      alt: "Homework album cover",
    },
  },
  {
    title: "Hey Ya!",
    artist: "Outkast",
    year: 2003,
    spotifyUrl: "https://open.spotify.com/track/2PpruBYCo4H7WOBJ7Q2EwM",
    audioPreview: {
      type: "audio",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    },
    albumCover: {
      type: "image",
      url: "https://i.scdn.co/image/ab67616d0000b2736a6387ab37f64034cdc7b367",
      alt: "Speakerboxxx album cover",
    },
  },
  {
    title: "Rolling in the Deep",
    artist: "Adele",
    year: 2010,
    spotifyUrl: "https://open.spotify.com/track/1CkvWZme3pRgbzaxZnTl5X",
    audioPreview: {
      type: "audio",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
    },
    albumCover: {
      type: "image",
      url: "https://i.scdn.co/image/ab67616d0000b273164feb363334f93b6458d2a9",
      alt: "21 album cover",
    },
  },
  {
    title: "Blinding Lights",
    artist: "The Weeknd",
    year: 2019,
    spotifyUrl: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b",
    audioPreview: {
      type: "audio",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
    },
    albumCover: {
      type: "image",
      url: "https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36",
      alt: "After Hours album cover",
    },
  },
];

export const createSpotifyDemoEntries = (): GuessEntry[] =>
  demoEntries.map((entry, index) => ({
    ...entry,
    id: `spotify_demo_${index + 1}`,
    used: false,
  }));

const imageArtEntries: Omit<GuessEntry, "id" | "used">[] = [
  {
    title: "Sternennacht",
    artist: "Vincent van Gogh",
    year: 1889,
    image: {
      type: "image",
      url: "https://upload.wikimedia.org/wikipedia/commons/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg",
      alt: "Sternennacht",
    },
  },
  {
    title: "Der Kuss",
    artist: "Gustav Klimt",
    year: 1908,
    image: {
      type: "image",
      url: "https://upload.wikimedia.org/wikipedia/commons/4/40/The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg",
      alt: "Der Kuss",
    },
  },
  {
    title: "Mona Lisa",
    artist: "Leonardo da Vinci",
    year: 1503,
    image: {
      type: "image",
      url: "https://upload.wikimedia.org/wikipedia/commons/6/6a/Mona_Lisa.jpg",
      alt: "Mona Lisa",
    },
  },
  {
    title: "Die grosse Welle",
    artist: "Katsushika Hokusai",
    year: 1831,
    image: {
      type: "image",
      url: "https://upload.wikimedia.org/wikipedia/commons/0/0a/The_Great_Wave_off_Kanagawa.jpg",
      alt: "Die grosse Welle vor Kanagawa",
    },
  },
  {
    title: "Das Maedchen mit dem Perlenohrring",
    artist: "Johannes Vermeer",
    year: 1665,
    image: {
      type: "image",
      url: "https://upload.wikimedia.org/wikipedia/commons/d/d7/Meisje_met_de_parel.jpg",
      alt: "Das Maedchen mit dem Perlenohrring",
    },
  },
];

const autoquartettEntries: Omit<GuessEntry, "id" | "used">[] = [
  {
    name: "Ferrari F40",
    title: "Ferrari F40",
    year: 1987,
    horsepower: 478,
    image: {
      type: "image",
      url: "https://upload.wikimedia.org/wikipedia/commons/c/cb/F40_Ferrari_20090509.jpg",
      alt: "Ferrari F40",
    },
  },
  {
    name: "Porsche 911 Turbo 930",
    title: "Porsche 911 Turbo 930",
    year: 1975,
    horsepower: 260,
    image: {
      type: "image",
      url: "https://upload.wikimedia.org/wikipedia/commons/8/8f/Porsche_911_Turbo_3.3_%28930%29_-_Flickr_-_Alexandre_Pr%C3%A9vot_%281%29.jpg",
      alt: "Porsche 911 Turbo 930",
    },
  },
  {
    name: "Lamborghini Countach LP5000 QV",
    title: "Lamborghini Countach LP5000 QV",
    year: 1985,
    horsepower: 455,
    image: {
      type: "image",
      url: "https://upload.wikimedia.org/wikipedia/commons/0/06/Lamborghini_Countach_%28white%29.jpg",
      alt: "Lamborghini Countach",
    },
  },
  {
    name: "BMW M3 E30",
    title: "BMW M3 E30",
    year: 1986,
    horsepower: 200,
    image: {
      type: "image",
      url: "https://upload.wikimedia.org/wikipedia/commons/f/f6/BMW_M3_E30_%28front_quarter%29.jpg",
      alt: "BMW M3 E30",
    },
  },
  {
    name: "Bugatti Veyron 16.4",
    title: "Bugatti Veyron 16.4",
    year: 2005,
    horsepower: 1001,
    image: {
      type: "image",
      url: "https://upload.wikimedia.org/wikipedia/commons/6/62/Bugatti_Veyron_16.4_%E2%80%93_Frontansicht_%283%29%2C_5._April_2012%2C_D%C3%BCsseldorf.jpg",
      alt: "Bugatti Veyron",
    },
  },
];

const createStaticEntries = (mode: GameMode): GuessEntry[] => {
  if (mode === "replay" || mode === "spotify-generator" || mode === "custom") return [];
  const entries = mode === "autoquartett" ? autoquartettEntries : imageArtEntries;
  return entries.map((entry, index) => ({
    ...entry,
    albumCover: entry.image as Extract<MediaData, { type: "image" }>,
    id: `${mode}_${index + 1}`,
    used: false,
  }));
};

export const createGame = (input: NewGameInput): Game => {
  const createdAt = now();
  const players: Player[] = input.players.map((player, index) => ({
    id: id("player"),
    name: player.name.trim() || `Team ${index + 1}`,
    color: player.color || playerColors[index % playerColors.length],
    points: 0,
    timeline: [],
    extraPoints: 3,
  }));

  return {
    id: id("game"),
    createdAt,
    updatedAt: createdAt,
    players,
    settings: {
      ...(input.mode === "replay" && input.replaySettings ? input.replaySettings : getSettings(input.mode)),
      ...(input.mode === "custom" && input.customSettings ? input.customSettings : {}),
      name: input.gameName.trim() || getSettings(input.mode).name,
      stopCondition: input.stopCondition,
    },
    generator: createGeneratorSettings(input),
    guessEntries: shuffle(
      input.mode === "replay"
        ? createReplayEntries(input.replayEntries ?? [])
        : input.mode === "custom"
          ? createReplayEntries(input.customEntries ?? [])
        : input.mode === "spotify-generator"
        ? input.spotifyEntries ?? []
        : input.mode === "autoquartett" && input.autoquartettEntries?.length
          ? input.autoquartettEntries
          : createStaticEntries(input.mode),
    ),
    currentPlayerIndex: 0,
    roundNumber: 1,
    phase: "pick-card",
  };
};

const createGeneratorSettings = (input: NewGameInput): GameGeneratorSettings => {
  if (input.mode === "spotify-generator") {
    return {
      id: "spotify-generator",
      label: "Spotify-Generator",
      type: "spotify-generator",
      seed: input.spotifySeed.trim(),
      connectorId: input.spotifyConnectorId,
      generatedCount: input.spotifyGeneratedCount ?? input.spotifyEntries?.length ?? 0,
      exhausted: input.spotifyExhausted ?? false,
    };
  }

  return {
    id: input.mode,
    label: getSettings(input.mode).name,
    type: input.mode,
    generatedCount:
      input.mode === "replay"
        ? input.replayEntries?.length ?? 0
        : input.mode === "custom"
          ? input.customEntries?.length ?? 0
        : input.mode === "autoquartett"
          ? input.autoquartettEntries?.length ?? autoquartettEntries.length
          : imageArtEntries.length,
    exhausted: true,
  };
};

const getSettings = (mode: GameMode) => {
  if (mode === "image-art") return imageArtSettings;
  if (mode === "autoquartett") return autoquartettSettings;
  if (mode === "replay") return replaySettings;
  if (mode === "custom") return customSettings;
  return spotifyHitsterSettings;
};

export const startRound = (game: Game): Game => ({
  ...touch(game),
  phase: "present-card",
  activeRound: {
    id: id("round"),
    roundNumber: game.roundNumber,
    playerId: game.players[game.currentPlayerIndex].id,
    extraGuesses: {},
  },
});

export const chooseEntry = (game: Game, entryId: string): Game => {
  if (!game.activeRound) return game;

  return {
    ...touch(game),
    phase: "place-card",
    activeRound: {
      ...game.activeRound,
      entryId,
    },
  };
};

export const submitPlacement = (game: Game, proposedIndex: number): Game => {
  if (!game.activeRound?.entryId) return game;

  return {
    ...touch(game),
    phase: "extra-guesses",
    activeRound: {
      ...game.activeRound,
      proposedIndex,
    },
  };
};

export const submitExtraGuesses = (game: Game, extraGuesses: Record<string, string>): Game => {
  if (!game.activeRound?.entryId || game.activeRound.proposedIndex === undefined) return game;
  const activePlayer = game.players.find((player) => player.id === game.activeRound?.playerId);
  const skipChallenge = activePlayer?.timeline.length === 0;

  const nextGame: Game = {
    ...touch(game),
    phase: "challenge",
    activeRound: {
      ...game.activeRound,
      extraGuesses,
    },
  };

  if (skipChallenge) return resolveRound(nextGame, []);

  return {
    ...nextGame,
    phase: "challenge",
  };
};

export const resolveRound = (game: Game, correctionClaims: RoundCorrectionClaim[] = []): Game => {
  if (!game.activeRound?.entryId || game.activeRound.proposedIndex === undefined) return game;

  const entry = game.guessEntries.find((item) => item.id === game.activeRound?.entryId);
  const activePlayer = game.players.find((player) => player.id === game.activeRound?.playerId);
  if (!entry || !activePlayer) return game;

  const correctRange = getCorrectInsertionRange(
    activePlayer.timeline,
    entry,
    game.settings.orderSelector.key,
    game.settings.orderSelector.dir,
  );
  const correctIndex = correctRange.index;
  const activePlayerCorrect =
    game.activeRound.proposedIndex >= correctRange.start &&
    game.activeRound.proposedIndex <= correctRange.end;
  const winningClaim = correctionClaims.find(
    (claim) => claim.proposedIndex >= correctRange.start && claim.proposedIndex <= correctRange.end,
  );
  const challenged = correctionClaims.length > 0;
  const challengerWasRight = Boolean(winningClaim) && !activePlayerCorrect;
  const awardedPlayerId = activePlayerCorrect ? activePlayer.id : winningClaim?.playerId;

  const result: RoundResult = {
    activePlayerCorrect,
    challenged,
    challengerWasRight,
    awardedPlayerId,
    correctionClaims,
    message: buildResultMessage(activePlayerCorrect, challenged, challengerWasRight),
  };

  const players = game.players.map((player) => {
    const spentChallengePoint =
      challenged && correctionClaims.some((claim) => claim.playerId === player.id)
        ? { extraPoints: Math.max(0, player.extraPoints - 1) }
        : {};
    const receivesCard = awardedPlayerId === player.id;
    return {
      ...player,
      ...spentChallengePoint,
      points: receivesCard ? player.points + 1 : player.points,
      timeline:
        receivesCard && player.id === activePlayer.id
          ? insertAt(player.timeline, entry, correctIndex)
          : receivesCard
            ? insertAt(player.timeline, entry, player.timeline.length)
            : player.timeline,
    };
  });

  const guessEntries = game.guessEntries.map((item) =>
    item.id === entry.id ? { ...item, used: true } : item,
  );

  const afterRound: Game = {
    ...touch(game),
    players,
    guessEntries,
    phase: "round-result",
    activeRound: {
      ...game.activeRound,
      challengerId: winningClaim?.playerId,
      result,
    },
  };

  return isFinished(afterRound) ? finishGame(afterRound) : afterRound;
};

export const nextRound = (game: Game): Game => {
  if (game.phase === "finished") return game;

  return {
    ...touch(game),
    currentPlayerIndex: (game.currentPlayerIndex + 1) % game.players.length,
    roundNumber: game.roundNumber + 1,
    phase: "pick-card",
    activeRound: undefined,
  };
};

export const finishGame = (game: Game): Game => ({
  ...touch(game),
  phase: "finished",
  finishedAt: now(),
});

export const archiveFinishedGame = (state: AppState): AppState => {
  if (!state.activeGame || state.activeGame.phase !== "finished" || !state.activeGame.finishedAt) {
    return state;
  }

  return {
    ...state,
    activeGame: undefined,
    history: [toSummary(state.activeGame), ...state.history],
  };
};

export const getActivePlayer = (game: Game) => game.players[game.currentPlayerIndex];

export const getActiveEntry = (game: Game) =>
  game.guessEntries.find((entry) => entry.id === game.activeRound?.entryId);

export const getAvailableEntries = (game: Game) => game.guessEntries.filter((entry) => !entry.used);

export const appendGeneratedEntries = (
  game: Game,
  entries: GuessEntry[],
  nextIndex: number,
  exhausted = false,
): Game => {
  const existingIds = new Set(game.guessEntries.map((entry) => entry.id));
  const freshEntries = entries.filter((entry) => !existingIds.has(entry.id));

  return {
    ...touch(game),
    generator: {
      ...game.generator,
      generatedCount: nextIndex,
      exhausted,
    },
    guessEntries: shuffle([...game.guessEntries, ...freshEntries]),
  };
};

export const canChallenge = (game: Game, player: Player) =>
  game.phase === "challenge" &&
  player.id !== game.activeRound?.playerId &&
  player.extraPoints > 0;

const getCorrectInsertionRange = (
  timeline: GuessEntry[],
  entry: GuessEntry,
  key: string,
  dir: "asc" | "desc",
) => {
  const value = Number(entry[key]);
  const compare = (candidate: GuessEntry) => Number(candidate[key]);
  const sortedIndex = timeline.findIndex((candidate) =>
    dir === "asc" ? value < compare(candidate) : value > compare(candidate),
  );
  const index = sortedIndex === -1 ? timeline.length : sortedIndex;
  const equalIndexes = timeline
    .map((candidate, candidateIndex) => (compare(candidate) === value ? candidateIndex : -1))
    .filter((candidateIndex) => candidateIndex !== -1);

  if (equalIndexes.length === 0) return { index, start: index, end: index };

  return {
    index,
    start: Math.min(...equalIndexes),
    end: Math.max(...equalIndexes) + 1,
  };
};

const buildResultMessage = (activePlayerCorrect: boolean, challenged: boolean, challengerWasRight = false) => {
  if (!challenged && activePlayerCorrect) return "Richtig einsortiert. Die Karte geht an das aktive Team.";
  if (!challenged) return "Nicht korrekt einsortiert. Die Karte wird abgelegt.";
  if (activePlayerCorrect) return "Die Korrektur war falsch. Die Karte bleibt beim aktiven Team.";
  if (challengerWasRight) return "Eine Korrektur war richtig. Die Karte geht an das korrigierende Team.";
  return "Keine Korrektur war richtig. Die Karte wird abgelegt.";
};

const isFinished = (game: Game) => {
  const condition = game.settings.stopCondition;
  if (condition.type === "maxPoints") {
    return game.players.some((player) => player.points >= condition.points);
  }
  if (condition.type === "maxRounds") {
    return game.roundNumber >= condition.rounds;
  }
  const scores = game.players.map((player) => player.points).sort((a, b) => b - a);
  return scores.length > 1 && scores[0] - scores[1] >= condition.points;
};

const toSummary = (game: Game): FinishedGameSummary => {
  const maxPoints = Math.max(...game.players.map((player) => player.points));
  return {
    id: game.id,
    name: game.settings.name,
    settings: game.settings,
    startedAt: game.createdAt,
    finishedAt: game.finishedAt ?? now(),
    players: game.players.map(({ id, name, color, points }) => ({ id, name, color, points })),
    winnerIds: game.players.filter((player) => player.points === maxPoints).map((player) => player.id),
    rounds: game.roundNumber,
    replayEntries: getReplayEntries(game),
  };
};

const createReplayEntries = (entries: GuessEntry[]) =>
  entries.map((entry, index) => ({
    ...entry,
    id: `replay_${index + 1}_${entry.id}`,
    used: false,
  }));

const getReplayEntries = (game: Game) => {
  const usedIds = new Set(game.guessEntries.filter((entry) => entry.used).map((entry) => entry.id));
  const timelineIds = new Set(game.players.flatMap((player) => player.timeline.map((entry) => entry.id)));
  return game.guessEntries
    .filter((entry) => usedIds.has(entry.id) || timelineIds.has(entry.id))
    .map((entry) => ({
      ...entry,
      used: false,
    }));
};

const touch = (game: Game) => ({
  ...game,
  updatedAt: now(),
});

const insertAt = <T,>(items: T[], item: T, index: number) => [
  ...items.slice(0, index),
  item,
  ...items.slice(index),
];

const shuffle = <T,>(items: T[]) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};
