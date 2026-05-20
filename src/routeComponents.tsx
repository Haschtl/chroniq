import {
  DndContext,
  type DragEndEvent,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { toonHead } from "@dicebear/collection";
import { createAvatar } from "@dicebear/core";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import * as Accordion from "@radix-ui/react-accordion";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Select from "@radix-ui/react-select";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { createContext, FormEvent, lazy, Suspense, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Cable,
  Check,
  Gamepad2,
  History,
  Home,
  Link as LinkIcon,
  Maximize2,
  Menu,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import {
  archiveFinishedGame,
  appendGeneratedEntries,
  autoChooseSingleCard,
  canChallenge,
  chooseEntry,
  createGame,
  finishGame,
  getActiveEntry,
  getActivePlayer,
  getAvailableEntries,
  getConfiguredSpotifyConnector,
  nextRound,
  playerColors,
  resolveRound,
  startRound,
  submitExtraGuesses,
  submitPlacement,
} from "./game";
import { generateEntriesForGenerator } from "./generators";
import {
  completeSpotifyAuthorization,
  disconnectSpotify,
  ensureSpotifyPlaybackDevice,
  getSpotifyRedirectUri,
  getSpotifySafeDevUrl,
  getSpotifyPlaybackProgress,
  hasSpotifyClientId,
  isUnsupportedSpotifyDevOrigin,
  pauseSpotifyPlayback,
  playSpotifyTrack,
  resumeSpotifyPlayback,
  startSpotifyAuthorization,
} from "./spotify";
import { resetState, setState, useAppState } from "./store";
import {
  buildCustomEntries,
  createCustomGameSettings,
  createDefaultCustomSetup,
  parseCustomSource,
} from "./lib/customCsv";
import { getLineWaveTheme } from "./lib/theme";
import { isExtraGuessCorrect } from "./lib/textMatch";
import { SpotifyGeneratorSetup, useSpotifySetup } from "./components/setup/SpotifyGeneratorSetup";
import type {
  Game,
  GameSettings,
  GameMode,
  GuessEntry,
  GuessValue,
  MediaData,
  FinishedGameSummary,
  NewGamePlayerInput,
  Player,
  RoundCorrectionClaim,
  StopCondition,
  CustomSetupState,
} from "./types";

const LineWaves = lazy(() => import("./LineWaves"));

const customExampleDatasets: {
  key: string;
  label: string;
  path: string;
  mapping: CustomSetupState["mapping"];
  orderLabel: string;
  cardBackKeys: string[];
  cardFrontKeys: string[];
  extraGuessKeys: string[];
}[] = [
  {
    key: "autoquartett",
    label: "KFZ / Autoquartett",
    path: "data/autoquartett.wikidata.json",
    mapping: {
      title: "model",
      artist: "manufacturer",
      order: "horsepower",
      image: "image",
      audio: "",
    },
    orderLabel: "PS",
    cardBackKeys: ["image", "model", "manufacturer"],
    cardFrontKeys: ["image", "manufacturer", "model", "horsepower", "topSpeedKmh", "year"],
    extraGuessKeys: ["manufacturer", "model"],
  },
  {
    key: "artworks",
    label: "Berühmte Kunstwerke",
    path: "data/artworks.wikidata.json",
    mapping: {
      title: "title",
      artist: "artist",
      order: "year",
      image: "image",
      audio: "",
    },
    orderLabel: "Jahr",
    cardBackKeys: ["image"],
    cardFrontKeys: ["image", "title", "artist", "year", "movement", "collection"],
    extraGuessKeys: ["artist", "title"],
  },
];

const builtInDatasetConfigs = {
  "image-art": {
    path: "data/artworks.wikidata.json",
    mapping: customExampleDatasets[1].mapping,
  },
  autoquartett: {
    path: "data/autoquartett.wikidata.json",
    mapping: customExampleDatasets[0].mapping,
  },
} satisfies Record<"image-art" | "autoquartett", { path: string; mapping: CustomSetupState["mapping"] }>;

interface FooterAction {
  key: string;
  label: string;
  icon?: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  onClick: () => void;
}

const FooterActionsContext = createContext<(actions: FooterAction[]) => void>(() => undefined);

const useFooterActions = (actions: FooterAction[]) => {
  const setFooterActions = useContext(FooterActionsContext);
  useEffect(() => {
    setFooterActions(actions);
    return () => setFooterActions([]);
  }, [setFooterActions, actions]);
};

export function RootLayout() {
  const state = useAppState();
  const location = useLocation();
  const navigate = useNavigate();
  const [footerActions, setFooterActions] = useState<FooterAction[]>([]);
  const translate = createTranslator(state.preferences.language);
  const isGamePage = location.pathname === "/game";
  const canFinishGame = Boolean(state.activeGame && state.activeGame.phase !== "finished");
  useEffect(() => {
    document.documentElement.dataset.theme = state.preferences.theme;
  }, [state.preferences.theme]);

  useEffect(() => {
    if (state.activeGame?.phase !== "finished") return;
    setState(archiveFinishedGame);
  }, [state.activeGame?.id, state.activeGame?.phase]);

  const finishActiveGame = () => {
    if (!state.activeGame || state.activeGame.phase === "finished") return;
    setState((current) => (current.activeGame ? { ...current, activeGame: finishGame(current.activeGame) } : current));
    navigate({ to: "/game" });
  };

  return (
    <FooterActionsContext.Provider value={setFooterActions}>
      <div
        className={`${isGamePage ? "app-shell game-shell" : "app-shell"} ${canFinishGame ? "has-progress" : ""}`}
        data-theme={state.preferences.theme}
      >
        {!isGamePage ? (
          <header className="topbar">
            <div className="topbar-row">
              <Link to="/" className="brand">
                ChronIQ
              </Link>
              {canFinishGame ? (
                <div
                  className="header-game-actions"
                  aria-label={translate("header.activeGameActions")}
                >
                  <Link
                    className="header-game-action"
                    to="/game"
                    aria-label={translate("header.continueGame")}
                  >
                    <Play size={17} fill="currentColor" />
                  </Link>
                  <button
                    className="header-game-action danger"
                    type="button"
                    aria-label={translate("header.finishGame")}
                    onClick={finishActiveGame}
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : null}
            </div>
          </header>
        ) : null}
        <main>
          <Outlet />
        </main>
        <AppFooter
          actions={isGamePage ? footerActions : []}
          activeGame={isGamePage ? state.activeGame : undefined}
          canFinishGame={canFinishGame}
          showDefaultNav={!isGamePage}
          showMenu={isGamePage}
          onFinishGame={finishActiveGame}
          translate={translate}
        />
      </div>
    </FooterActionsContext.Provider>
  );
}

function AppFooter({
  actions,
  activeGame,
  canFinishGame,
  showDefaultNav,
  showMenu,
  onFinishGame,
  translate,
}: {
  actions: FooterAction[];
  activeGame?: Game;
  canFinishGame: boolean;
  showDefaultNav: boolean;
  showMenu: boolean;
  onFinishGame: () => void;
  translate: (key: TranslationKey) => string;
}) {
  const hasActions = actions.length > 0;

  return (
    <footer className={hasActions ? "app-footer action-footer" : "app-footer"}>
      <div className="app-footer-inner">
        {activeGame ? <FooterScores game={activeGame} /> : null}
        {hasActions ? (
          <div className="footer-actions">
            {actions.map((action) => (
              <button
                className={`${action.variant ?? "secondary"}-button`}
                disabled={action.disabled}
                key={action.key}
                onClick={action.onClick}
                type="button"
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        ) : showDefaultNav ? (
          <nav className="footer-nav">
            <Link to="/" activeProps={{ className: "active" }}>
              <Home size={18} />
              <span>{translate("footer.newGame")}</span>
            </Link>
            <Link to="/history" activeProps={{ className: "active" }}>
              <History size={18} />
              <span>{translate("footer.history")}</span>
            </Link>
            <Link to="/settings" activeProps={{ className: "active" }}>
              <Settings size={18} />
              <span>{translate("nav.settings")}</span>
            </Link>
          </nav>
        ) : (
          <div className="footer-spacer" />
        )}
        {showMenu ? (
          <FooterMenu canFinishGame={canFinishGame} onFinishGame={onFinishGame} translate={translate} />
        ) : null}
      </div>
    </footer>
  );
}

function FooterMenu({
  canFinishGame,
  onFinishGame,
  translate,
}: {
  canFinishGame: boolean;
  onFinishGame: () => void;
  translate: (key: TranslationKey) => string;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="footer-menu-trigger" type="button" aria-label={translate("footer.menu")}>
          <Menu size={20} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" className="footer-menu-content" side="top" sideOffset={18}>
          <DropdownMenu.Item
            className="footer-menu-item danger"
            disabled={!canFinishGame}
            onSelect={onFinishGame}
          >
            <X size={16} />
            {translate("footer.finishGame")}
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className="footer-menu-item">
            <Link to="/">
              <Home size={16} />
              {translate("footer.newGame")}
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className="footer-menu-item">
            <Link to="/history">
              <History size={16} />
              {translate("footer.menuHistory")}
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className="footer-menu-item">
            <Link to="/settings">
              <Settings size={16} />
              {translate("footer.settings")}
            </Link>
          </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const state = useAppState();
  const savedSetup = state.setup;
  const defaultGameName = createDefaultGameName(state.history.length + 1);
  const [gameName, setGameName] = useState(savedSetup?.gameName || defaultGameName);
  const [players, setPlayers] = useState<NewGamePlayerInput[]>(
    savedSetup?.players?.length ? savedSetup.players : createDefaultSetupPlayers(),
  );
  const [mode, setMode] = useState<GameMode>(savedSetup?.mode ?? "spotify-generator");
  const [customSetup, setCustomSetup] = useState<CustomSetupState>(savedSetup?.custom ?? createDefaultCustomSetup());
  const [customLoadError, setCustomLoadError] = useState("");
  const [customUrlLoading, setCustomUrlLoading] = useState(false);
  const [customUrlDialogOpen, setCustomUrlDialogOpen] = useState(false);
  const [customExampleKey, setCustomExampleKey] = useState("");
  const [customExampleLoading, setCustomExampleLoading] = useState(false);
  const [autoquartettLoadError, setAutoquartettLoadError] = useState("");
  const [builtInDatasetCounts, setBuiltInDatasetCounts] = useState<Record<"image-art" | "autoquartett", number>>({
    "image-art": 0,
    autoquartett: 0,
  });
  const [replayHistoryId, setReplayHistoryId] = useState(savedSetup?.replayHistoryId ?? "");
  const [cardChoiceCount, setCardChoiceCount] = useState(savedSetup?.cardChoiceCount ?? 1);
  const [gameStartLoading, setGameStartLoading] = useState(false);
  const initialStopCondition = savedSetup?.stopCondition ?? ({ type: "maxPoints", points: 10 } satisfies StopCondition);
  const [stopType, setStopType] = useState<"maxPoints" | "maxRounds" | "leadPoints">(initialStopCondition.type);
  const [stopValue, setStopValue] = useState(getStopConditionValue(initialStopCondition));
  const spotifyConnector = getConfiguredSpotifyConnector(state);
  const spotifySetup = useSpotifySetup({
    enabled: mode === "spotify-generator",
    savedSetup,
    spotifyConnector,
  });
  const configuredConnectorCount = state.connectors.filter((connector) => connector.status === "configured").length;
  const requiredConnectorMissing = mode === "spotify-generator" && !spotifyConnector;
  const requiredSeedMissing = mode === "spotify-generator" && !spotifySetup.seed;
  const selectedReplay = state.history.find((entry) => entry.id === replayHistoryId);
  const replayEntries = selectedReplay?.replayEntries ?? [];
  const requiredReplayMissing = mode === "replay" && replayEntries.length === 0;
  const requiredCustomMissing = mode === "custom" && customSetup.entries.length === 0;
  const availableCardsLabel = getAvailableCardsLabel(
    mode,
    spotifySetup.entries.length,
    replayEntries.length,
    customSetup.entries.length,
    builtInDatasetCounts,
  );
  const customParsedSummary = useMemo(() => {
    if (!customSetup.rawText) return undefined;
    try {
      return parseCustomSource(customSetup);
    } catch {
      return undefined;
    }
  }, [customSetup]);

  const normalizedPlayers = useMemo(
    () =>
      players.map((player, index) => ({
        name: players[index]?.name ?? `Team ${index + 1}`,
        color: players[index]?.color ?? playerColors[index % playerColors.length],
      })),
    [players],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadBuiltInDataset("image-art"),
      loadBuiltInDataset("autoquartett"),
    ]).then(([imageArtEntries, autoquartettEntries]) => {
      if (!cancelled) {
        setBuiltInDatasetCounts({
          "image-art": imageArtEntries.length,
          autoquartett: autoquartettEntries.length,
        });
      }
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const stopCondition = createStopCondition(stopType, stopValue);
      setState((current) => ({
        ...current,
        setup: {
          gameName,
          mode,
          players: normalizedPlayers,
          cardChoiceCount: normalizeCardChoiceCount(cardChoiceCount),
          spotifySeed: spotifySetup.seed,
          spotifyEntries: spotifySetup.entries,
          spotifyGeneratedCount: spotifySetup.generatedCount,
          spotifyExhausted: spotifySetup.exhausted,
          spotifyAdvanced: spotifySetup.advanced,
          custom: customSetup,
          replayHistoryId,
          spotifyPreview: spotifySetup.preview,
          stopCondition,
        },
      }));
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [
    gameName,
    cardChoiceCount,
    customSetup,
    mode,
    normalizedPlayers,
    replayHistoryId,
    spotifySetup.advanced,
    spotifySetup.entries,
    spotifySetup.exhausted,
    spotifySetup.generatedCount,
    spotifySetup.preview,
    spotifySetup.seed,
    stopType,
    stopValue,
  ]);

  const updatePlayer = (index: number, patch: Partial<NewGamePlayerInput>) => {
    setPlayers((current) =>
      current.map((player, playerIndex) => (playerIndex === index ? { ...player, ...patch } : player)),
    );
  };

  const addPlayer = () => {
    setPlayers((current) => {
      if (current.length >= 6) return current;
      const nextIndex = current.length;
      return [
        ...current,
        {
          name: `Team ${nextIndex + 1}`,
          color: playerColors[nextIndex % playerColors.length],
        },
      ];
    });
  };

  const removePlayer = (index: number) => {
    setPlayers((current) => (current.length <= 2 ? current : current.filter((_, playerIndex) => playerIndex !== index)));
  };

  const updateCustomSetup = (patch: Partial<CustomSetupState>) => {
    setCustomSetup((current) => {
      const next = { ...current, ...patch };
      if (
        patch.rawText !== undefined ||
        patch.format !== undefined ||
        patch.delimiter !== undefined ||
        patch.hasHeader !== undefined ||
        patch.mapping !== undefined ||
        patch.cardBackKeys !== undefined ||
        patch.cardFrontKeys !== undefined ||
        patch.extraGuessKeys !== undefined
      ) {
        try {
          setCustomLoadError("");
          return buildCustomEntries(next);
        } catch (error) {
          setCustomLoadError(error instanceof Error ? error.message : "Daten konnten nicht gelesen werden.");
          return { ...next, columns: [], entries: [] };
        }
      }
      return next;
    });
  };

  const loadCustomUrl = async () => {
    if (!customSetup.sourceUrl.trim()) return;
    setCustomUrlLoading(true);
    setCustomLoadError("");
    try {
      const response = await fetch(customSetup.sourceUrl.trim());
      if (!response.ok) throw new Error(`Datei konnte nicht geladen werden (${response.status}).`);
      updateCustomSetup({ rawText: await response.text() });
      setCustomUrlDialogOpen(false);
    } catch (error) {
      setCustomLoadError(error instanceof Error ? error.message : "Datei konnte nicht geladen werden.");
    } finally {
      setCustomUrlLoading(false);
    }
  };

  const loadCustomFile = (file?: File) => {
    if (!file) return;
    setCustomLoadError("");
    file
      .text()
      .then((rawText) => updateCustomSetup({ rawText, sourceUrl: file.name }))
      .catch(() => setCustomLoadError("Datei konnte nicht gelesen werden."));
  };

  const loadCustomClipboard = async () => {
    setCustomLoadError("");
    try {
      const rawText = await navigator.clipboard.readText();
      if (!rawText.trim()) {
        setCustomLoadError("Zwischenablage ist leer.");
        return;
      }
      updateCustomSetup({ rawText, sourceUrl: "Zwischenablage" });
    } catch {
      setCustomLoadError("Zwischenablage konnte nicht gelesen werden.");
    }
  };

  const loadCustomExample = async () => {
    const example = customExampleDatasets.find((dataset) => dataset.key === customExampleKey);
    if (!example) return;
    setCustomExampleLoading(true);
    setCustomLoadError("");
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}${example.path}`);
      if (!response.ok) throw new Error(`Beispieldaten konnten nicht geladen werden (${response.status}).`);
      const rawText = await response.text();
      updateCustomSetup({
        rawText,
        sourceUrl: example.label,
        format: "json",
        delimiter: "auto",
        hasHeader: true,
        mapping: example.mapping,
        orderLabel: example.orderLabel,
        cardBackKeys: example.cardBackKeys,
        cardFrontKeys: example.cardFrontKeys,
        extraGuessKeys: example.extraGuessKeys,
      });
    } catch (error) {
      setCustomLoadError(error instanceof Error ? error.message : "Beispieldaten konnten nicht geladen werden.");
    } finally {
      setCustomExampleLoading(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (requiredConnectorMissing || requiredSeedMissing || requiredReplayMissing || requiredCustomMissing) return;
    setGameStartLoading(true);
    spotifySetup.setLookupError("");
    setAutoquartettLoadError("");
    try {
      const spotifyPool =
        mode === "spotify-generator" && spotifySetup.entries.length === 0
          ? await spotifySetup.loadBatch(false)
          : {
              entries: spotifySetup.entries,
              generatedCount: spotifySetup.generatedCount,
              exhausted: spotifySetup.exhausted,
            };
      if (mode === "spotify-generator" && (!spotifyPool || spotifyPool.entries.length === 0)) return;
      const imageArtEntries = mode === "image-art" ? await loadBuiltInDataset("image-art") : undefined;
      const autoquartettEntries = mode === "autoquartett" ? await loadBuiltInDataset("autoquartett") : undefined;
      const activeGame = createGame({
        gameName,
        mode,
        players: normalizedPlayers,
        spotifySeed: spotifySetup.seed,
        replayEntries,
        replayHistoryId,
        replaySettings: selectedReplay?.settings,
        customEntries: customSetup.entries,
        customSettings: createCustomGameSettings(customSetup),
        imageArtEntries,
        autoquartettEntries,
        spotifyEntries: spotifyPool?.entries,
        spotifyGeneratedCount: spotifyPool?.generatedCount,
        spotifyExhausted: spotifyPool?.exhausted,
        spotifyAdvanced: spotifySetup.advanced,
        stopCondition: createStopCondition(stopType, stopValue),
        cardChoiceCount: normalizeCardChoiceCount(cardChoiceCount),
        spotifyConnectorId: spotifyConnector?.id ?? "",
      });
      setState((current) => ({ ...current, activeGame }));
      navigate({ to: "/game" });
    } catch (error) {
      spotifySetup.setLookupError(error instanceof Error ? error.message : "Spotify Karten konnten nicht geladen werden.");
    } finally {
      setGameStartLoading(false);
    }
  };

  return (
    <section className="setup-grid">
      <form className="panel setup-panel" onSubmit={submit}>
        <div className="section-heading">
          <label className="field game-name-field">
            <input
              value={gameName}
              onChange={(event) => setGameName(event.target.value)}
            />
          </label>
        </div>

        <section className="setup-section">
          <div className="section-heading compact">
            <p>Teams</p>
            <h2>Wer tritt an?</h2>
          </div>
          <div className="player-editor">
            {normalizedPlayers.map((player, index) => (
              <article
                className="player-card"
                key={index}
                style={
                  { "--player-color": player.color } as React.CSSProperties
                }
              >
                <div className="player-card-top">
                  <span>Team {index + 1}</span>
                  <button
                    type="button"
                    disabled={normalizedPlayers.length <= 2}
                    onClick={() => removePlayer(index)}
                  >
                    ×
                  </button>
                </div>
                <TeamAvatar color={player.color} name={player.name} />
                <div className="player-card-controls">
                  <input
                    aria-label={`Name Team ${index + 1}`}
                    maxLength={12}
                    value={player.name}
                    onChange={(event) =>
                      updatePlayer(index, {
                        name: event.target.value.slice(0, 12),
                      })
                    }
                  />
                  <input
                    aria-label={`Farbe Team ${index + 1}`}
                    className="player-color-input"
                    type="color"
                    value={player.color}
                    onChange={(event) =>
                      updatePlayer(index, { color: event.target.value })
                    }
                  />
                </div>
              </article>
            ))}
            <button
              className="add-player-card"
              type="button"
              disabled={normalizedPlayers.length >= 6}
              onClick={addPlayer}
            >
              <span>+</span>
            </button>
          </div>
        </section>

        <section className="setup-section">
          <div className="section-heading compact">
            <p>Spieltyp</p>
            <h2>Modus und Quelle</h2>
          </div>
          <ModeSelect value={mode} onValueChange={setMode} />

          {mode === "spotify-generator" ? (
            <SpotifyGeneratorSetup
              setup={spotifySetup}
              spotifyConnector={spotifyConnector}
            />
          ) : null}
          {mode === "custom" ? (
            <div className="custom-tools">
              <div
                className="custom-dropzone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  loadCustomFile(event.dataTransfer.files?.[0]);
                }}
              >
                <input
                  accept=".csv,.tsv,.txt,.json,application/json,text/csv,text/tab-separated-values"
                  id="custom-file-input"
                  type="file"
                  onChange={(event) => loadCustomFile(event.target.files?.[0])}
                />
                <div>
                  <strong>{customSetup.rawText ? customSetup.sourceUrl || "Lokale Datei" : "Datei hier ablegen"}</strong>
                  <span>CSV, TSV, Text oder JSON-Liste</span>
                </div>
                <label className="secondary-button" htmlFor="custom-file-input">
                  Lokal öffnen
                </label>
                <button className="secondary-button" type="button" onClick={loadCustomClipboard}>
                  Aus Zwischenablage
                </button>
                <button className="ghost-button" type="button" onClick={() => setCustomUrlDialogOpen(true)}>
                  <LinkIcon size={15} />
                  URL
                </button>
              </div>
              <div className="custom-example-row">
                <label className="field">
                  Beispiel-Daten
                  <select value={customExampleKey} onChange={(event) => setCustomExampleKey(event.target.value)}>
                    <option value="">Auswählen</option>
                    {customExampleDatasets.map((dataset) => (
                      <option key={dataset.key} value={dataset.key}>
                        {dataset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="secondary-button custom-load-button"
                  type="button"
                  disabled={!customExampleKey || customExampleLoading}
                  onClick={loadCustomExample}
                >
                  {customExampleLoading ? "Lädt..." : "Beispiel laden"}
                </button>
              </div>
              <Dialog.Root open={customUrlDialogOpen} onOpenChange={setCustomUrlDialogOpen}>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content className="dialog-content custom-url-dialog">
                  <div className="dialog-header">
                    <Dialog.Title>Remote-Datei laden</Dialog.Title>
                    <Dialog.Description>CSV, TSV oder JSON von einer URL herunterladen.</Dialog.Description>
                  </div>
                  <label className="field">
                    URL
                    <input
                      placeholder="https://..."
                      value={customSetup.sourceUrl}
                      onChange={(event) => updateCustomSetup({ sourceUrl: event.target.value })}
                    />
                  </label>
                  <div className="dialog-actions">
                    <button className="secondary-button" type="button" onClick={() => setCustomUrlDialogOpen(false)}>
                      Abbrechen
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={loadCustomUrl}
                      disabled={customUrlLoading || !customSetup.sourceUrl.trim()}
                    >
                      <LinkIcon size={15} />
                      {customUrlLoading ? "Lädt..." : "Laden"}
                    </button>
                  </div>
                </Dialog.Content>
              </Dialog.Root>
              {customLoadError ? (
                <p className="form-error">{customLoadError}</p>
              ) : null}
              <div className="custom-options-grid">
                <label className="field">
                  Format
                  <select
                    value={customSetup.format}
                    onChange={(event) =>
                      updateCustomSetup({ format: event.target.value as CustomSetupState["format"] })
                    }
                  >
                    <option value="auto">Auto</option>
                    <option value="csv">CSV / Tabelle</option>
                    <option value="json">JSON-Liste</option>
                  </select>
                </label>
                <label className="field">
                  Trennzeichen
                  <select
                    disabled={customSetup.format === "json"}
                    value={customSetup.delimiter}
                    onChange={(event) =>
                      updateCustomSetup({ delimiter: event.target.value })
                    }
                  >
                    <option value="auto">Auto</option>
                    <option value=",">Komma</option>
                    <option value=";">Semikolon</option>
                    <option value="\t">Tab</option>
                  </select>
                </label>
                <label className="check-field">
                  <input
                    checked={customSetup.hasHeader}
                    disabled={customSetup.format === "json"}
                    type="checkbox"
                    onChange={(event) =>
                      updateCustomSetup({ hasHeader: event.target.checked })
                    }
                  />
                  Erste Zeile ist Header
                </label>
              </div>
              {customSetup.columns.length > 0 ? (
                <div className="custom-mapping-panel">
                  <div className="custom-mapping-grid">
                    <CustomColumnSelect customSetup={customSetup} field="title" label="Titel / Name" onChange={updateCustomSetup} />
                    <CustomColumnSelect customSetup={customSetup} field="artist" label="Artist / Zusatzguess" onChange={updateCustomSetup} />
                    <CustomColumnSelect customSetup={customSetup} field="order" label="Sortierwert" onChange={updateCustomSetup} required />
                    <CustomColumnSelect customSetup={customSetup} field="image" label="Bild-URL" onChange={updateCustomSetup} />
                    <CustomColumnSelect customSetup={customSetup} field="audio" label="Audio-URL" onChange={updateCustomSetup} />
                    <label className="field">
                      Label Sortierwert
                      <input value={customSetup.orderLabel} onChange={(event) => updateCustomSetup({ orderLabel: event.target.value })} />
                    </label>
                  </div>
                  <CustomKeySelect
                    customSetup={customSetup}
                    label="Karten-Rückseite"
                    value={customSetup.cardBackKeys}
                    onChange={(cardBackKeys) => updateCustomSetup({ cardBackKeys })}
                  />
                  <CustomKeySelect
                    customSetup={customSetup}
                    label="Daten raten"
                    value={customSetup.extraGuessKeys}
                    onChange={(extraGuessKeys) => updateCustomSetup({ extraGuessKeys })}
                  />
                  <CustomKeySelect
                    customSetup={customSetup}
                    label="Karten-Vorderseite"
                    value={customSetup.cardFrontKeys}
                    onChange={(cardFrontKeys) => updateCustomSetup({ cardFrontKeys })}
                  />
                </div>
              ) : null}
              {customSetup.rawText ? (
                <p className="muted">
                  {customSetup.entries.length} Karten aus {customParsedSummary?.rowCount ?? 0} Einträgen erzeugt.
                </p>
              ) : null}
            </div>
          ) : null}
          {mode === "replay" ? (
            <label className="field">
              Historie
              <select
                value={replayHistoryId}
                onChange={(event) => setReplayHistoryId(event.target.value)}
              >
                <option value="">Replay auswählen</option>
                {state.history
                  .filter((entry) => (entry.replayEntries?.length ?? 0) > 0)
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name} -{" "}
                      {new Date(entry.finishedAt).toLocaleString("de-DE")} (
                      {entry.replayEntries?.length ?? 0})
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
        </section>

        <section className="setup-section accordion-section">
          <Accordion.Root
            className="setup-accordion-root"
            collapsible
            type="single"
          >
            <Accordion.Item className="setup-accordion" value="victory">
              <Accordion.Header>
                <Accordion.Trigger className="setup-accordion-trigger">
                  <span>
                    <b>Einstellungen</b>
                    <small>
                      {getStopConditionSummary(stopType, stopValue)}
                    </small>
                  </span>
                  <span aria-hidden="true">⌄</span>
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="setup-accordion-content">
                <div className="stop-config">
                <label className="field compact-field">
                  Karten zur Auswahl
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={cardChoiceCount}
                    onChange={(event) =>
                      setCardChoiceCount(
                        normalizeCardChoiceCount(Number(event.target.value)),
                      )
                    }
                  />
                  {/* <small>{normalizeCardChoiceCount(cardChoiceCount) === 1 ? "Auswahl wird übersprungen." : "Pro Runde im ersten Schritt sichtbar."}</small> */}
                </label>
                </div>
                <div className="stop-config">
                  <div
                    className="mode-grid"
                    role="radiogroup"
                    aria-label="Spielende"
                  >
                    {stopConditionOptions.map((option) => (
                      <button
                        className={
                          stopType === option.type
                            ? "mode-card compact active"
                            : "mode-card compact"
                        }
                        key={option.type}
                        type="button"
                        onClick={() => {
                          setStopType(option.type);
                          setStopValue(option.defaultValue);
                        }}
                      >
                        <strong>{option.label}</strong>
                        <span>{option.description}</span>
                      </button>
                    ))}
                  </div>
                  <label className="field">
                    {
                      stopConditionOptions.find(
                        (option) => option.type === stopType,
                      )?.valueLabel
                    }
                    <input
                      type="number"
                      min={1}
                      max={stopType === "maxRounds" ? 100 : 30}
                      value={stopValue}
                      onChange={(event) =>
                        setStopValue(Number(event.target.value))
                      }
                    />
                  </label>
                </div>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion.Root>
        </section>

        <section className="setup-section start-section">
          <Accordion.Root collapsible type="single">
            <Accordion.Item
              className={
                requiredConnectorMissing
                  ? "connector-accordion missing"
                  : "connector-accordion"
              }
              value="connectors"
            >
              <Accordion.Header>
                <Accordion.Trigger className="connector-accordion-trigger">
                  <span>{configuredConnectorCount} Konnektoren</span>
                  {requiredConnectorMissing ? <b>Spotify fehlt</b> : <b>OK</b>}
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="connector-accordion-content">
                <div className="connector-accordion-body">
                  <div className="connector-summary-row">
                    <span>Spotify</span>
                    <b className={spotifyConnector ? "ok" : "missing"}>
                      {spotifyConnector ? "verbunden" : "fehlt"}
                    </b>
                  </div>
                  <Link className="secondary-button" to="/settings">
                    <Settings size={15} />
                    Settings öffnen
                  </Link>
                </div>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion.Root>

          {requiredSeedMissing ? (
            <p className="form-error">Spotify Seed aus der Suche auswählen.</p>
          ) : null}
          {autoquartettLoadError ? (
            <p className="form-error">{autoquartettLoadError}</p>
          ) : null}
          {requiredReplayMissing ? (
            <p className="form-error">Replay aus der Historie auswählen.</p>
          ) : null}
          {requiredCustomMissing ? (
            <p className="form-error">
              Custom-Datei laden und Mapping auswählen.
            </p>
          ) : null}
          <button
            className="primary-button start-button"
            type="submit"
            disabled={
              requiredConnectorMissing ||
              requiredSeedMissing ||
              requiredReplayMissing ||
              requiredCustomMissing ||
              gameStartLoading
            }
          >
            <Play size={16} fill="currentColor" />
            {gameStartLoading
              ? "Karten laden..."
              : `Spiel starten (${availableCardsLabel})`}
          </button>
        </section>
      </form>
    </section>
  );
}

export function GamePage() {
  const state = useAppState();
  const navigate = useNavigate();
  const spotifyConnector = getConfiguredSpotifyConnector(state);
  const [entryLoadError, setEntryLoadError] = useState("");
  const [entryLoading, setEntryLoading] = useState(false);
  const [connectorError, setConnectorError] = useState("");
  const [connectorConnecting, setConnectorConnecting] = useState(false);
  const [playbackPaused, setPlaybackPaused] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const progressAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const activePlaybackEntry = state.activeGame ? getActiveEntry(state.activeGame) : undefined;

  useEffect(() => {
    const game = state.activeGame;
    if (!game || game.phase === "finished" || game.generator.exhausted) return;
    if (game.generator.type !== "spotify-generator") return;
    if (!spotifyConnector?.auth?.accessToken) return;
    if (getAvailableEntries(game).length >= 6) return;

    let cancelled = false;
    setEntryLoading(true);
    setEntryLoadError("");

    generateEntriesForGenerator(game.generator, 20, {
      accessToken: spotifyConnector.auth.accessToken,
      excludeIds: game.guessEntries.map((entry) => entry.id),
    })
      .then((generated) => {
        if (cancelled) return;
        setState((current) => {
          if (!current.activeGame || current.activeGame.id !== game.id) return current;
          return {
            ...current,
            activeGame: appendGeneratedEntries(
              current.activeGame,
              generated.entries,
              generated.nextIndex,
              generated.exhausted,
            ),
          };
        });
      })
      .catch((error) => {
        if (!cancelled) {
          setEntryLoadError(error instanceof Error ? error.message : "Karten konnten nicht nachgeladen werden.");
        }
      })
      .finally(() => {
        if (!cancelled) setEntryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    state.activeGame?.id,
    state.activeGame?.phase,
    state.activeGame?.guessEntries.length,
    state.activeGame?.generator.generatedCount,
    state.activeGame?.generator.exhausted,
    spotifyConnector?.auth?.accessToken,
  ]);

  useEffect(() => {
    setPlaybackPaused(false);
    setAudioProgress(0);
  }, [activePlaybackEntry?.id]);

  useEffect(() => {
    const entry = activePlaybackEntry;
    if (!entry) return;
    const audio = entry.audioPreview;
    const spotifyUri = typeof entry.spotifyUri === "string" ? entry.spotifyUri : undefined;
    if (spotifyUri && spotifyConnector?.auth?.accessToken) return;
    if (!isAudioValue(audio)) return;
    const pollElement = () => playbackAudioRef.current;
    const element = pollElement();
    const updateProgress = () => {
      const element = pollElement();
      if (!element) return;
      setAudioProgress(element.duration > 0 ? Math.min(1, Math.max(0, element.currentTime / element.duration)) : 0);
    };
    if (element && progressAudioRef.current !== element) {
      progressAudioRef.current = element;
    }
    const interval = window.setInterval(updateProgress, 250);
    element?.addEventListener("timeupdate", updateProgress);
    element?.addEventListener("loadedmetadata", updateProgress);
    element?.addEventListener("ended", updateProgress);
    updateProgress();
    return () => {
      window.clearInterval(interval);
      element?.removeEventListener("timeupdate", updateProgress);
      element?.removeEventListener("loadedmetadata", updateProgress);
      element?.removeEventListener("ended", updateProgress);
    };
  }, [activePlaybackEntry?.id, spotifyConnector?.auth?.accessToken]);

  useEffect(() => {
    const entry = activePlaybackEntry;
    const accessToken = spotifyConnector?.auth?.accessToken;
    if (!entry || !accessToken || typeof entry.spotifyUri !== "string") return;
    let cancelled = false;
    const updateProgress = () => {
      getSpotifyPlaybackProgress(accessToken)
        .then((progress) => {
          if (!cancelled) setAudioProgress(progress.progress);
        })
        .catch(() => undefined);
    };
    updateProgress();
    const interval = window.setInterval(updateProgress, 900);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activePlaybackEntry?.id, spotifyConnector?.auth?.accessToken]);

  useEffect(() => {
    const game = state.activeGame;
    if (!game || game.phase === "finished") return;
    if (entryLoading) return;
    if (getAvailableEntries(game).length > 0) return;
    if (game.generator.type === "spotify-generator" && !game.generator.exhausted) return;

    setState((current) => {
      if (!current.activeGame || current.activeGame.id !== game.id || current.activeGame.phase === "finished") return current;
      if (getAvailableEntries(current.activeGame).length > 0) return current;
      if (current.activeGame.generator.type === "spotify-generator" && !current.activeGame.generator.exhausted) return current;
      return { ...current, activeGame: finishGame(current.activeGame) };
    });
  }, [entryLoading, state.activeGame?.id, state.activeGame?.phase, state.activeGame?.guessEntries.length, state.activeGame?.generator.exhausted]);

  useEffect(() => {
    const game = state.activeGame;
    if (!game || game.phase !== "pick-card") return;
    if (normalizeCardChoiceCount(game.settings.cardChoiceCount) > 1) return;
    if (entryLoading || getAvailableEntries(game).length === 0) return;
    setState((current) => {
      if (!current.activeGame || current.activeGame.id !== game.id || current.activeGame.phase !== "pick-card") return current;
      return { ...current, activeGame: autoChooseSingleCard(current.activeGame) };
    });
  }, [entryLoading, state.activeGame?.id, state.activeGame?.phase, state.activeGame?.guessEntries.length, state.activeGame?.settings.cardChoiceCount]);

  if (!state.activeGame) {
    return (
      <section className="empty-state">
        <h1>Kein aktives Spiel</h1>
        <p>Starte ein neues Spiel im Setup. Der Spielstand wird danach automatisch lokal gespeichert.</p>
        <Link className="primary-button" to="/">
          Zum Setup
        </Link>
      </section>
    );
  }

  const game = state.activeGame;
  const updateGame = (nextGame: Game) => setState((current) => ({ ...current, activeGame: nextGame }));
  const activePlayer = getActivePlayer(game);
  const activeEntry = getActiveEntry(game);
  const lineWaveTheme = getLineWaveTheme(activePlayer.color);
  const playbackActive =
    Boolean(activeEntry) &&
    hasAudioKey(game.settings) &&
    ["place-card", "challenge", "round-result"].includes(game.phase);
  const requiredConnectorMissing = game.generator.type === "spotify-generator" && !spotifyConnector?.auth?.accessToken;
  const stopPlayback = () => {
    setPlaybackPaused(true);
    if (playbackAudioRef.current) {
      playbackAudioRef.current.pause();
      playbackAudioRef.current.currentTime = 0;
    }
    setAudioProgress(0);
    if (spotifyConnector?.auth?.accessToken) {
      void pauseSpotifyPlayback(spotifyConnector.auth.accessToken).catch(() => undefined);
    }
  };
  const togglePlayback = () => setPlaybackPaused((current) => !current);

  const reconnectSpotify = async () => {
    setConnectorError("");
    setConnectorConnecting(true);
    try {
      await startSpotifyAuthorization();
    } catch (error) {
      setConnectorError(error instanceof Error ? error.message : "Spotify Verbindung konnte nicht gestartet werden.");
      setConnectorConnecting(false);
    }
  };

  return (
    <section className="game-layout">
      <RequiredConnectorDialog
        connecting={connectorConnecting}
        error={connectorError}
        missing={requiredConnectorMissing}
        onReconnect={reconnectSpotify}
      />
      {playbackActive && activeEntry ? (
        <SpotifyPlayback
          audioRef={playbackAudioRef}
          accessToken={spotifyConnector?.auth?.accessToken}
          entry={activeEntry}
          paused={playbackPaused}
        />
      ) : null}
      {game.phase !== "finished" ? (
        <div className="active-game-background" aria-hidden="true">
          <Suspense fallback={null}>
            <LineWaves
              backgroundColor={lineWaveTheme.backgroundColor}
              colors={lineWaveTheme.colors}
              enableMouseInteraction
              lineCount={26}
              opacity={0.72}
              speed={24}
            />
          </Suspense>
        </div>
      ) : (
        <CardGridMotionBackground game={game} />
      )}
      <div className="play-panel">
        <div className="round-header">
          <div>
            <p>
              {game.phase === "finished"
                ? `${game.roundNumber} Runden`
                : `Runde ${game.roundNumber}`}
            </p>
            <h1
              style={{
                color:
                  game.phase === "finished" ? undefined : activePlayer.color,
              }}
            >
              {game.phase === "finished"
                ? "Spiel beendet"
                : `${activePlayer.name} ist dran`}
            </h1>
          </div>
        </div>

        {game.phase === "pick-card" ? (
          <PickCard
            game={game}
            loading={entryLoading}
            error={entryLoadError}
            onPick={(entryId) =>
              updateGame(chooseEntry(startRound(game), entryId))
            }
          />
        ) : null}

        {game.phase === "present-card" ? (
          <PresentCard
            game={game}
            entry={activeEntry}
            onPick={(entryId) => updateGame(chooseEntry(game, entryId))}
            onContinue={() => updateGame({ ...game, phase: "place-card" })}
          />
        ) : null}

        {game.phase === "place-card" && activeEntry ? (
          <SortAndGuess
            game={game}
            entry={activeEntry}
            player={activePlayer}
            paused={playbackPaused}
            audioProgress={audioProgress}
            onTogglePause={togglePlayback}
            onSubmit={(index, values) =>
              updateGame(
                submitExtraGuesses(submitPlacement(game, index), values),
              )
            }
          />
        ) : null}

        {game.phase === "extra-guesses" ? (
          <ExtraGuesses
            game={game}
            onSubmit={(values) => updateGame(submitExtraGuesses(game, values))}
          />
        ) : null}

        {game.phase === "challenge" ? (
          <Challenge
            game={game}
            paused={playbackPaused}
            audioProgress={audioProgress}
            onTogglePause={togglePlayback}
            onResolve={(claims) => updateGame(resolveRound(game, claims))}
          />
        ) : null}

        {game.phase === "round-result" ? (
          <RoundResultView
            game={game}
            paused={playbackPaused}
            audioProgress={audioProgress}
            onTogglePause={togglePlayback}
            onNext={() => {
              stopPlayback();
              updateGame(nextRound(game));
            }}
          />
        ) : null}

        {game.phase === "finished" ? <FinishedGame game={game} /> : null}
      </div>
    </section>
  );
}

function CustomColumnSelect({
  customSetup,
  field,
  label,
  onChange,
  required = false,
}: {
  customSetup: CustomSetupState;
  field: keyof CustomSetupState["mapping"];
  label: string;
  onChange: (patch: Partial<CustomSetupState>) => void;
  required?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <select
        value={customSetup.mapping[field]}
        onChange={(event) =>
          onChange({
            mapping: {
              ...customSetup.mapping,
              [field]: event.target.value,
            },
          })
        }
      >
        <option value="">{required ? "Spalte auswählen" : "Nicht verwenden"}</option>
        {customSetup.columns.map((column) => (
          <option key={column} value={column}>
            {column}
          </option>
        ))}
      </select>
    </label>
  );
}

function SpotifyIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.59 14.42a.74.74 0 0 1-1.02.25c-2.8-1.7-6.33-2.09-10.48-1.15a.75.75 0 0 1-.33-1.46c4.55-1.04 8.45-.59 11.58 1.32.35.22.46.68.25 1.04Zm1.22-2.72a.93.93 0 0 1-1.28.31c-3.2-1.97-8.09-2.54-11.88-1.39a.93.93 0 1 1-.54-1.78c4.33-1.31 9.72-.68 13.39 1.58.44.27.58.84.31 1.28Zm.11-2.83C14.08 8.59 7.75 8.38 4.08 9.49a1.12 1.12 0 1 1-.65-2.14c4.21-1.28 11.2-1.03 15.63 1.6a1.12 1.12 0 0 1-1.14 1.92Z"
        fill="currentColor"
      />
    </svg>
  );
}

function RequiredConnectorDialog({
  connecting,
  error,
  missing,
  onReconnect,
}: {
  connecting: boolean;
  error: string;
  missing: boolean;
  onReconnect: () => void;
}) {
  const spotifyClientConfigured = hasSpotifyClientId();
  const unsupportedDevOrigin = isUnsupportedSpotifyDevOrigin();

  return (
    <Dialog.Root open={missing}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content connector-required-dialog"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="dialog-header">
            <Dialog.Title>Spotify erneut verbinden</Dialog.Title>
            <Dialog.Description>
              Dieses aktive Spiel braucht Spotify. Verbinde den Connector erneut, damit Playback und Nachladen weiter funktionieren.
            </Dialog.Description>
          </div>
          {!spotifyClientConfigured ? (
            <p className="form-error">Spotify App-Konfiguration fehlt. Setze VITE_SPOTIFY_CLIENT_ID in .env.local.</p>
          ) : null}
          {unsupportedDevOrigin ? (
            <p className="form-error">
              Spotify akzeptiert localhost nicht. Öffne die App ueber 127.0.0.1 und trage dieselbe Redirect URI im Spotify Dashboard ein.
            </p>
          ) : null}
          {error ? <p className="form-error">{error}</p> : null}
          <div className="dialog-actions">
            {unsupportedDevOrigin ? (
              <a className="secondary-button" href={getSpotifySafeDevUrl()}>
                Mit 127.0.0.1 öffnen
              </a>
            ) : null}
            <button className="primary-button" type="button" disabled={!spotifyClientConfigured || connecting} onClick={onReconnect}>
              <SpotifyIcon />
              {connecting ? "Verbinde..." : "Spotify verbinden"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FooterScores({ game }: { game: Game }) {
  const target = getProgressTarget(game);

  return (
    <aside
      className="footer-scores"
      aria-label="Spielstand"
      style={{ "--player-count": game.players.length } as React.CSSProperties}
    >
      {game.players.map((player) => (
        <PlayerScoreChip key={player.id} player={player} target={target} />
      ))}
    </aside>
  );
}

function PlayerScoreChip({ player, target }: { player: Player; target: number }) {
  const progress = Math.min(1, Math.max(0, player.points / target));

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="score-chip"
          title={player.name}
          type="button"
          style={
            {
              "--player-color": player.color,
              "--score-progress": `${progress * 360}deg`,
            } as React.CSSProperties
          }
        >
          <img alt="" className="score-chip-avatar" src={getTeamIconDataUri(player.name, player.color)} />
          <span className="score-chip-value">{player.points}</span>
          <span className="score-chip-dots" aria-label={`${player.extraPoints} Korrekturpunkte`}>
            {Array.from({ length: player.extraPoints }, (_, index) => (
              <i
                className="score-chip-dot active"
                key={index}
                style={getScoreDotStyle(index, player.extraPoints)}
              />
            ))}
          </span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" className="player-dropdown" collisionPadding={12} side="top" sideOffset={18}>
          <div className="player-dropdown-header">
            <strong>{player.name}</strong>
            <span>{player.points} Punkte</span>
          </div>
          {player.timeline.length === 0 ? (
            <p className="dropdown-empty">Noch keine Karten.</p>
          ) : (
            <div className="timeline-list">
              {player.timeline.map((entry) => (
                <PlayerTimelineItem entry={entry} key={entry.id} />
              ))}
            </div>
          )}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

function PlayerTimelineItem({ entry }: { entry: GuessEntry }) {
  return (
    <div className="player-timeline-item">
      <CoverImage entry={entry} />
      <div className="track-meta">
        <strong>{String(entry.title)}</strong>
        <span>{String(entry.artist)}</span>
      </div>
      <b>{String(entry.year)}</b>
    </div>
  );
}

function PickCard({
  error,
  game,
  loading,
  onPick,
}: {
  error?: string;
  game: Game;
  loading?: boolean;
  onPick: (entryId: string) => void;
}) {
  const availableEntries = getAvailableEntries(game);
  const activePlayer = getActivePlayer(game);
  const songCards = isAudioCardMode(game.settings.mode);
  const visibleCardCount = normalizeCardChoiceCount(game.settings.cardChoiceCount);
  const [selectedEntryId, setSelectedEntryId] = useState<string | undefined>();

  const pickEntry = (entryId: string) => {
    if (selectedEntryId) return;
    setSelectedEntryId(entryId);
    window.setTimeout(() => onPick(entryId), 780);
  };

  return (
    <div className="flow pick-flow">
      {loading ? <p className="muted">Karten werden nachgeladen...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      <div className="round-card-stage">
        <div className={selectedEntryId ? "card-backs selecting" : "card-backs"}>
        {availableEntries.slice(0, visibleCardCount).map((entry) =>
          songCards ? (
            <motion.button
              animate={{
                opacity: selectedEntryId && selectedEntryId !== entry.id ? 0 : 1,
                scale: selectedEntryId === entry.id ? 1.08 : 1,
                width: selectedEntryId && selectedEntryId !== entry.id ? 0 : "var(--entry-song-card-size)",
              }}
              className={[
                "song-card-picker",
                selectedEntryId === entry.id ? "is-selected" : "",
                selectedEntryId && selectedEntryId !== entry.id ? "is-faded" : "",
              ].filter(Boolean).join(" ")}
              disabled={Boolean(selectedEntryId)}
              key={entry.id}
              layout
              onClick={() => pickEntry(entry.id)}
              transition={{ duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
            >
              <PlayCard
                displaySelectors={game.settings.displaySelectors}
                entry={entry}
                mode={game.settings.mode}
                orderKey={game.settings.orderSelector.key}
                paused
                presentationSelectors={getPresentSelectorsForCard(game.settings)}
                revealed={false}
              />
            </motion.button>
          ) : (
            <motion.button
              animate={{
                marginLeft: selectedEntryId && selectedEntryId !== entry.id ? 0 : 0,
                marginRight: selectedEntryId && selectedEntryId !== entry.id ? 0 : 0,
                opacity: selectedEntryId && selectedEntryId !== entry.id ? 0 : 1,
                scale: selectedEntryId === entry.id ? 1.08 : 1,
                width: selectedEntryId && selectedEntryId !== entry.id ? 0 : "var(--entry-play-card-width)",
              }}
              className={[
                "play-card-picker",
                selectedEntryId === entry.id ? "is-selected" : "",
                selectedEntryId && selectedEntryId !== entry.id ? "is-faded" : "",
              ].filter(Boolean).join(" ")}
              disabled={Boolean(selectedEntryId)}
              key={entry.id}
              layout
              onClick={() => pickEntry(entry.id)}
              transition={{ duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
            >
              <PlayCard
                displaySelectors={game.settings.displaySelectors}
                entry={entry}
                mode={game.settings.mode}
                orderKey={game.settings.orderSelector.key}
                paused
                presentationSelectors={getPresentSelectorsForCard(game.settings)}
                revealed={false}
              />
            </motion.button>
          ),
        )}
        </div>
      </div>
      <TimelinePreview game={game} player={activePlayer} />
      {availableEntries.length === 0 && !loading ? <p className="muted">Keine Karten im Pool.</p> : null}
    </div>
  );
}

function PresentCard({
  game,
  entry,
  onPick,
  onContinue,
}: {
  game: Game;
  entry?: GuessEntry;
  onPick: (entryId: string) => void;
  onContinue: () => void;
}) {
  const availableEntries = getAvailableEntries(game);
  useFooterActions(
    entry
      ? [
          {
            key: "continue-sort",
            label: "Einsortieren",
            icon: <Play size={16} fill="currentColor" />,
            variant: "primary",
            onClick: onContinue,
          },
        ]
      : [],
  );

  if (!entry) {
    const songCards = isAudioCardMode(game.settings.mode);
    const visibleCardCount = normalizeCardChoiceCount(game.settings.cardChoiceCount);

    return (
      <div className="flow">
        <div className="card-backs">
          {availableEntries.slice(0, visibleCardCount).map((candidate) =>
            songCards ? (
              <button className="song-card-picker" key={candidate.id} onClick={() => onPick(candidate.id)}>
                <PlayCard
                  displaySelectors={game.settings.displaySelectors}
                  entry={candidate}
                  mode={game.settings.mode}
                  orderKey={game.settings.orderSelector.key}
                  paused
                  presentationSelectors={getPresentSelectorsForCard(game.settings)}
                  revealed={false}
                />
              </button>
            ) : (
              <button className="play-card-picker" key={candidate.id} onClick={() => onPick(candidate.id)}>
                <PlayCard
                  displaySelectors={game.settings.displaySelectors}
                  entry={candidate}
                  mode={game.settings.mode}
                  orderKey={game.settings.orderSelector.key}
                  paused
                  presentationSelectors={getPresentSelectorsForCard(game.settings)}
                  revealed={false}
                />
              </button>
            ),
          )}
        </div>
        <TimelinePreview game={game} player={getActivePlayer(game)} />
      </div>
    );
  }

  const hasConfiguredPresentation = Boolean(game.settings.presentSelectors?.length);
  const showAudioPresentation = hasPresentKey(game.settings, "audioPreview");
  const presentationSelectors = getPresentSelectorsForCard(game.settings);

  return (
    <div className="flow present-stage">
      {showAudioPresentation ? <AudioPresentation entry={entry} /> : null}
      {presentationSelectors.length || !showAudioPresentation ? (
        <div className="round-card-stage">
          <PlayCard
            displaySelectors={game.settings.displaySelectors}
            entry={entry}
            mode={game.settings.mode}
            orderKey={game.settings.orderSelector.key}
            presentationSelectors={hasConfiguredPresentation ? presentationSelectors : game.settings.displaySelectors}
            revealed
            showOrderValue={false}
          />
        </div>
      ) : null}
    </div>
  );
}

function SortAndGuess({
  game,
  entry,
  onTogglePause,
  player,
  paused,
  audioProgress,
  onSubmit,
}: {
  audioProgress: number;
  game: Game;
  entry: GuessEntry;
  onTogglePause: () => void;
  player: Player;
  paused: boolean;
  onSubmit: (index: number, values: Record<string, string>) => void;
}) {
  const key = game.settings.orderSelector.key;
  const [proposedIndex, setProposedIndex] = useState<number | undefined>();
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (player.timeline.length > 0 || proposedIndex !== undefined) return;
    setProposedIndex(0);
  }, [player.timeline.length, proposedIndex]);

  const handleDragEnd = (event: DragEndEvent) => {
    const overId = String(event.over?.id ?? "");
    if (!overId.startsWith("slot-")) return;
    selectPlacement(Number(overId.replace("slot-", "")));
  };

  const selectPlacement = (index: number) => {
    setProposedIndex(index);
  };

  const submitGuess = () => {
    if (proposedIndex === undefined) return;
    onSubmit(proposedIndex, values);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
  };
  useFooterActions([]);

  return (
    <form className="flow sort-flow" onSubmit={submit}>
      <DndContext onDragEnd={handleDragEnd}>
        <div className="sort-surface">
          <div className="round-card-stage">
            {proposedIndex === undefined ? (
              <DraggableGuessCard
                entry={entry}
                audioProgress={audioProgress}
                displaySelectors={game.settings.displaySelectors}
                mode={game.settings.mode}
                orderKey={key}
                paused={paused}
                presentationSelectors={getPresentSelectorsForCard(game.settings)}
                onTogglePause={onTogglePause}
              />
            ) : (
              <div className="extra-guess-stage-panel">
                <div className="dialog-header">
                  <h2>Daten raten</h2>
                </div>
                {game.settings.extraGuessSelectors.length > 0 ? (
                  <div className="extra-guess-grid">
                    {game.settings.extraGuessSelectors.map((selector) => (
                      <label className="field" key={selector.key}>
                        {selector.label}
                        <input
                          value={values[selector.key] ?? ""}
                          onChange={(event) => setValues((current) => ({ ...current, [selector.key]: event.target.value }))}
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="muted">Keine Extra-Guesses für diesen Modus.</p>
                )}
                <div className="dialog-actions">
                  <HoldToConfirmButton disabled={proposedIndex === undefined} onConfirm={submitGuess} />
                </div>
              </div>
            )}
          </div>
          <div className="timeline-row">
            {Array.from({ length: player.timeline.length + 1 }, (_, index) => (
              <div className="timeline-pair" key={index}>
                <AnimatePresence>
                  {proposedIndex === index ? null : (
                    <TimelineDropSlot active={false} index={index} key={`slot-${index}`} onSelect={selectPlacement} />
                  )}
                </AnimatePresence>
                {proposedIndex === index ? (
                  <DraggableGuessCard
                    entry={entry}
                    audioProgress={audioProgress}
                    displaySelectors={game.settings.displaySelectors}
                    mode={game.settings.mode}
                    orderKey={key}
                    paused={paused}
                    placed
                    presentationSelectors={getPresentSelectorsForCard(game.settings)}
                    onTogglePause={onTogglePause}
                  />
                ) : null}
                {player.timeline[index] ? (
                  <TimelineCard displaySelectors={game.settings.displaySelectors} entry={player.timeline[index]} mode={game.settings.mode} orderKey={key} />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </DndContext>
    </form>
  );
}

function HoldToConfirmButton({ disabled = false, onConfirm }: { disabled?: boolean; onConfirm: () => void }) {
  const [holdState, setHoldState] = useState<"idle" | "holding" | "releasing">("idle");
  const timeoutRef = useRef<number | undefined>(undefined);
  const releaseTimeoutRef = useRef<number | undefined>(undefined);
  const completedRef = useRef(false);

  const clearHold = () => {
    if (timeoutRef.current !== undefined) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
    if (releaseTimeoutRef.current !== undefined) {
      window.clearTimeout(releaseTimeoutRef.current);
      releaseTimeoutRef.current = undefined;
    }
    setHoldState("idle");
    completedRef.current = false;
  };

  const cancelHold = () => {
    if (timeoutRef.current !== undefined) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
    if (releaseTimeoutRef.current !== undefined) window.clearTimeout(releaseTimeoutRef.current);
    setHoldState("releasing");
    releaseTimeoutRef.current = window.setTimeout(() => {
      releaseTimeoutRef.current = undefined;
      setHoldState("idle");
    }, 320);
    completedRef.current = false;
  };

  const startHold = () => {
    if (disabled || holdState === "holding") return;
    if (releaseTimeoutRef.current !== undefined) {
      window.clearTimeout(releaseTimeoutRef.current);
      releaseTimeoutRef.current = undefined;
    }
    completedRef.current = false;
    setHoldState("holding");
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = undefined;
      completedRef.current = true;
      setHoldState("idle");
      onConfirm();
    }, 1000);
  };

  useEffect(() => clearHold, []);

  return (
    <button
      aria-label="Guess einloggen, eine Sekunde gedrückt halten"
      className={`primary-button hold-button ${holdState}`}
      disabled={disabled}
      onKeyDown={(event) => {
        if (event.repeat || (event.key !== " " && event.key !== "Enter")) return;
        event.preventDefault();
        startHold();
      }}
      onKeyUp={(event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        if (!completedRef.current) cancelHold();
      }}
      onPointerCancel={cancelHold}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        startHold();
      }}
      onPointerLeave={() => {
        if (!completedRef.current) cancelHold();
      }}
      onPointerUp={() => {
        if (!completedRef.current) cancelHold();
      }}
      type="button"
    >
      <Check size={16} />
      <span>einloggen</span>
    </button>
  );
}

function CustomKeySelect({
  customSetup,
  label,
  onChange,
  value,
}: {
  customSetup: CustomSetupState;
  label: string;
  onChange: (value: string[]) => void;
  value: string[];
}) {
  const options = getCustomKeyOptions(customSetup);
  const toggleKey = (key: string, checked: boolean) => {
    onChange(checked ? [...value, key] : value.filter((candidate) => candidate !== key));
  };

  return (
    <div className="spotify-display-options custom-key-options" aria-label={label}>
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <label className={value.includes(option.key) ? "spotify-display-chip active" : "spotify-display-chip"} key={option.key}>
            <input checked={value.includes(option.key)} type="checkbox" onChange={(event) => toggleKey(option.key, event.target.checked)} />
            <span className="spotify-display-check" aria-hidden="true">
              <Check size={12} strokeWidth={3} />
            </span>
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

const getCustomKeyOptions = (customSetup: CustomSetupState) => {
  const keys = [
    ...customSetup.columns,
    customSetup.mapping.image ? "image" : "",
    customSetup.mapping.audio ? "audioPreview" : "",
  ].filter((key, index, all): key is string => Boolean(key) && all.indexOf(key) === index);
  return keys.map((key) => ({ key, label: getCustomKeyOptionLabel(key, customSetup) }));
};

const getCustomKeyOptionLabel = (key: string, customSetup: CustomSetupState) => {
  if (key === "image") return "Bild";
  if (key === "audioPreview") return "Audio";
  if (key === customSetup.mapping.order) return `${key} (Sortierwert)`;
  return key;
};

async function loadBuiltInDataset(mode: "image-art" | "autoquartett") {
  const config = builtInDatasetConfigs[mode];
  const response = await fetch(`${import.meta.env.BASE_URL}${config.path}`);
  if (!response.ok) throw new Error(`Datensatz konnte nicht geladen werden (${response.status}).`);
  const rawText = await response.text();
  const setup = buildCustomEntries({
    ...createDefaultCustomSetup(),
    rawText,
    sourceUrl: config.path,
    format: "json",
    mapping: config.mapping,
  });
  return setup.entries;
}

function SpotifyPlayback({
  accessToken,
  audioRef,
  entry,
  paused,
}: {
  accessToken?: string;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  entry: GuessEntry;
  paused: boolean;
}) {
  const audio = entry.audioPreview;
  const spotifyUri = typeof entry.spotifyUri === "string" ? entry.spotifyUri : undefined;
  const audioUrl = isAudioValue(audio) ? audio.url : undefined;
  const startedSpotifyUriRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    startedSpotifyUriRef.current = undefined;
    return () => {
      if (accessToken && spotifyUri) void pauseSpotifyPlayback(accessToken).catch(() => undefined);
    };
  }, [accessToken, spotifyUri]);

  useEffect(() => {
    if (!accessToken || !spotifyUri) return;
    let cancelled = false;

    const syncPlayback = async () => {
      try {
        if (paused) {
          await pauseSpotifyPlayback(accessToken);
          return;
        }
        const deviceId = await ensureSpotifyPlaybackDevice(accessToken);
        if (cancelled) return;
        if (startedSpotifyUriRef.current === spotifyUri) {
          await resumeSpotifyPlayback(accessToken, deviceId);
          return;
        }
        await playSpotifyTrack(accessToken, deviceId, spotifyUri);
        startedSpotifyUriRef.current = spotifyUri;
      } catch {
        // The visible fallback/error handling stays minimal during the hidden playback phase.
      }
    };

    void syncPlayback();

    return () => {
      cancelled = true;
    };
  }, [accessToken, paused, spotifyUri]);

  useEffect(() => {
    if (spotifyUri && accessToken) return;
    const element = audioRef.current;
    if (!element) return;
    return () => {
      element.pause();
      element.currentTime = 0;
    };
  }, [audioRef, spotifyUri, accessToken, audioUrl]);

  useEffect(() => {
    if (spotifyUri && accessToken) return;
    const element = audioRef.current;
    if (!element) return;
    if (paused) {
      element.pause();
      return;
    }
    element.play().catch(() => undefined);
  }, [audioRef, paused, spotifyUri, accessToken, audioUrl]);

  if (spotifyUri && accessToken) return null;
  if (!isAudioValue(audio)) return null;

  return <audio ref={audioRef} src={audio.url} autoPlay loop preload="auto" />;
}

function DraggableGuessCard({
  audioProgress,
  displaySelectors,
  entry,
  mode,
  orderKey,
  paused,
  placed = false,
  presentationSelectors,
  onTogglePause,
}: {
  audioProgress?: number;
  displaySelectors?: GameSettings["displaySelectors"];
  entry: GuessEntry;
  mode: GameMode;
  orderKey: string;
  paused: boolean;
  placed?: boolean;
  presentationSelectors?: GameSettings["displaySelectors"];
  onTogglePause: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: "active-guess-card",
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${placed ? 0 : transform.y}px, 0)` }
    : undefined;

  return (
    <div
      className={[placed ? "sort-card placed" : "sort-card", isDragging ? "dragging" : ""].filter(Boolean).join(" ")}
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
    >
      <PlayCard
        audioProgress={audioProgress}
        displaySelectors={displaySelectors}
        entry={entry}
        mode={mode}
        onTogglePause={onTogglePause}
        orderKey={orderKey}
        paused={paused}
        presentationSelectors={presentationSelectors}
        revealed={false}
      />
    </div>
  );
}

function PlayCard({
  animateReveal = false,
  audioProgress,
  children,
  displaySelectors,
  entry,
  mode,
  onTogglePause,
  orderKey,
  paused = false,
  presentationSelectors,
  revealed = true,
  showGuesses = false,
  showOrderValue = true,
}: {
  animateReveal?: boolean;
  audioProgress?: number;
  children?: React.ReactNode;
  displaySelectors?: GameSettings["displaySelectors"];
  entry: GuessEntry;
  mode: GameMode;
  onTogglePause?: () => void;
  orderKey: string;
  paused?: boolean;
  presentationSelectors?: GameSettings["displaySelectors"];
  revealed?: boolean;
  showGuesses?: boolean;
  showOrderValue?: boolean;
}) {
  const frontSelectors = normalizeCardSelectors(displaySelectors, entry, orderKey, showOrderValue);
  const backSelectors = normalizeCardSelectors(presentationSelectors, entry, orderKey, false);
  const frontKeys = new Set(frontSelectors.map((selector) => selector.key));
  const backKeys = new Set(backSelectors.map((selector) => selector.key));
  const guessedTitle = entry.guessedValues?.title?.trim() ?? "";
  const guessedArtist = entry.guessedValues?.artist?.trim() ?? "";
  const hasGuessValues = Boolean(guessedTitle || guessedArtist);
  const hasVisibleGuess = hasGuessValues && (showGuesses || !revealed);
  const isSongCard = isAudioCardMode(mode);
  const frontImage = getSelectorImage(entry, frontSelectors);
  const backImage = getSelectorImage(entry, backSelectors);
  const songImage = isSongCard ? frontImage : undefined;
  const backTextValues = getSelectorTextValues(entry, backSelectors, false);
  const frontTextValues = getSelectorTextValues(entry, frontSelectors, showGuesses);
  const backHasAudio = backKeys.has("audioPreview");
  const frontHasAudio = frontKeys.has("audioPreview");
  const canToggleAudio = Boolean(onTogglePause);
  const orbColor = useCoverAccentColor((songImage ?? frontImage ?? backImage)?.url, `${entry.title ?? ""}${entry.artist ?? ""}${entry.id}`);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const activeImage = revealed ? frontImage : backImage;

  const targetRotation = revealed ? 180 : 0;
  const canZoomImage = Boolean(!isSongCard && activeImage);
  const showAudioProgress = (backHasAudio || frontHasAudio) && audioProgress !== undefined;

  return (
    <motion.div
      className={["play-card", isSongCard ? "song-card" : "", canZoomImage ? "has-image-preview" : ""].filter(Boolean).join(" ")}
      style={{ "--song-orb-color": orbColor } as React.CSSProperties}
      initial={false}
      whileHover={animateReveal ? undefined : { rotateX: 5, rotateY: -7, y: -3 }}
      transition={{ type: "spring", stiffness: 150, damping: 24 }}
    >
      <motion.div
        className="song-card-inner"
        initial={{ rotateY: animateReveal ? 0 : targetRotation, scale: 1 }}
        animate={{
          rotateY: targetRotation,
          scale: animateReveal ? [1, 1.045, 1] : 1,
        }}
        transition={
          animateReveal
            ? { duration: 1.05, ease: [0.16, 1, 0.3, 1], times: [0, 0.48, 1] }
            : { type: "spring", stiffness: 110, damping: 22 }
        }
      >
        <div className="song-card-face song-card-back">
          {backImage ? <SafeImage image={backImage} /> : null}
          {backHasAudio ? <AudioOrb paused={paused} overlay={Boolean(backImage || backTextValues.length)} enabled={canToggleAudio} onTogglePause={onTogglePause} /> : null}
          {backTextValues.length ? <CardInfoOverlay values={backTextValues} /> : null}
          {hasVisibleGuess ? (
            <div className={!revealed ? "song-card-back-guess visible" : "song-card-back-guess"}>
              <small>Guess</small>
              {guessedTitle ? <strong>{guessedTitle}</strong> : null}
              {guessedArtist ? <span>{guessedArtist}</span> : null}
            </div>
          ) : null}
          {children}
          {showAudioProgress ? <AudioProgressBar progress={audioProgress} /> : null}
        </div>
        <div className="song-card-face song-card-front">
          {frontImage ? <SafeImage fallback={<div className="song-card-cover-placeholder" />} image={frontImage} /> : <div className="song-card-cover-placeholder" />}
          {frontHasAudio ? <AudioOrb paused={paused} overlay enabled={canToggleAudio} onTogglePause={onTogglePause} /> : null}
          <CardInfoOverlay values={frontTextValues} />
          {showAudioProgress ? <AudioProgressBar progress={audioProgress} /> : null}
        </div>
      </motion.div>
      {canZoomImage && activeImage ? (
        <button
          className="image-preview-trigger"
          type="button"
          aria-label="Bild groß anzeigen"
          onClick={(event) => {
            event.stopPropagation();
            setImageDialogOpen(true);
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
          }}
        >
          <Maximize2 size={16} />
        </button>
      ) : null}
      {canZoomImage && activeImage ? <ImagePreviewDialog image={activeImage} onOpenChange={setImageDialogOpen} open={imageDialogOpen} /> : null}
    </motion.div>
  );
}

function AudioProgressBar({ progress = 0 }: { progress?: number }) {
  return (
    <div className="song-card-audio-progress" aria-hidden="true">
      <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress))})` }} />
    </div>
  );
}

function ImagePreviewDialog({
  image,
  onOpenChange,
  open,
}: {
  image: Extract<MediaData, { type: "image" }>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const stopDialogPointer = (event: React.PointerEvent | React.MouseEvent) => {
    event.stopPropagation();
    if ("nativeEvent" in event && "stopImmediatePropagation" in event.nativeEvent) {
      event.nativeEvent.stopImmediatePropagation();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="image-preview-overlay"
          onClick={(event) => {
            stopDialogPointer(event);
            onOpenChange(false);
          }}
          onPointerDown={stopDialogPointer}
          onPointerUp={stopDialogPointer}
        />
        <Dialog.Content
          className="image-preview-dialog"
          onClick={(event) => {
            stopDialogPointer(event);
            if (event.target === event.currentTarget) onOpenChange(false);
          }}
          onPointerDown={stopDialogPointer}
          onPointerUp={stopDialogPointer}
        >
          <Dialog.Title className="sr-only">Bildvorschau</Dialog.Title>
          <Dialog.Close
            className="image-preview-close"
            aria-label="Bildvorschau schließen"
            onClick={(event) => {
              stopDialogPointer(event);
              onOpenChange(false);
            }}
            onPointerDown={stopDialogPointer}
            onPointerUp={stopDialogPointer}
          >
            <X size={20} />
          </Dialog.Close>
          <SafeImage image={image} onClick={stopDialogPointer} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AudioOrb({
  enabled,
  onTogglePause,
  overlay = false,
  paused,
}: {
  enabled: boolean;
  onTogglePause?: () => void;
  overlay?: boolean;
  paused: boolean;
}) {
  const className = [paused ? "song-orb" : "song-orb playing", overlay ? "song-orb-overlay" : ""].filter(Boolean).join(" ");

  if (!enabled) {
    return (
      <span className={className} aria-hidden="true">
      </span>
    );
  }

  return (
    <button
      className={className}
      type="button"
      aria-label={paused ? "Audio abspielen" : "Audio pausieren"}
      onClick={
        onTogglePause
          ? (event) => {
              event.stopPropagation();
              onTogglePause();
            }
          : undefined
      }
      onPointerDown={(event) => event.stopPropagation()}
    >
      {paused ? <Play size={30} fill="currentColor" /> : <Pause size={30} fill="currentColor" />}
    </button>
  );
}

function CardInfoOverlay({ values }: { values: CardTextValue[] }) {
  const primary = values.find((value) => value.key === "title" || value.key === "name" || value.key === "model") ?? values[0];
  const secondary = values.find((value) => value.key === "artist" || value.key === "manufacturer") ?? values.find((value) => value !== primary);
  const meta = values.filter((value) => value !== primary && value !== secondary);

  return (
    <div className="song-card-info">
      <div>
        {primary ? <strong>{primary.value}</strong> : null}
        {secondary ? <span>{secondary.value}</span> : null}
      </div>
      {meta.length ? <b>{meta.map((value) => value.value).join(" · ")}</b> : null}
    </div>
  );
}

function TimelineDropSlot({
  active,
  index,
  onSelect,
}: {
  active: boolean;
  index: number;
  onSelect: (index: number) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `slot-${index}`,
  });

  return (
    <motion.button
      animate={{ marginLeft: 7, marginRight: 7, opacity: 1, width: active || isOver ? 24 : 18 }}
      className={active || isOver ? "drop-target selected" : "drop-target"}
      exit={{ marginLeft: 0, marginRight: 0, opacity: 0, width: 0 }}
      initial={{ marginLeft: 0, marginRight: 0, opacity: 0, width: 0 }}
      onClick={() => onSelect(index)}
      ref={setNodeRef}
      transition={{ duration: 0.78, ease: [0.16, 1, 0.3, 1] }}
      type="button"
      aria-label={`An Position ${index + 1} einsortieren`}
    />
  );
}

function ExtraGuesses({
  game,
  onSubmit,
}: {
  game: Game;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(values);
  };
  useFooterActions([
    {
      key: "submit-extra-guesses",
      label: "Guess einloggen",
      icon: <Check size={16} />,
      variant: "primary",
      onClick: () => onSubmit(values),
    },
  ]);

  return (
    <form className="flow" onSubmit={submit}>
      {game.settings.extraGuessSelectors.map((selector) => (
        <label className="field" key={selector.key}>
          {selector.label}
          <input
            value={values[selector.key] ?? ""}
            onChange={(event) => setValues((current) => ({ ...current, [selector.key]: event.target.value }))}
          />
        </label>
      ))}
    </form>
  );
}

function Challenge({
  audioProgress,
  game,
  onResolve,
  onTogglePause,
  paused,
}: {
  audioProgress: number;
  game: Game;
  onResolve: (claims?: RoundCorrectionClaim[]) => void;
  onTogglePause: () => void;
  paused: boolean;
}) {
  const activePlayer = getActivePlayer(game);
  const activeEntry = getActiveEntry(game);
  const proposedIndex = game.activeRound?.proposedIndex;
  const [claims, setClaims] = useState<RoundCorrectionClaim[]>([]);
  const [selectedCorrectionIndex, setSelectedCorrectionIndex] = useState<number | undefined>();

  useFooterActions([]);

  const claimForSelectedIndex = claims.find((claim) => claim.proposedIndex === selectedCorrectionIndex);
  const claimedPlayerIds = new Set(claims.map((claim) => claim.playerId));
  const selectClaimTeam = (playerId: string) => {
    if (selectedCorrectionIndex === undefined) return;
    setClaims((current) => [
      ...current.filter((claim) => claim.proposedIndex !== selectedCorrectionIndex && claim.playerId !== playerId),
      { playerId, proposedIndex: selectedCorrectionIndex },
    ]);
    setSelectedCorrectionIndex(undefined);
  };

  return (
    <div className="flow challenge-stage">
      <div className="round-card-stage">
        <div className="challenge-top">
          <div>
            <p>Korrektur</p>
            <h2>Korrekturen anmelden</h2>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => onResolve(claims)}
          >
            {claims.length > 0 ? <RotateCcw size={16} /> : <Check size={16} />}
            {claims.length > 0 ? "Korrekturen prüfen" : "Keine Korrektur"}
          </button>
        </div>
      </div>
      <CorrectionTimeline
        activeEntry={activeEntry}
        audioProgress={audioProgress}
        claims={claims}
        game={game}
        insertIndex={proposedIndex}
        onTogglePause={onTogglePause}
        onSelectGap={setSelectedCorrectionIndex}
        paused={paused}
        player={activePlayer}
      />
      <Dialog.Root
        open={selectedCorrectionIndex !== undefined}
        onOpenChange={(open) => !open && setSelectedCorrectionIndex(undefined)}
      >
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content challenge-dialog"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="dialog-header">
            <Dialog.Title>Korrektur anmelden</Dialog.Title>
            <Dialog.Description>
              Wähle das Team, das die Karte an dieser Luecke einsortieren
              wuerde.
            </Dialog.Description>
          </div>
          <div className="challenge-list">
            {game.players
              .filter((player) => player.id !== activePlayer.id)
              .map((player, index) => (
                <button
                  type="button"
                  className="challenge-team-card player-card readonly"
                  disabled={
                    !canChallenge(game, player) ||
                    (claimedPlayerIds.has(player.id) &&
                      player.id !== claimForSelectedIndex?.playerId)
                  }
                  key={player.id}
                  onClick={() => selectClaimTeam(player.id)}
                  style={
                    { "--player-color": player.color } as React.CSSProperties
                  }
                >
                  <div className="player-card-top">
                    <span>Team {index + 1}</span>
                  </div>
                  <TeamAvatar color={player.color} name={player.name} />
                  <strong>{player.name}</strong>
                  <div className="challenge-team-meta">
                    <div
                      className="coin-row"
                      aria-label={`${player.extraPoints} Korrekturpunkte`}
                    >
                      {Array.from(
                        { length: player.extraPoints },
                        (_, coinIndex) => (
                          <i className="coin active" key={coinIndex} />
                        ),
                      )}
                    </div>
                    <small>{player.extraPoints+" "} Korrekturen übrig</small>
                  </div>
                </button>
              ))}
          </div>
          <div className="dialog-actions">
            {claimForSelectedIndex ? (
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setClaims((current) =>
                    current.filter(
                      (claim) =>
                        claim.proposedIndex !== selectedCorrectionIndex,
                    ),
                  );
                  setSelectedCorrectionIndex(undefined);
                }}
              >
                Entfernen
              </button>
            ) : null}
            <button
              className="secondary-button"
              type="button"
              onClick={() => setSelectedCorrectionIndex(undefined)}
            >
              Abbrechen
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}

function CorrectionTimeline({
  activeEntry,
  audioProgress,
  claims,
  game,
  insertIndex,
  onTogglePause,
  onSelectGap,
  paused,
  player,
}: {
  activeEntry?: GuessEntry;
  audioProgress: number;
  claims: RoundCorrectionClaim[];
  game: Game;
  insertIndex?: number;
  onTogglePause: () => void;
  onSelectGap: (index: number) => void;
  paused: boolean;
  player: Player;
}) {
  const orderKey = game.settings.orderSelector.key;
  const displayEntry = activeEntry
    ? {
        ...activeEntry,
        guessedValues: {
          ...activeEntry.guessedValues,
          ...(game.activeRound?.extraGuesses ?? {}),
        },
      }
    : undefined;
  const timeline = getTimelinePreviewEntries(player.timeline, displayEntry, insertIndex);
  const claimByIndex = new Map(claims.map((claim) => [claim.proposedIndex, claim]));
  const hiddenGaps = new Set(
    insertIndex === undefined ? [] : [Math.max(0, insertIndex), Math.min(player.timeline.length + 1, insertIndex + 1)],
  );

  return (
    <div className="timeline-preview">
      <div className="timeline-row preview correction">
        {Array.from({ length: timeline.length + 1 }, (_, index) => {
          const claim = claimByIndex.get(index);
          const claimPlayer = game.players.find((candidate) => candidate.id === claim?.playerId);
          return (
            <div className="timeline-pair" key={index}>
              <AnimatePresence>
                {hiddenGaps.has(index) ? null : (
                  <motion.button
                    animate={{ marginLeft: 9, marginRight: 9, opacity: 1, width: claimPlayer ? 46 : 26 }}
                    className={claimPlayer ? "correction-gap claimed" : "correction-gap"}
                    exit={{ marginLeft: 0, marginRight: 0, opacity: 0, width: 0 }}
                    initial={{ marginLeft: 0, marginRight: 0, opacity: 0, width: 0 }}
                    key={`correction-gap-${index}`}
                    onClick={() => onSelectGap(index)}
                    style={claimPlayer ? ({ "--player-color": claimPlayer.color } as React.CSSProperties) : undefined}
                    transition={{ duration: 0.82, ease: [0.16, 1, 0.3, 1] }}
                    type="button"
                    aria-label={`Korrektur an Position ${index + 1} anmelden`}
                  >
                    {claimPlayer ? <span>{claimPlayer.name}</span> : "+"}
                  </motion.button>
                )}
              </AnimatePresence>
              {timeline[index] ? (
                <TimelineCard
                  displaySelectors={game.settings.displaySelectors}
                  entry={timeline[index]}
                  audioProgress={displayEntry?.id === timeline[index].id ? audioProgress : undefined}
                  inserted={displayEntry?.id === timeline[index].id}
                  mode={game.settings.mode}
                  onTogglePause={displayEntry?.id === timeline[index].id ? onTogglePause : undefined}
                  orderKey={orderKey}
                  paused={displayEntry?.id === timeline[index].id ? paused : undefined}
                  presentationSelectors={getPresentSelectorsForCard(game.settings)}
                  revealed={displayEntry?.id !== timeline[index].id}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoundResultView({
  audioProgress,
  game,
  onTogglePause,
  onNext,
  paused,
}: {
  audioProgress: number;
  game: Game;
  onTogglePause: () => void;
  onNext: () => void;
  paused: boolean;
}) {
  const result = game.activeRound?.result;
  const [revealResult, setRevealResult] = useState(false);
  const entry = getActiveEntry(game);
  const activePlayer = game.players.find((player) => player.id === game.activeRound?.playerId) ?? getActivePlayer(game);
  const awardedPlayer = game.players.find((player) => player.id === result?.awardedPlayerId);
  const proposedIndex = game.activeRound?.proposedIndex;
  const extraGuessResults = entry ? getExtraGuessResults(game, entry) : [];
  useFooterActions([]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setRevealResult(true), 1050);
    return () => window.clearTimeout(timeout);
  }, [entry?.id]);

  return (
    <div className="flow result-flow">
      <div className="round-card-stage">
        <motion.div
          className="result-box"
          animate={{ opacity: revealResult ? 1 : 0, y: revealResult ? 0 : 10 }}
          initial={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
        >
          <div>
            {!revealResult?null:
            <ResultLottie correct={Boolean(result?.activePlayerCorrect)} />
            }
          </div>
          <div className="result-box-actions">
            {result?.message ? <p>{result.message}</p> : null}
            {extraGuessResults.length > 0 ? (
              <div className="guess-result-summary">
                <div className="guess-result-list">
                  {extraGuessResults.map((guess) => (
                    <span className={guess.correct ? "guess-result correct" : "guess-result"} key={guess.key}>
                      {guess.label}: {guess.correct ? "richtig" : "falsch"}
                    </span>
                  ))}
                </div>
                {result?.extraGuessesCorrect ? <strong>+1 Korrekturpunkt</strong> : null}
              </div>
            ) : null}
            <button className="primary-button" type="button" onClick={onNext}>
              <Play size={16} fill="currentColor" />
              Weiter
            </button>
          </div>
        </motion.div>
      </div>
      <TimelinePreview
        game={game}
        audioProgress={audioProgress}
        insertedState={revealResult ? (result?.activePlayerCorrect ? "correct" : "wrong") : undefined}
        onTogglePause={onTogglePause}
        paused={paused}
        player={activePlayer}
        entry={entry}
        insertIndex={proposedIndex}
        revealInserted
      />
    </div>
  );
}

function ResultLottie({ correct }: { correct: boolean }) {
  return (
    <DotLottieReact
      aria-label={correct ? "Richtig" : "Falsch"}
      autoplay
      className="result-lottie"
      loop={false}
      src={`${import.meta.env.BASE_URL}animations/${correct ? "Trophy.lottie" : "failedTask.lottie"}`}
    />
  );
}

function TimelinePreview({
  audioProgress,
  entry,
  game,
  insertIndex,
  insertedState,
  onTogglePause,
  paused,
  player,
  revealInserted = false,
}: {
  audioProgress?: number;
  entry?: GuessEntry;
  game: Game;
  insertIndex?: number;
  insertedState?: "correct" | "wrong";
  onTogglePause?: () => void;
  paused?: boolean;
  player: Player;
  revealInserted?: boolean;
}) {
  const orderKey = game.settings.orderSelector.key;
  const timeline = getTimelinePreviewEntries(player.timeline, entry, insertIndex);

  return (
    <div className="timeline-preview">
      <div className="timeline-row preview">
        {timeline.length === 0 ? (
          <div className="timeline-empty">Noch keine Karten in der Reihe.</div>
        ) : (
          timeline.map((item) => (
            <TimelineCard
              displaySelectors={game.settings.displaySelectors}
              entry={item}
              audioProgress={entry?.id === item.id ? audioProgress : undefined}
              inserted={entry?.id === item.id}
              insertedState={entry?.id === item.id ? insertedState : undefined}
              key={item.id}
              mode={game.settings.mode}
              onTogglePause={entry?.id === item.id ? onTogglePause : undefined}
              orderKey={orderKey}
              paused={entry?.id === item.id ? paused : undefined}
              presentationSelectors={getPresentSelectorsForCard(game.settings)}
              revealed={entry?.id !== item.id || revealInserted}
              animateReveal={entry?.id === item.id && revealInserted}
            />
          ))
        )}
      </div>
    </div>
  );
}

function FinishedGame({ game }: { game: Game }) {
  const topScore = Math.max(...game.players.map((player) => player.points));
  const winners = game.players.filter((player) => player.points === topScore);
  const winnerCard = winners.flatMap((winner) => winner.timeline).at(-1);
  const rankedPlayers = [...game.players].sort((first, second) => second.points - first.points);
  const podiumPlayers = [rankedPlayers[1], rankedPlayers[0], rankedPlayers[2]].filter(Boolean);
  useFooterActions([]);

  return (
    <div className="flow finished-game-flow">
      <section className="finished-podium" aria-label="Endstand">
        <p>Spiel beendet</p>
        <div className="podium-stand">
          {podiumPlayers.map((player) => {
            const rank = rankedPlayers.findIndex((candidate) => candidate.id === player.id) + 1;
            return (
              <article
                className={`podium-team rank-${rank}`}
                key={player.id}
                style={{ "--player-color": player.color } as React.CSSProperties}
              >
                <div className="podium-team-meta">
                  <TeamAvatar color={player.color} name={player.name} small />
                  <strong>{player.name}</strong>
                  <span>{player.points} Punkte</span>
                </div>
                <div className="podium-step">{rank}</div>
              </article>
            );
          })}
        </div>
      </section>
      {winnerCard ? (
        <section className="winner-card-stage">
          <p>Gewinnerkarte</p>
          <TimelineCard displaySelectors={game.settings.displaySelectors} entry={winnerCard} mode={game.settings.mode} orderKey={game.settings.orderSelector.key} />
        </section>
      ) : null}
      <section className="finished-orders">
        {game.players.map((player) => (
          <article className="finished-order-card" key={player.id} style={{ "--player-color": player.color } as React.CSSProperties}>
            <div className="finished-order-header">
              <TeamAvatar color={player.color} name={player.name} small />
              <div>
                <h2>{player.name}</h2>
                <p>{player.points} Punkte · {player.timeline.length} Karten</p>
              </div>
            </div>
            {player.timeline.length === 0 ? (
              <p className="muted">Keine Karten gesammelt.</p>
            ) : (
              <div className="finished-order-row">
                {player.timeline.map((entry) => (
                  <TimelineCard displaySelectors={game.settings.displaySelectors} entry={entry} key={entry.id} mode={game.settings.mode} orderKey={game.settings.orderSelector.key} />
                ))}
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

function CardGridMotionBackground({ game }: { game: Game }) {
  const cards = getGameGridCards(game);
  if (cards.length === 0) return null;
  const rows = createGridMotionRows(cards, 4);

  return (
    <div className="grid-motion-background" aria-hidden="true">
      <div className="grid-motion-shade" />
      <div className="grid-motion-track">
        {rows.map((row, rowIndex) => (
          <motion.div
            animate={{ x: rowIndex % 2 === 0 ? ["0%", "-50%"] : ["-50%", "0%"] }}
            className="grid-motion-row"
            key={rowIndex}
            transition={{ duration: 42 + rowIndex * 8, ease: "linear", repeat: Infinity }}
          >
            {[...row, ...row].map((entry, index) => {
              const image = getEntryImage(entry);
              return (
                <div className="grid-motion-card" key={`${entry.id}-${index}`}>
                  {image ? <SafeImage image={image} /> : <span>{String(entry.title ?? entry.name ?? "ChronIQ")}</span>}
                </div>
              );
            })}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const getGameGridCards = (game: Game) => {
  const entries = [
    ...game.players.flatMap((player) => player.timeline),
    ...game.guessEntries,
  ];
  const uniqueEntries = new Map<string, GuessEntry>();
  for (const entry of entries) {
    uniqueEntries.set(entry.id, entry);
  }
  return [...uniqueEntries.values()];
};

const createGridMotionRows = (entries: GuessEntry[], rowCount: number) => {
  const minimumItems = rowCount * 10;
  const repeated = Array.from({ length: Math.max(entries.length, minimumItems) }, (_, index) => entries[index % entries.length]);
  return Array.from({ length: rowCount }, (_, rowIndex) =>
    repeated.filter((_, index) => index % rowCount === rowIndex),
  );
};

export function HistoryPage() {
  const state = useAppState();
  const deleteHistoryEntry = (id: string) => {
    setState((current) => ({
      ...current,
      history: current.history.filter((entry) => entry.id !== id),
    }));
  };

  return (
    <section className="panel history-panel">
      <div className="section-heading">
        <p>Archiv</p>
        <h1>Historie</h1>
      </div>
      {state.history.length === 0 ? (
        <p className="muted">Noch keine abgeschlossenen Spiele.</p>
      ) : (
        <div className="history-list">
          {state.history.map((game) => (
            <article className="history-item" key={game.id}>
              <button
                aria-label={`${game.name} löschen`}
                className="history-delete-button"
                type="button"
                onClick={() => deleteHistoryEntry(game.id)}
              >
                <Trash2 size={15} />
              </button>
              <Link className="history-item-link" to="/history/$gameId" params={{ gameId: game.id }}>
                <div>
                  <h2>{game.name}</h2>
                  <p>
                    {new Date(game.finishedAt).toLocaleString("de-DE")} · {game.replayEntries?.length ?? 0} Replay-Karten
                  </p>
                </div>
                <div className="history-scores">
                  {game.players.map((player) => (
                    <span key={player.id} style={{ borderColor: player.color }}>
                      {player.name}: {player.points}
                    </span>
                  ))}
                </div>
              </Link>
            </article>
          ))}
        </div>
      )}
      <button className="ghost-button" onClick={resetState}>
        <Trash2 size={15} />
        Lokale Daten zurücksetzen
      </button>
    </section>
  );
}

export function HistoryDetailPage({ gameId }: { gameId: string }) {
  const state = useAppState();
  const summary = state.history.find((entry) => entry.id === gameId);

  if (!summary) {
    return (
      <section className="empty-state">
        <h1>Historie</h1>
        <p>Dieses Spiel wurde nicht gefunden.</p>
        <Link className="primary-button" to="/history">
          Zur Historie
        </Link>
      </section>
    );
  }
  const game = createGameFromHistorySummary(summary);
  return (
    <>
      <CardGridMotionBackground game={game} />
      <section className="panel history-result-panel">
        <div className="section-heading">
          <p>{new Date(summary.finishedAt).toLocaleString("de-DE")}</p>
          <h1>{summary.name}</h1>
        </div>
        <FinishedGame game={game} />
      </section>
    </>
  );
}

export function SettingsPage() {
  const state = useAppState();
  const translate = createTranslator(state.preferences.language);
  const spotifyConnector = state.connectors.find((connector) => connector.kind === "spotify");
  const configuredSpotifyConnector = getConfiguredSpotifyConnector(state);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const spotifyClientConfigured = hasSpotifyClientId();
  const unsupportedDevOrigin = isUnsupportedSpotifyDevOrigin();

  const connectSpotify = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setConnecting(true);
    try {
      await startSpotifyAuthorization();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : translate("settings.spotifyStartError"));
      setConnecting(false);
    }
  };

  const removeSpotify = () => {
    disconnectSpotify();
    setState((current) => ({
      ...current,
      connectors: current.connectors.filter((connector) => connector.kind !== "spotify"),
    }));
  };

  return (
    <div className="flex gap-1 flex-col">
      <section className="settings-card">
        <div>
          <h2>{translate("settings.appearance")}</h2>
          <p>{translate("settings.appearanceHint")}</p>
        </div>
        <div className="settings-grid">
          <label className="field">
            {translate("settings.theme")}
            <select
              value={state.preferences.theme}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  preferences: {
                    ...current.preferences,
                    theme: event.target.value as typeof current.preferences.theme,
                  },
                }))
              }
            >
              <option value="system">{translate("theme.system")}</option>
              <option value="light">{translate("theme.light")}</option>
              <option value="dark">{translate("theme.dark")}</option>
            </select>
          </label>
          <label className="field">
            {translate("settings.language")}
            <select
              value={state.preferences.language}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  preferences: {
                    ...current.preferences,
                    language: event.target.value as typeof current.preferences.language,
                  },
                }))
              }
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
    </section>
    
    <section className="settings-card connector-main-card">
        <div>
          <h2>Connectoren</h2>
          <p>Dienste, die Spielmodi mit externen Daten versorgen.</p>
        </div>
        <div className="connector-list">
          <form className="connector-card" onSubmit={connectSpotify}>
          <span className={configuredSpotifyConnector ? "status-dot configured" : "status-dot"}>
            {configuredSpotifyConnector ? translate("settings.active") : translate("settings.open")}
          </span>
          <div>
            <h2>Spotify</h2>
            <p>
              {configuredSpotifyConnector
                ? `${translate("settings.spotifyConnected")}${spotifyConnector?.account?.displayName ? ` ${translate("settings.as")} ${spotifyConnector.account.displayName}` : ""}.`
                : translate("settings.spotifyRequired")}
            </p>
          </div>
          <div className="connector-form">
            {!spotifyClientConfigured ? (
              <div className="setup-note">
                <strong>{translate("settings.spotifyConfigMissing")}</strong>
                <p>{translate("settings.spotifyConfigHint")}</p>
                <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
                  {translate("settings.openDashboard")}
                </a>
              </div>
            ) : null}
            {unsupportedDevOrigin ? (
              <div className="setup-note">
                <strong>{translate("settings.localhostUnsupported")}</strong>
                <p>{translate("settings.localhostHint")}</p>
                <a href={getSpotifySafeDevUrl()}>{translate("settings.openLoopback")}</a>
              </div>
            ) : null}
            <label className="field">
              Redirect URI
              <input readOnly value={getSpotifyRedirectUri()} />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="actions">
              {spotifyConnector ? (
                <button className="secondary-button" type="button" onClick={removeSpotify}>
                  <Cable size={15} />
                  {translate("settings.disconnect")}
                </button>
              ) : null}
              <button
                className="primary-button"
                type="submit"
                disabled={connecting || !spotifyClientConfigured || unsupportedDevOrigin}
              >
                <Cable size={15} />
                {configuredSpotifyConnector ? translate("settings.reconnect") : translate("settings.connectSpotify")}
              </button>
            </div>
          </div>
          </form>
        </div>
      </section></div>
  );
}

export function SpotifyCallbackPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Spotify Verbindung wird abgeschlossen...");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const callbackError = params.get("error");

    if (callbackError) {
      setError(`Spotify hat den Login abgebrochen: ${callbackError}`);
      return;
    }
    if (!code || !state) {
      setError("Spotify Callback enthält keinen Code.");
      return;
    }

    completeSpotifyAuthorization(code, state)
      .then(({ connector, returnTo }) => {
        setState((current) => ({
          ...current,
          connectors: [
            connector,
            ...current.connectors.filter((entry) => entry.kind !== "spotify"),
          ],
        }));
        setMessage("Spotify ist verbunden.");
        navigate({ to: returnTo, replace: true });
      })
      .catch((authError) => {
        setError(authError instanceof Error ? authError.message : "Spotify Verbindung fehlgeschlagen.");
      });
  }, [navigate]);

  return (
    <section className="empty-state">
      <h1>Spotify</h1>
      <p>{error || message}</p>
      {error ? (
        <Link className="primary-button" to="/settings">
          Zurück zu Settings
        </Link>
      ) : null}
    </section>
  );
}

function AudioPresentation({ entry, compact = false }: { entry: GuessEntry; compact?: boolean }) {
  const audio = entry.audioPreview;
  const spotifyUri = typeof entry.spotifyUri === "string" ? entry.spotifyUri : undefined;

  return (
    <article className={compact ? "audio-presentation compact" : "audio-presentation"}>
      <div className="audio-mark" aria-hidden="true">
        Audio
      </div>
      {isAudioValue(audio) ? (
        <audio controls preload="none" src={audio.url} aria-label="Audio der gezogenen Karte" />
      ) : spotifyUri ? (
        <p className="muted">Spotify Playback aktiv.</p>
      ) : (
        <p className="muted">Keine Audioquelle für diese Karte vorhanden.</p>
      )}
    </article>
  );
}

function TimelineCard({
  audioProgress,
  displaySelectors,
  entry,
  inserted = false,
  insertedState,
  mode,
  onTogglePause,
  orderKey,
  paused,
  presentationSelectors,
  revealed = true,
  animateReveal = false,
}: {
  animateReveal?: boolean;
  audioProgress?: number;
  displaySelectors?: GameSettings["displaySelectors"];
  entry: GuessEntry;
  inserted?: boolean;
  insertedState?: "correct" | "wrong";
  mode: GameMode;
  onTogglePause?: () => void;
  orderKey: string;
  paused?: boolean;
  presentationSelectors?: GameSettings["displaySelectors"];
  revealed?: boolean;
}) {
  const [showGuesses, setShowGuesses] = useState(false);
  const canShowGuesses = Boolean(entry.guessedValues?.title || entry.guessedValues?.artist);

  return (
    <div
      className={[
        "timeline-card",
        inserted ? "inserted" : "",
        insertedState ? insertedState : "",
        canShowGuesses ? "has-guesses" : "",
      ].filter(Boolean).join(" ")}
      onPointerEnter={() => setShowGuesses(true)}
      onPointerLeave={() => setShowGuesses(false)}
      onFocus={() => setShowGuesses(true)}
      onBlur={() => setShowGuesses(false)}
      tabIndex={canShowGuesses ? 0 : undefined}
    >
      <PlayCard
        animateReveal={animateReveal}
        audioProgress={audioProgress}
        displaySelectors={displaySelectors}
        entry={entry}
        mode={mode}
        onTogglePause={onTogglePause}
        orderKey={orderKey}
        paused={Boolean(paused)}
        presentationSelectors={presentationSelectors}
        revealed={revealed}
        showGuesses={showGuesses && canShowGuesses}
      />
    </div>
  );
}

function CoverImage({ entry }: { entry: GuessEntry }) {
  const cover = getEntryImage(entry);

  return isImageValue(cover) ? (
    <SafeImage fallback={<div className="cover-placeholder" />} image={cover} />
  ) : (
    <div className="cover-placeholder" />
  );
}

function SafeImage({
  fallback = null,
  image,
  onClick,
}: {
  fallback?: React.ReactNode;
  image: Extract<MediaData, { type: "image" }>;
  onClick?: React.MouseEventHandler<HTMLImageElement>;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image.url]);
  if (failed) return <>{fallback}</>;
  return <img src={image.url} alt={image.alt ?? ""} onClick={onClick} onError={() => setFailed(true)} />;
}

const getEntryImage = (entry: GuessEntry) => {
  const image = entry.image ?? entry.albumCover;
  return isImageValue(image) ? image : undefined;
};

type CardSelector = NonNullable<GameSettings["displaySelectors"]>[number];
type CardTextValue = { key: string; value: string };

const normalizeCardSelectors = (
  selectors: GameSettings["displaySelectors"] | undefined,
  entry: GuessEntry,
  orderKey: string,
  includeOrderValue: boolean,
): CardSelector[] => {
  const normalized = selectors?.length
    ? [...selectors]
    : ([
        { label: "Cover", key: getEntryImage(entry) ? "albumCover" : "image", type: "image" },
        { label: "Titel", key: "title", type: "text" },
        { label: "Artist", key: "artist", type: "text" },
      ] as CardSelector[]);
  const hasOrderKey = normalized.some((selector) => selector.key === orderKey);

  return includeOrderValue && !hasOrderKey
    ? [...normalized, { label: orderKey, key: orderKey, type: "text" }]
    : normalized;
};

const getSelectorImage = (entry: GuessEntry, selectors: CardSelector[]) => {
  for (const selector of selectors) {
    if (selector.type !== "image") continue;
    const image = entry[selector.key];
    if (isImageValue(image)) return image;
  }
  return undefined;
};

const getSelectorTextValues = (entry: GuessEntry, selectors: CardSelector[], showGuesses: boolean): CardTextValue[] =>
  selectors
    .filter((selector) => selector.type !== "image" && selector.key !== "audioPreview")
    .map((selector) => ({
      key: selector.key,
      value:
        selector.key === "title" || selector.key === "artist"
          ? getEntryDisplayText(entry, selector.key, showGuesses, selector.label)
          : formatEntryValue(selector.key, entry[selector.key]),
    }))
    .filter((value) => value.value !== "");

const getEntryDisplayText = (entry: GuessEntry, key: "title" | "artist", showGuesses: boolean, fallback: string) => {
  const guessedValue = entry.guessedValues?.[key]?.trim();
  if (showGuesses && guessedValue) return guessedValue;
  const value = entry[key];
  return typeof value === "string" && value ? value : fallback;
};

const useCoverAccentColor = (imageUrl: string | undefined, fallbackSeed: string) => {
  const [color, setColor] = useState(() => getSeedColor(fallbackSeed));

  useEffect(() => {
    if (!imageUrl) {
      setColor(getSeedColor(fallbackSeed));
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        const size = 18;
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0, size, size);
        const pixels = context.getImageData(0, 0, size, size).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;

        for (let index = 0; index < pixels.length; index += 4) {
          const alpha = pixels[index + 3] ?? 0;
          if (alpha < 64) continue;
          r += pixels[index] ?? 0;
          g += pixels[index + 1] ?? 0;
          b += pixels[index + 2] ?? 0;
          count += 1;
        }

        if (count > 0) setColor(rgbToHex(r / count, g / count, b / count));
      } catch {
        setColor(getSeedColor(fallbackSeed));
      }
    };
    image.onerror = () => {
      if (!cancelled) setColor(getSeedColor(fallbackSeed));
    };
    image.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [fallbackSeed, imageUrl]);

  return color;
};

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")}`;

const getSeedColor = (seed: string) => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 78% 58%)`;
};

function isAudioValue(value: GuessValue | undefined): value is Extract<GuessValue, { type: "audio" }> {
  return typeof value === "object" && value !== null && "type" in value && value.type === "audio";
}

function isImageValue(value: GuessValue | undefined): value is Extract<GuessValue, { type: "image" }> {
  return typeof value === "object" && value !== null && "type" in value && value.type === "image";
}

const formatEntryValue = (key: string, value: GuessValue | undefined) => {
  if (value === undefined) return "";
  if (key === "durationMs" && typeof value === "number") {
    const totalSeconds = Math.round(value / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }
  return String(value);
};

const getProgressTarget = (game: Game) => {
  const condition = game.settings.stopCondition;
  if (condition.type === "maxPoints") return condition.points;
  if (condition.type === "maxRounds") return condition.rounds;
  const leadingScore = Math.max(1, ...game.players.map((player) => player.points));
  return leadingScore + condition.points;
};

const getExtraGuessResults = (game: Game, entry: GuessEntry) =>
  game.settings.extraGuessSelectors.map((selector) => {
    const value = game.activeRound?.extraGuesses[selector.key]?.trim() ?? "";
    const expected = String(entry[selector.key] ?? "");
    return {
      key: selector.key,
      label: selector.label,
      value,
      expected,
      correct: isExtraGuessCorrect(selector.type, value, expected),
    };
  });

const modeLabels: Record<GameMode, string> = {
  "spotify-generator": "Spotify-Generator",
  "image-art": "Bild-Künstler",
  autoquartett: "Autoquartett",
  replay: "Replay",
  custom: "Custom",
};

const modeDescriptions: Record<GameMode, string> = {
  "spotify-generator": "Song-Daten von Spotify (Premium) laden",
  "image-art": "Bekannte Kunstwerke laden",
  autoquartett: "KFZ-Daten laden",
  replay: "Vergangenes Spiel erneut spielen.",
  custom: "Tabelle laden",
};

function ModeSelect({ value, onValueChange }: { value: GameMode; onValueChange: (value: GameMode) => void }) {
  const modes = Object.keys(modeLabels) as GameMode[];

  return (
    <Select.Root value={value} onValueChange={(nextValue) => onValueChange(nextValue as GameMode)}>
      <Select.Trigger className="select-trigger mode-select-trigger" aria-label="Spielmodus auswählen">
        <Select.Value />
        <Select.Icon className="mode-select-icon">⌄</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="mode-select-content" position="popper" sideOffset={8}>
          <Select.Viewport>
            {modes.map((mode) => (
              <Select.Item className="mode-select-item" value={mode} key={mode}>
                <Select.ItemText>
                  <span>{modeLabels[mode]}</span>
                  <small>{modeDescriptions[mode]}</small>
                </Select.ItemText>
                <Select.ItemIndicator className="mode-select-check">
                  <Check size={14} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}


const fallbackStaticModeCardCounts: Record<Exclude<GameMode, "spotify-generator">, number> = {
  "image-art": 5,
  autoquartett: 5,
  replay: 0,
  custom: 0,
};

const getAvailableCardsLabel = (
  mode: GameMode,
  spotifyCount = 0,
  replayCount = 0,
  customCount = 0,
  builtInCounts: Record<"image-art" | "autoquartett", number> = { "image-art": 0, autoquartett: 0 },
) => {
  if (mode === "replay") return String(replayCount);
  if (mode === "custom") return String(customCount);
  if (mode === "image-art" || mode === "autoquartett") return String(builtInCounts[mode] || fallbackStaticModeCardCounts[mode]);
  if (mode !== "spotify-generator") return String(fallbackStaticModeCardCounts[mode]);
  return `${spotifyCount}+`;
};

const hasPresentKey = (settings: GameSettings, key: string) =>
  (settings.presentSelectors ?? [settings.presentSelector]).some((selector) => selector.key === key);

const hasAudioKey = (settings: GameSettings) =>
  hasPresentKey(settings, "audioPreview") ||
  Boolean(settings.displaySelectors?.some((selector) => selector.key === "audioPreview"));

const getPresentSelectorsForCard = (settings: GameSettings): GameSettings["displaySelectors"] =>
  (settings.presentSelectors ?? [settings.presentSelector])
    .map((selector) => ({
      label: selector.key,
      key: selector.key,
      type: selector.type === "image" ? "image" : "text",
    }));

const getScoreDotStyle = (index: number, count: number) => {
  const spread = Math.min(96, Math.max(28, (count - 1) * 28));
  const angle = count <= 1 ? 0 : -spread / 2 + (spread * index) / (count - 1);
  return { "--dot-angle": `${angle}deg` } as React.CSSProperties;
};

function TeamAvatar({ color, name, small = false }: { color: string; name: string; small?: boolean }) {
  const avatars = useMemo(
    () => ({
      normal: getTeamIconDataUri(name, color),
      pressed: getTeamIconDataUri(name, color, "bow"),
      wink: getTeamIconDataUri(name, color, "wink"),
    }),
    [color, name],
  );

  return (
    <span className={small ? "team-avatar-wrap small" : "team-avatar-wrap"}>
      <img alt="" className="team-avatar normal" src={avatars.normal} />
      <img alt="" className="team-avatar wink" src={avatars.wink} />
      <img alt="" className="team-avatar pressed" src={avatars.pressed} />
    </span>
  );
}

const getTeamIconDataUri = (name: string, color: string, eyes?: "bow" | "wink") => {
  const seed = `${name.trim() || "Team"}-${color}`;
  const teamColor = color.replace("#", "");
  return createAvatar(toonHead, {
    seed,
    backgroundColor: [teamColor],
    clothesColor: [teamColor],
    ...(eyes ? { eyes: [eyes] } : {}),
    radius: 50,
  }).toDataUri();
};

const getStopConditionSummary = (type: "maxPoints" | "maxRounds" | "leadPoints", value: number) => {
  if (type === "maxRounds") return `${value} Runden`;
  if (type === "leadPoints") return `${value} Punkte Vorsprung`;
  return `${value} Punkte bis Sieg`;
};

const isAudioCardMode = (mode: GameMode) => mode === "spotify-generator" || mode === "replay";

const stopConditionOptions = [
  {
    type: "maxPoints" as const,
    label: "Punkte",
    description: "Wer zuerst das Ziel erreicht, gewinnt.",
    valueLabel: "Punkte bis Sieg",
    defaultValue: 10,
  },
  {
    type: "maxRounds" as const,
    label: "Runden",
    description: "Nach fester Rundenzahl gewinnt der höchste Score.",
    valueLabel: "Maximale Runden",
    defaultValue: 12,
  },
  {
    type: "leadPoints" as const,
    label: "Vorsprung",
    description: "Spiel endet bei genug Abstand zum Feld.",
    valueLabel: "Nötiger Vorsprung",
    defaultValue: 3,
  },
];

const createStopCondition = (
  type: "maxPoints" | "maxRounds" | "leadPoints",
  value: number,
): StopCondition => {
  const normalized = Math.max(1, value);
  if (type === "maxRounds") return { type, rounds: normalized };
  return { type, points: normalized };
};

const normalizeCardChoiceCount = (value: number | undefined) => Math.max(1, Math.min(20, Math.floor(Number(value) || 3)));

const getStopConditionValue = (condition: StopCondition) =>
  condition.type === "maxRounds" ? condition.rounds : condition.points;

const createDefaultSetupPlayers = () =>
  Array.from({ length: 3 }, (_, index) => ({
    name: `Team ${index + 1}`,
    color: playerColors[index],
  }));

const createDefaultGameName = (index: number) =>
  `Spiel ${index} am ${new Date().toLocaleDateString("de-DE")}`;

const translations = {
  de: {
    "nav.setup": "Setup",
    "nav.game": "Spiel",
    "nav.history": "Historie",
    "nav.settings": "Settings",
    "footer.newGame": "Neues Spiel",
    "footer.history": "Verlauf",
    "footer.menu": "Menü",
    "footer.finishGame": "Spiel beenden",
    "footer.menuHistory": "Historie",
    "footer.settings": "Einstellungen",
    "header.activeGameActions": "Aktives Spiel",
    "header.continueGame": "Spiel fortsetzen",
    "header.finishGame": "Spiel beenden",
    "menu.status": "Status",
    "menu.saved": "Spiel gespeichert",
    "menu.ready": "Bereit",
    "menu.connectors": "Connectoren",
    "settings.eyebrow": "App",
    "settings.title": "Settings",
    "settings.appearance": "Darstellung",
    "settings.appearanceHint": "Theme und Sprache werden lokal gespeichert.",
    "settings.theme": "App-Theme",
    "settings.language": "Sprache",
    "settings.spotifyConnected": "Verbunden",
    "settings.as": "als",
    "settings.spotifyRequired": "Nötig für den Spotify-Generator.",
    "settings.active": "aktiv",
    "settings.open": "offen",
    "settings.spotifyConfigMissing": "Spotify App-Konfiguration fehlt",
    "settings.spotifyConfigHint": "Setze VITE_SPOTIFY_CLIENT_ID in .env.local. Die Client ID bekommst du im Spotify Developer Dashboard.",
    "settings.openDashboard": "Dashboard öffnen",
    "settings.localhostUnsupported": "localhost wird von Spotify nicht akzeptiert",
    "settings.localhostHint": "Öffne die App für den Spotify-Login über die Loopback-IP. Trage im Spotify Dashboard dieselbe Redirect URI ein.",
    "settings.openLoopback": "Mit 127.0.0.1 öffnen",
    "settings.disconnect": "Trennen",
    "settings.reconnect": "Neu verbinden",
    "settings.connectSpotify": "Mit Spotify verbinden",
    "settings.spotifyStartError": "Spotify Verbindung konnte nicht gestartet werden.",
    "theme.system": "System",
    "theme.light": "Hell",
    "theme.dark": "Dunkel",
  },
  en: {
    "nav.setup": "Setup",
    "nav.game": "Game",
    "nav.history": "History",
    "nav.settings": "Settings",
    "footer.newGame": "New game",
    "footer.history": "History",
    "footer.menu": "Menu",
    "footer.finishGame": "End game",
    "footer.menuHistory": "History",
    "footer.settings": "Settings",
    "header.activeGameActions": "Active game",
    "header.continueGame": "Continue game",
    "header.finishGame": "End game",
    "menu.status": "Status",
    "menu.saved": "Game saved",
    "menu.ready": "Ready",
    "menu.connectors": "Connectors",
    "settings.eyebrow": "App",
    "settings.title": "Settings",
    "settings.appearance": "Appearance",
    "settings.appearanceHint": "Theme and language are stored locally.",
    "settings.theme": "App theme",
    "settings.language": "Language",
    "settings.spotifyConnected": "Connected",
    "settings.as": "as",
    "settings.spotifyRequired": "Required for the Spotify generator.",
    "settings.active": "active",
    "settings.open": "open",
    "settings.spotifyConfigMissing": "Spotify app configuration missing",
    "settings.spotifyConfigHint": "Set VITE_SPOTIFY_CLIENT_ID in .env.local. You can get the client ID from the Spotify Developer Dashboard.",
    "settings.openDashboard": "Open dashboard",
    "settings.localhostUnsupported": "Spotify does not accept localhost",
    "settings.localhostHint": "Open the app through the loopback IP for Spotify login. Add the same redirect URI in the Spotify Dashboard.",
    "settings.openLoopback": "Open with 127.0.0.1",
    "settings.disconnect": "Disconnect",
    "settings.reconnect": "Reconnect",
    "settings.connectSpotify": "Connect Spotify",
    "settings.spotifyStartError": "Spotify connection could not be started.",
    "theme.system": "System",
    "theme.light": "Light",
    "theme.dark": "Dark",
  },
} as const;

type TranslationKey = keyof typeof translations.de;

const createTranslator = (language: keyof typeof translations) => (key: TranslationKey) =>
  translations[language]?.[key] ?? translations.de[key];

const getTimelinePreviewEntries = (timeline: GuessEntry[], entry?: GuessEntry, insertIndex?: number) => {
  if (!entry || insertIndex === undefined) return timeline;

  const withoutEntry = timeline.filter((item) => item.id !== entry.id);
  const index = Math.min(insertIndex, withoutEntry.length);
  return [...withoutEntry.slice(0, index), entry, ...withoutEntry.slice(index)];
};

const createGameFromHistorySummary = (summary: FinishedGameSummary): Game => {
  const timelinesByPlayer = new Map(summary.playerTimelines?.map((entry) => [entry.id, entry.timeline]) ?? []);
  const settings = summary.settings ?? createHistoryFallbackSettings(summary);

  return {
    id: summary.id,
    createdAt: summary.startedAt,
    updatedAt: summary.finishedAt,
    finishedAt: summary.finishedAt,
    players: summary.players.map((player) => ({
      ...player,
      extraPoints: 0,
      timeline: timelinesByPlayer.get(player.id) ?? [],
    })),
    settings,
    generator:
      settings.mode === "spotify-generator"
        ? {
            id: "history-spotify",
            label: "Historie",
            type: "spotify-generator",
            seed: "history",
            connectorId: "history",
            generatedCount: summary.replayEntries?.length ?? 0,
            exhausted: true,
          }
        : {
            id: "history",
            label: "Historie",
            type: settings.mode,
            generatedCount: summary.replayEntries?.length ?? 0,
            exhausted: true,
          },
    guessEntries: summary.replayEntries ?? [],
    currentPlayerIndex: 0,
    roundNumber: summary.rounds,
    phase: "finished",
  };
};

const createHistoryFallbackSettings = (summary: FinishedGameSummary): GameSettings => ({
  name: summary.name,
  mode: "replay",
  stopCondition: { type: "maxRounds", rounds: summary.rounds },
  cardChoiceCount: 3,
  presentSelector: { type: "audio", key: "audioPreview" },
  orderSelector: { key: "year", dir: "asc" },
  extraGuessSelectors: [
    { type: "text-loose", key: "title", label: "Titel" },
    { type: "text-loose", key: "artist", label: "Artist" },
  ],
  displaySelectors: [
    { label: "Cover", key: "albumCover", type: "image" },
    { label: "Titel", key: "title", type: "text" },
    { label: "Artist", key: "artist", type: "text" },
    { label: "Jahr", key: "year", type: "text" },
  ],
});
