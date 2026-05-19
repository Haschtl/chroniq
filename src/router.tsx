import {
  DndContext,
  type DragEndEvent,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import * as Accordion from "@radix-ui/react-accordion";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { createContext, FormEvent, lazy, Suspense, useContext, useEffect, useMemo, useRef, useState } from "react";
import { converter, formatHex } from "culori";
import {
  Cable,
  Check,
  Download,
  Gamepad2,
  History,
  Home,
  Link as LinkIcon,
  Menu,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  archiveFinishedGame,
  appendGeneratedEntries,
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
  getSpotifySeedPreview,
  hasSpotifyClientId,
  isUnsupportedSpotifyDevOrigin,
  pauseSpotifyPlayback,
  playSpotifyTrack,
  searchSpotifySeeds,
  startSpotifyAuthorization,
  type SpotifySeedPreview,
} from "./spotify";
import { resetState, setState, useAppState } from "./store";
import { loadWikidataAutoquartettEntries } from "./wikidata";
import type {
  Game,
  GameGeneratorSettings,
  GameSettings,
  GameMode,
  GuessEntry,
  GuessValue,
  NewGamePlayerInput,
  Player,
  RoundCorrectionClaim,
  StopCondition,
  CustomSetupState,
} from "./types";

const Dither = lazy(() => import("./Dither"));

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/game",
  component: GamePage,
});

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: HistoryPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const spotifyCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/connectors/spotify/callback",
  component: SpotifyCallbackPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  gameRoute,
  historyRoute,
  settingsRoute,
  spotifyCallbackRoute,
]);

export const router = createRouter({ routeTree, basepath: import.meta.env.BASE_URL });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

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

function RootLayout() {
  const state = useAppState();
  const location = useLocation();
  const navigate = useNavigate();
  const [footerActions, setFooterActions] = useState<FooterAction[]>([]);
  const translate = createTranslator(state.preferences.language);
  const isGamePage = location.pathname === "/game";
  const canFinishGame = Boolean(state.activeGame && state.activeGame.phase !== "finished");
  const finishActiveGame = () => {
    if (!state.activeGame || state.activeGame.phase === "finished") return;
    setState((current) => (current.activeGame ? { ...current, activeGame: finishGame(current.activeGame) } : current));
    navigate({ to: "/game" });
  };

  return (
    <FooterActionsContext.Provider value={setFooterActions}>
      <div
        className={`${isGamePage ? "app-shell game-shell" : "app-shell"} ${state.activeGame ? "has-progress" : ""}`}
        data-theme={state.preferences.theme}
      >
        {!isGamePage ? (
          <header className="topbar">
            <div className="topbar-row">
              <Link to="/" className="brand">
                ChronIQ
              </Link>
              {state.activeGame ? (
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
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" className="footer-menu-content" side="top" sideOffset={10}>
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
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function HomePage() {
  const navigate = useNavigate();
  const state = useAppState();
  const savedSetup = state.setup;
  const defaultGameName = createDefaultGameName(state.history.length + 1);
  const [gameName, setGameName] = useState(savedSetup?.gameName || defaultGameName);
  const [players, setPlayers] = useState<NewGamePlayerInput[]>(
    savedSetup?.players?.length ? savedSetup.players : createDefaultSetupPlayers(),
  );
  const [mode, setMode] = useState<GameMode>(savedSetup?.mode ?? "spotify-generator");
  const [spotifySeed, setSpotifySeed] = useState(savedSetup?.spotifySeed ?? "");
  const [spotifyEntries, setSpotifyEntries] = useState<GuessEntry[]>(savedSetup?.spotifyEntries ?? []);
  const [spotifyGeneratedCount, setSpotifyGeneratedCount] = useState(savedSetup?.spotifyGeneratedCount ?? 0);
  const [spotifyExhausted, setSpotifyExhausted] = useState(savedSetup?.spotifyExhausted ?? false);
  const [customSetup, setCustomSetup] = useState<CustomSetupState>(savedSetup?.custom ?? createDefaultCustomSetup());
  const [customLoadError, setCustomLoadError] = useState("");
  const [customUrlLoading, setCustomUrlLoading] = useState(false);
  const [autoquartettLoadError, setAutoquartettLoadError] = useState("");
  const [replayHistoryId, setReplayHistoryId] = useState(savedSetup?.replayHistoryId ?? "");
  const [spotifyQuery, setSpotifyQuery] = useState("");
  const [spotifyPreview, setSpotifyPreview] = useState<SpotifySeedPreview | undefined>(savedSetup?.spotifyPreview);
  const [spotifyResults, setSpotifyResults] = useState<SpotifySeedPreview[]>([]);
  const [spotifyLookupError, setSpotifyLookupError] = useState("");
  const [spotifyLookupLoading, setSpotifyLookupLoading] = useState(false);
  const [spotifyPreloadLoading, setSpotifyPreloadLoading] = useState(false);
  const [gameStartLoading, setGameStartLoading] = useState(false);
  const initialStopCondition = savedSetup?.stopCondition ?? ({ type: "maxPoints", points: 10 } satisfies StopCondition);
  const [stopType, setStopType] = useState<"maxPoints" | "maxRounds" | "leadPoints">(initialStopCondition.type);
  const [stopValue, setStopValue] = useState(getStopConditionValue(initialStopCondition));
  const spotifyConnector = getConfiguredSpotifyConnector(state);
  const configuredConnectorCount = state.connectors.filter((connector) => connector.status === "configured").length;
  const requiredConnectorMissing = mode === "spotify-generator" && !spotifyConnector;
  const requiredSeedMissing = mode === "spotify-generator" && !spotifySeed;
  const selectedReplay = state.history.find((entry) => entry.id === replayHistoryId);
  const replayEntries = selectedReplay?.replayEntries ?? [];
  const requiredReplayMissing = mode === "replay" && replayEntries.length === 0;
  const requiredCustomMissing = mode === "custom" && customSetup.entries.length === 0;
  const availableCardsLabel = getAvailableCardsLabel(mode, spotifyEntries.length, replayEntries.length, customSetup.entries.length);

  const normalizedPlayers = useMemo(
    () =>
      players.map((player, index) => ({
        name: players[index]?.name ?? `Team ${index + 1}`,
        color: players[index]?.color ?? playerColors[index % playerColors.length],
      })),
    [players],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const stopCondition = createStopCondition(stopType, stopValue);
      setState((current) => ({
        ...current,
        setup: {
          gameName,
          mode,
          players: normalizedPlayers,
          spotifySeed,
          spotifyEntries,
          spotifyGeneratedCount,
          spotifyExhausted,
          custom: customSetup,
          replayHistoryId,
          spotifyPreview,
          stopCondition,
        },
      }));
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [
    gameName,
    customSetup,
    mode,
    normalizedPlayers,
    replayHistoryId,
    spotifyEntries,
    spotifyExhausted,
    spotifyGeneratedCount,
    spotifyPreview,
    spotifySeed,
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

  const clearSpotifyPreload = () => {
    setSpotifyEntries([]);
    setSpotifyGeneratedCount(0);
    setSpotifyExhausted(false);
  };

  const loadSpotifyBatch = async (showInlineLoading: boolean) => {
    if (!spotifyConnector?.auth || !spotifySeed) return undefined;
    if (showInlineLoading) setSpotifyPreloadLoading(true);
    setSpotifyLookupError("");
    try {
      const spotifyGenerator: GameGeneratorSettings = {
        id: "spotify-generator",
        label: "Spotify-Generator",
        type: "spotify-generator",
        seed: spotifySeed,
        connectorId: spotifyConnector.id,
        generatedCount: spotifyGeneratedCount,
        exhausted: spotifyExhausted,
      };
      const generated = await generateEntriesForGenerator(spotifyGenerator, initialSpotifyCardCount, {
        accessToken: spotifyConnector.auth.accessToken,
        excludeIds: spotifyEntries.map((entry) => entry.id),
      });
      const existingIds = new Set(spotifyEntries.map((entry) => entry.id));
      const freshEntries = generated.entries.filter((entry) => !existingIds.has(entry.id));
      setSpotifyEntries((current) => [...current, ...freshEntries]);
      setSpotifyGeneratedCount(generated.nextIndex);
      setSpotifyExhausted(Boolean(generated.exhausted));
      return {
        entries: [...spotifyEntries, ...freshEntries],
        generatedCount: generated.nextIndex,
        exhausted: Boolean(generated.exhausted),
      };
    } catch (error) {
      setSpotifyLookupError(error instanceof Error ? error.message : "Spotify Karten konnten nicht vorgeladen werden.");
      return undefined;
    } finally {
      if (showInlineLoading) setSpotifyPreloadLoading(false);
    }
  };

  const preloadSpotifyBatch = () => {
    void loadSpotifyBatch(true);
  };

  const connectSpotifyFromSeed = async () => {
    if (spotifyConnector) return;
    setSpotifyLookupError("");
    try {
      await startSpotifyAuthorization();
    } catch (error) {
      setSpotifyLookupError(error instanceof Error ? error.message : "Spotify Verbindung konnte nicht gestartet werden.");
    }
  };

  const updateCustomSetup = (patch: Partial<CustomSetupState>) => {
    setCustomSetup((current) => {
      const next = { ...current, ...patch };
      if (patch.rawText !== undefined || patch.delimiter !== undefined || patch.hasHeader !== undefined || patch.mapping !== undefined) {
        return buildCustomEntries(next);
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
      .then((rawText) => updateCustomSetup({ rawText }))
      .catch(() => setCustomLoadError("Datei konnte nicht gelesen werden."));
  };

  useEffect(() => {
    if (!spotifyConnector?.auth) return;
    if (mode !== "spotify-generator") return;
    const query = spotifyQuery.trim();
    if (query.length < 2) {
      setSpotifyResults([]);
      return;
    }

    let cancelled = false;
    setSpotifyLookupError("");
    setSpotifyLookupLoading(true);
    const timeout = window.setTimeout(() => {
      const lookup = query.includes("open.spotify.com/") || query.startsWith("spotify:")
        ? getSpotifySeedPreview(spotifyConnector.auth!.accessToken, query).then((preview) => [preview])
        : searchSpotifySeeds(spotifyConnector.auth!.accessToken, query);

      lookup
        .then((results) => {
          if (!cancelled) setSpotifyResults(results);
        })
        .catch((error) => {
          if (!cancelled) {
            setSpotifyResults([]);
            setSpotifyLookupError(error instanceof Error ? error.message : "Spotify Suche fehlgeschlagen.");
          }
        })
        .finally(() => {
          if (!cancelled) setSpotifyLookupLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [mode, spotifyConnector?.auth, spotifyQuery]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (requiredConnectorMissing || requiredSeedMissing || requiredReplayMissing || requiredCustomMissing) return;
    setGameStartLoading(true);
    setSpotifyLookupError("");
    setAutoquartettLoadError("");
    try {
      const spotifyPool =
        mode === "spotify-generator" && spotifyEntries.length === 0
          ? await loadSpotifyBatch(false)
          : {
              entries: spotifyEntries,
              generatedCount: spotifyGeneratedCount,
              exhausted: spotifyExhausted,
            };
      if (mode === "spotify-generator" && (!spotifyPool || spotifyPool.entries.length === 0)) return;
      const autoquartettEntries =
        mode === "autoquartett"
          ? await loadWikidataAutoquartettEntries(80).catch((error) => {
              setAutoquartettLoadError(
                error instanceof Error
                  ? `${error.message} Lokale Beispielkarten werden verwendet.`
                  : "Wikidata konnte nicht geladen werden. Lokale Beispielkarten werden verwendet.",
              );
              return undefined;
            })
          : undefined;
      const activeGame = createGame({
        gameName,
        mode,
        players: normalizedPlayers,
        spotifySeed,
        replayEntries,
        replayHistoryId,
        replaySettings: selectedReplay?.settings,
        customEntries: customSetup.entries,
        customSettings: createCustomGameSettings(customSetup),
        autoquartettEntries,
        spotifyEntries: spotifyPool?.entries,
        spotifyGeneratedCount: spotifyPool?.generatedCount,
        spotifyExhausted: spotifyPool?.exhausted,
        stopCondition: createStopCondition(stopType, stopValue),
        spotifyConnectorId: spotifyConnector?.id ?? "",
      });
      setState((current) => ({ ...current, activeGame }));
      navigate({ to: "/game" });
    } catch (error) {
      setSpotifyLookupError(error instanceof Error ? error.message : "Spotify Karten konnten nicht geladen werden.");
    } finally {
      setGameStartLoading(false);
    }
  };

  return (
    <section className="setup-grid">
      <form className="panel setup-panel" onSubmit={submit}>
        <div className="section-heading">
          <label className="field game-name-field">
            <input value={gameName} onChange={(event) => setGameName(event.target.value)} />
          </label>
        </div>

        <section className="setup-section">
          <div className="section-heading compact">
            <p>Teams</p>
            <h2>Wer tritt an?</h2>
          </div>
          <div className="player-editor">
            {normalizedPlayers.map((player, index) => (
              <article className="player-card" key={index} style={{ "--player-color": player.color } as React.CSSProperties}>
                <div className="player-card-top">
                  <span>Team {index + 1}</span>
                  <button type="button" disabled={normalizedPlayers.length <= 2} onClick={() => removePlayer(index)}>
                    ×
                  </button>
                </div>
                <input
                  aria-label={`Name Team ${index + 1}`}
                  value={player.name}
                  onChange={(event) => updatePlayer(index, { name: event.target.value })}
                />
                <input
                  aria-label={`Farbe Team ${index + 1}`}
                  className="player-color-input"
                  type="color"
                  value={player.color}
                  onChange={(event) => updatePlayer(index, { color: event.target.value })}
                />
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
          <div className="mode-grid" role="radiogroup" aria-label="Spielmodus">
            {(Object.keys(modeLabels) as GameMode[]).map((entry) => (
              <button
                className={mode === entry ? "mode-card active" : "mode-card"}
                key={entry}
                type="button"
                onClick={() => setMode(entry)}
              >
                <strong>{modeLabels[entry]}</strong>
                <span>{modeDescriptions[entry]}</span>
              </button>
            ))}
          </div>

          {mode === "spotify-generator" ? (
            <div className="spotify-tools">
              <label className="field">
                Spotify Seed
                <div className={spotifyConnector ? "spotify-seed-input" : "spotify-seed-input disabled"}>
                  <button
                    aria-label={spotifyConnector ? "Spotify verbunden" : "Mit Spotify verbinden"}
                    className="spotify-prefix-button"
                    disabled={Boolean(spotifyConnector)}
                    onClick={connectSpotifyFromSeed}
                    type="button"
                  >
                    <SpotifyIcon />
                  </button>
                  <input
                    disabled={!spotifyConnector}
                    placeholder={
                      spotifyConnector
                        ? "Song, Playlist, Artist oder Spotify-Link suchen"
                        : "Spotify verbinden, um Seeds zu suchen"
                    }
                    value={spotifyQuery}
                    onChange={(event) => {
                      setSpotifyQuery(event.target.value);
                      setSpotifyPreview(undefined);
                      setSpotifySeed("");
                      clearSpotifyPreload();
                    }}
                  />
                </div>
              </label>
              {spotifyLookupError ? <p className="form-error">{spotifyLookupError}</p> : null}
              {spotifyPreview ? (
                <div className="spotify-seed-selection">
                  <SpotifySeedCard preview={spotifyPreview} />
                  <button
                    className="ghost-button seed-clear-button"
                    type="button"
                    onClick={() => {
                      setSpotifyPreview(undefined);
                      setSpotifySeed("");
                      setSpotifyQuery("");
                      setSpotifyResults([]);
                      clearSpotifyPreload();
                    }}
                  >
                    <X size={15} />
                    Abwählen
                  </button>
                  <div className="spotify-preload-row">
                    <span>
                      {spotifyEntries.length} Karten vorgeladen{spotifyExhausted ? " · Quelle ausgeschöpft" : ""}
                    </span>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={spotifyPreloadLoading || !spotifyConnector || spotifyExhausted}
                      onClick={preloadSpotifyBatch}
                    >
                      <Download size={15} />
                      {spotifyPreloadLoading ? "Lädt..." : "Batch nachladen"}
                    </button>
                  </div>
                </div>
              ) : null}
              {spotifyResults.length > 0 ? (
                <div className="spotify-live-results">
                  {spotifyResults.map((result) => (
                    <button
                      className="spotify-result"
                      key={`${result.type}-${result.id}`}
                      type="button"
                      onClick={() => {
                        setSpotifyPreview(result);
                        setSpotifySeed(result.externalUrl);
                        setSpotifyQuery("");
                        setSpotifyResults([]);
                        clearSpotifyPreload();
                      }}
                    >
                      <SpotifySeedCard preview={result} compact />
                    </button>
                  ))}
                </div>
              ) : spotifyLookupLoading ? <p className="muted">Suche läuft...</p> : null}
            </div>
          ) : null}
          {mode === "custom" ? (
            <div className="custom-tools">
              <div className="custom-source-grid">
                <label className="field">
                  Datei hochladen
                  <input accept=".csv,.tsv,.txt" type="file" onChange={(event) => loadCustomFile(event.target.files?.[0])} />
                </label>
                <label className="field">
                  URL
                  <input
                    placeholder="https://..."
                    value={customSetup.sourceUrl}
                    onChange={(event) => updateCustomSetup({ sourceUrl: event.target.value })}
                  />
                </label>
                <button className="secondary-button custom-load-button" type="button" onClick={loadCustomUrl} disabled={customUrlLoading}>
                  <LinkIcon size={15} />
                  {customUrlLoading ? "Lädt..." : "URL laden"}
                </button>
              </div>
              {customLoadError ? <p className="form-error">{customLoadError}</p> : null}
              <div className="custom-options-grid">
                <label className="field">
                  Trennzeichen
                  <select value={customSetup.delimiter} onChange={(event) => updateCustomSetup({ delimiter: event.target.value })}>
                    <option value="auto">Auto</option>
                    <option value=",">Komma</option>
                    <option value=";">Semikolon</option>
                    <option value="\t">Tab</option>
                  </select>
                </label>
                <label className="check-field">
                  <input
                    checked={customSetup.hasHeader}
                    type="checkbox"
                    onChange={(event) => updateCustomSetup({ hasHeader: event.target.checked })}
                  />
                  Erste Zeile ist Header
                </label>
              </div>
              {customSetup.columns.length > 0 ? (
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
                  <label className="check-field">
                    <input
                      checked={customSetup.extraArtistGuess}
                      type="checkbox"
                      onChange={(event) => updateCustomSetup({ extraArtistGuess: event.target.checked })}
                    />
                    Artist als Extra-Guess
                  </label>
                </div>
              ) : null}
              {customSetup.rawText ? (
                <p className="muted">
                  {customSetup.entries.length} Karten aus {Math.max(0, parseCsv(customSetup.rawText, resolveDelimiter(customSetup.rawText, customSetup.delimiter)).length - (customSetup.hasHeader ? 1 : 0))} Zeilen erzeugt.
                </p>
              ) : null}
            </div>
          ) : null}
          {mode === "replay" ? (
            <label className="field">
              Historie
              <select value={replayHistoryId} onChange={(event) => setReplayHistoryId(event.target.value)}>
                <option value="">Replay auswählen</option>
                {state.history
                  .filter((entry) => (entry.replayEntries?.length ?? 0) > 0)
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name} - {new Date(entry.finishedAt).toLocaleString("de-DE")} ({entry.replayEntries?.length ?? 0})
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
        </section>

        <section className="setup-section">
          <div className="section-heading compact">
            <p>Sieg</p>
            <h2>Wann endet das Spiel?</h2>
          </div>
          <div className="stop-config">
          <div className="mode-grid" role="radiogroup" aria-label="Spielende">
            {stopConditionOptions.map((option) => (
              <button
                className={stopType === option.type ? "mode-card compact active" : "mode-card compact"}
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
            {stopConditionOptions.find((option) => option.type === stopType)?.valueLabel}
            <input
              type="number"
              min={1}
              max={stopType === "maxRounds" ? 100 : 30}
              value={stopValue}
              onChange={(event) => setStopValue(Number(event.target.value))}
            />
          </label>
          </div>
        </section>

        <section className="setup-section start-section">
          <Accordion.Root collapsible type="single">
            <Accordion.Item
              className={requiredConnectorMissing ? "connector-accordion missing" : "connector-accordion"}
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
                    <b className={spotifyConnector ? "ok" : "missing"}>{spotifyConnector ? "verbunden" : "fehlt"}</b>
                  </div>
                  <Link className="secondary-button" to="/settings">
                    <Settings size={15} />
                    Settings öffnen
                  </Link>
                </div>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion.Root>

          {requiredSeedMissing ? <p className="form-error">Spotify Seed aus der Suche auswählen.</p> : null}
          {autoquartettLoadError ? <p className="form-error">{autoquartettLoadError}</p> : null}
          {requiredReplayMissing ? <p className="form-error">Replay aus der Historie auswählen.</p> : null}
          {requiredCustomMissing ? <p className="form-error">Custom-Datei laden und Mapping auswählen.</p> : null}
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
            {gameStartLoading ? "Karten laden..." : `Spiel starten (${availableCardsLabel})`}
          </button>
        </section>
      </form>
    </section>
  );
}

function GamePage() {
  const state = useAppState();
  const navigate = useNavigate();
  const spotifyConnector = getConfiguredSpotifyConnector(state);
  const [entryLoadError, setEntryLoadError] = useState("");
  const [entryLoading, setEntryLoading] = useState(false);
  const [connectorError, setConnectorError] = useState("");
  const [connectorConnecting, setConnectorConnecting] = useState(false);
  const [playbackPaused, setPlaybackPaused] = useState(false);
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
  }, [activePlaybackEntry?.id]);

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
  const ditherColor = getDitherWaveColor(activePlayer.color);
  const playbackActive =
    Boolean(activeEntry) &&
    isAudioCardMode(game.settings.mode) &&
    ["place-card", "challenge", "round-result"].includes(game.phase);
  const requiredConnectorMissing = game.generator.type === "spotify-generator" && !spotifyConnector?.auth?.accessToken;

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
      <div className="active-game-background" aria-hidden="true">
        <Suspense fallback={null}>
          <Dither
            waveColor={ditherColor}
            disableAnimation={false}
            enableMouseInteraction
            mouseRadius={1}
            colorNum={4}
            pixelSize={2}
            waveAmplitude={0.3}
            waveFrequency={3}
            waveSpeed={0.05}
          />
        </Suspense>
      </div>
      <div className="play-panel">
        <div className="round-header">
          <div>
            <p>Runde {game.roundNumber}</p>
            <h1 style={{ color: activePlayer.color }}>
              {activePlayer.name} - {phaseLabel(game.phase)}
            </h1>
          </div>
        </div>

        {game.phase === "pick-card" ? (
          <PickCard
            game={game}
            loading={entryLoading}
            error={entryLoadError}
            onPick={(entryId) => updateGame(chooseEntry(startRound(game), entryId))}
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
            onTogglePause={() => setPlaybackPaused((current) => !current)}
            onSubmit={(index, values) => updateGame(submitExtraGuesses(submitPlacement(game, index), values))}
          />
        ) : null}

        {game.phase === "extra-guesses" ? (
          <ExtraGuesses game={game} onSubmit={(values) => updateGame(submitExtraGuesses(game, values))} />
        ) : null}

        {game.phase === "challenge" ? (
          <Challenge game={game} onResolve={(claims) => updateGame(resolveRound(game, claims))} />
        ) : null}

        {game.phase === "round-result" ? (
          <RoundResultView
            game={game}
            paused={playbackPaused}
            onTogglePause={() => setPlaybackPaused((current) => !current)}
            onNext={() => updateGame(nextRound(game))}
          />
        ) : null}

        {game.phase === "finished" ? (
          <FinishedGame
            game={game}
            onArchive={() => {
              setState(archiveFinishedGame);
              navigate({ to: "/history" });
            }}
          />
        ) : null}
      </div>
    </section>
  );
}

function SpotifySeedCard({
  compact = false,
  preview,
}: {
  compact?: boolean;
  preview: SpotifySeedPreview;
}) {
  return (
    <article className={compact ? "spotify-seed-card compact" : "spotify-seed-card"}>
      {preview.imageUrl ? <img src={preview.imageUrl} alt="" /> : <div className="cover-placeholder" />}
      <div>
        <strong>{preview.title}</strong>
        <span>{preview.subtitle}</span>
      </div>
      <b>{preview.strategy}</b>
    </article>
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
          <span className="score-chip-value">{player.points}</span>
          <span className="score-chip-dots" aria-label={`${player.extraPoints} Korrekturpunkte`}>
            {Array.from({ length: 3 }, (_, index) => (
              <i
                className={index < player.extraPoints ? "score-chip-dot active" : "score-chip-dot"}
                key={index}
                style={{ "--dot-angle": `${index * 120}deg` } as React.CSSProperties}
              />
            ))}
          </span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" className="player-dropdown" sideOffset={8}>
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
      </DropdownMenu.Portal>
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
        {availableEntries.slice(0, 3).map((entry) =>
          songCards ? (
            <motion.button
              animate={{
                opacity: selectedEntryId && selectedEntryId !== entry.id ? 0 : 1,
                scale: selectedEntryId === entry.id ? 1.08 : 1,
                width: selectedEntryId && selectedEntryId !== entry.id ? 0 : "min(260px, 72vw)",
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
              <PlayCard entry={entry} mode={game.settings.mode} orderKey={game.settings.orderSelector.key} paused revealed={false} />
            </motion.button>
          ) : (
            <motion.button
              animate={{
                marginLeft: selectedEntryId && selectedEntryId !== entry.id ? 0 : 0,
                marginRight: selectedEntryId && selectedEntryId !== entry.id ? 0 : 0,
                opacity: selectedEntryId && selectedEntryId !== entry.id ? 0 : 1,
                scale: selectedEntryId === entry.id ? 1.08 : 1,
                width: selectedEntryId && selectedEntryId !== entry.id ? 0 : "min(170px, 42vw)",
              }}
              className={[
                "play-card card-back",
                selectedEntryId === entry.id ? "is-selected" : "",
                selectedEntryId && selectedEntryId !== entry.id ? "is-faded" : "",
              ].filter(Boolean).join(" ")}
              disabled={Boolean(selectedEntryId)}
              key={entry.id}
              layout
              onClick={() => pickEntry(entry.id)}
              transition={{ duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
            >
              <span>?</span>
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

    return (
      <div className="flow">
        <div className="card-backs">
          {availableEntries.slice(0, 3).map((candidate) =>
            songCards ? (
              <button className="song-card-picker" key={candidate.id} onClick={() => onPick(candidate.id)}>
                <PlayCard entry={candidate} mode={game.settings.mode} orderKey={game.settings.orderSelector.key} paused revealed={false} />
              </button>
            ) : (
              <button className="play-card card-back" key={candidate.id} onClick={() => onPick(candidate.id)}>
                <span>?</span>
              </button>
            ),
          )}
        </div>
        <TimelinePreview game={game} player={getActivePlayer(game)} />
      </div>
    );
  }

  return (
    <div className="flow">
      <AudioPresentation entry={entry} />
    </div>
  );
}

function SortAndGuess({
  game,
  entry,
  onTogglePause,
  player,
  paused,
  onSubmit,
}: {
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
  const [guessDialogOpen, setGuessDialogOpen] = useState(false);
  useEffect(() => {
    if (player.timeline.length > 0 || proposedIndex !== undefined) return;
    setProposedIndex(0);
    setGuessDialogOpen(true);
  }, [player.timeline.length, proposedIndex]);

  const handleDragEnd = (event: DragEndEvent) => {
    const overId = String(event.over?.id ?? "");
    if (!overId.startsWith("slot-")) return;
    selectPlacement(Number(overId.replace("slot-", "")));
  };

  const selectPlacement = (index: number) => {
    setProposedIndex(index);
    setGuessDialogOpen(true);
  };

  const resetPlacement = () => {
    setGuessDialogOpen(false);
    setProposedIndex(undefined);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (proposedIndex === undefined) return;
    onSubmit(proposedIndex, values);
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
                mode={game.settings.mode}
                orderKey={key}
                paused={paused}
                onTogglePause={onTogglePause}
              />
            ) : null}
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
                    mode={game.settings.mode}
                    orderKey={key}
                    paused={paused}
                    placed
                    onTogglePause={onTogglePause}
                  />
                ) : null}
                {player.timeline[index] ? (
                  <TimelineCard entry={player.timeline[index]} mode={game.settings.mode} orderKey={key} />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </DndContext>
      <Dialog.Root open={guessDialogOpen} onOpenChange={(open) => (open ? setGuessDialogOpen(true) : resetPlacement())}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content extra-guess-dialog" onOpenAutoFocus={(event) => event.preventDefault()}>
            <div className="dialog-header">
              <Dialog.Title>Extra Guesses</Dialog.Title>
              <Dialog.Description>Karte wurde einsortiert. Trage die Zusatz-Tipps ein und logge den Guess ein.</Dialog.Description>
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
              <button className="secondary-button" type="button" onClick={resetPlacement}>
                Weiter einsortieren
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  if (proposedIndex !== undefined) onSubmit(proposedIndex, values);
                }}
              >
                <Check size={16} />
                Guess einloggen
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </form>
  );
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
        if (!cancelled) await playSpotifyTrack(accessToken, deviceId, spotifyUri);
      } catch {
        // The visible fallback/error handling stays minimal during the hidden playback phase.
      }
    };

    void syncPlayback();

    return () => {
      cancelled = true;
      void pauseSpotifyPlayback(accessToken).catch(() => undefined);
    };
  }, [accessToken, paused, spotifyUri]);

  useEffect(() => {
    if (spotifyUri && accessToken) return;
    const element = audioRef.current;
    if (!element) return;
    if (paused) {
      element.pause();
      return;
    }
    element.play().catch(() => undefined);
  }, [audioRef, paused, spotifyUri]);

  if (spotifyUri && accessToken) return null;
  if (!isAudioValue(audio)) return null;

  return <audio ref={audioRef} src={audio.url} autoPlay loop preload="auto" />;
}

function DraggableGuessCard({
  entry,
  mode,
  orderKey,
  paused,
  placed = false,
  onTogglePause,
}: {
  entry: GuessEntry;
  mode: GameMode;
  orderKey: string;
  paused: boolean;
  placed?: boolean;
  onTogglePause: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: "active-guess-card",
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      className={[placed ? "sort-card placed" : "sort-card", isDragging ? "dragging" : ""].filter(Boolean).join(" ")}
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
    >
      {isAudioCardMode(mode) ? (
        <PlayCard
          entry={entry}
          mode={mode}
          onTogglePause={onTogglePause}
          orderKey={orderKey}
          paused={paused}
          revealed={false}
        />
      ) : (
        <PlayCard entry={entry} mode={mode} orderKey={orderKey} />
      )}
    </div>
  );
}

function PlayCard({
  animateReveal = false,
  children,
  entry,
  mode,
  onTogglePause,
  orderKey,
  paused = false,
  revealed = true,
}: {
  animateReveal?: boolean;
  children?: React.ReactNode;
  entry: GuessEntry;
  mode: GameMode;
  onTogglePause?: () => void;
  orderKey: string;
  paused?: boolean;
  revealed?: boolean;
}) {
  const image = revealed ? getEntryImage(entry) : undefined;
  const primary = !revealed
    ? isAudioCardMode(mode)
      ? "Audio-Karte"
      : "Verdeckte Karte"
    : mode === "autoquartett"
      ? String(entry.name ?? entry.title)
      : String(entry.title ?? "Verdeckte Karte");
  const secondary = revealed ? (mode === "image-art" ? String(entry.artist ?? "Künstler raten") : String(entry.artist ?? "")) : "";
  const value = revealed ? entry[orderKey] : undefined;
  const isSongCard = isAudioCardMode(mode);
  const songImage = isSongCard ? getEntryImage(entry) : undefined;
  const orbColor = useCoverAccentColor(songImage?.url, `${entry.title ?? ""}${entry.artist ?? ""}${entry.id}`);

  if (isSongCard) {
    const year = entry[orderKey];
    const targetRotation = revealed ? 180 : 0;

    return (
      <motion.div
        className="play-card song-card"
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
            <button
              className={paused ? "song-orb" : "song-orb playing"}
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
              {paused ? <Play size={32} fill="currentColor" /> : <Pause size={32} fill="currentColor" />}
            </button>
            <div>
            </div>
            {children}
          </div>
          <div className="song-card-face song-card-front">
            {songImage ? <img src={songImage.url} alt={songImage.alt ?? ""} /> : <div className="song-card-cover-placeholder" />}
            {onTogglePause ? (
              <button
                className={paused ? "song-orb song-orb-overlay" : "song-orb song-orb-overlay playing"}
                type="button"
                aria-label={paused ? "Audio abspielen" : "Audio pausieren"}
                onClick={(event) => {
                  event.stopPropagation();
                  onTogglePause();
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {paused ? <Play size={30} fill="currentColor" /> : <Pause size={30} fill="currentColor" />}
              </button>
            ) : null}
            <div className="song-card-info">
              <div>
                <strong>{String(entry.title ?? "Unbekannter Song")}</strong>
                <span>{String(entry.artist ?? "")}</span>
              </div>
              {year !== undefined ? <b>{String(year)}</b> : null}
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="play-card"
      whileHover={{ rotateX: 4, rotateY: -5, y: -2 }}
      transition={{ type: "spring", stiffness: 150, damping: 25 }}
    >
      {image ? <img src={image.url} alt={image.alt ?? ""} /> : null}
      <div className="play-card-shade" />
      <div className="play-card-content">
        <div>
          <strong>{primary}</strong>
          {secondary ? <span>{secondary}</span> : null}
        </div>
        {value !== undefined ? <b>{String(value)}</b> : null}
        {children}
      </div>
    </motion.div>
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

function Challenge({ game, onResolve }: { game: Game; onResolve: (claims?: RoundCorrectionClaim[]) => void }) {
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
          <button className="primary-button" type="button" onClick={() => onResolve(claims)}>
            {claims.length > 0 ? <RotateCcw size={16} /> : <Check size={16} />}
            {claims.length > 0 ? "Korrekturen pruefen" : "Keine Korrektur"}
          </button>
        </div>
      </div>
      <CorrectionTimeline
        activeEntry={activeEntry}
        claims={claims}
        game={game}
        insertIndex={proposedIndex}
        onSelectGap={setSelectedCorrectionIndex}
        player={activePlayer}
      />
      <Dialog.Root open={selectedCorrectionIndex !== undefined} onOpenChange={(open) => !open && setSelectedCorrectionIndex(undefined)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content challenge-dialog"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <div className="dialog-header">
              <Dialog.Title>Korrektur anmelden</Dialog.Title>
              <Dialog.Description>
                Wähle das Team, das die Karte an dieser Luecke einsortieren wuerde.
              </Dialog.Description>
            </div>
            <div className="challenge-list">
              {game.players.map((player, index) => (
                <button
                  type="button"
                  className="challenge-team-card"
                  disabled={!canChallenge(game, player) || (claimedPlayerIds.has(player.id) && player.id !== claimForSelectedIndex?.playerId)}
                  key={player.id}
                  onClick={() => selectClaimTeam(player.id)}
                  style={{ "--player-color": player.color } as React.CSSProperties}
                >
                  <div className="player-card-top">
                    <span>Team {index + 1}</span>
                    <RotateCcw size={18} />
                  </div>
                  <strong>{player.name}</strong>
                  <div className="challenge-team-meta">
                    <div className="coin-row" aria-label={`${player.extraPoints} Korrekturpunkte`}>
                      {Array.from({ length: 3 }, (_, coinIndex) => (
                        <i className={coinIndex < player.extraPoints ? "coin active" : "coin"} key={coinIndex} />
                      ))}
                    </div>
                    <small>Korrigiert</small>
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
                    setClaims((current) => current.filter((claim) => claim.proposedIndex !== selectedCorrectionIndex));
                    setSelectedCorrectionIndex(undefined);
                  }}
                >
                  Entfernen
                </button>
              ) : null}
              <button className="secondary-button" type="button" onClick={() => setSelectedCorrectionIndex(undefined)}>
                Abbrechen
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function CorrectionTimeline({
  activeEntry,
  claims,
  game,
  insertIndex,
  onSelectGap,
  player,
}: {
  activeEntry?: GuessEntry;
  claims: RoundCorrectionClaim[];
  game: Game;
  insertIndex?: number;
  onSelectGap: (index: number) => void;
  player: Player;
}) {
  const orderKey = game.settings.orderSelector.key;
  const timeline = getTimelinePreviewEntries(player.timeline, activeEntry, insertIndex);
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
                    animate={{ marginLeft: 9, marginRight: 9, opacity: 1, width: claimPlayer ? 42 : 26 }}
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
                    {claimPlayer ? claimPlayer.name.slice(0, 2).toUpperCase() : "+"}
                  </motion.button>
                )}
              </AnimatePresence>
              {timeline[index] ? (
                <TimelineCard
                  entry={timeline[index]}
                  inserted={activeEntry?.id === timeline[index].id}
                  mode={game.settings.mode}
                  orderKey={orderKey}
                  revealed={activeEntry?.id !== timeline[index].id}
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
  game,
  onTogglePause,
  onNext,
  paused,
}: {
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
  useFooterActions([
    {
      key: "next-round",
      label: "Nächste Runde",
      icon: <Play size={16} fill="currentColor" />,
      variant: "primary",
      onClick: onNext,
    },
  ]);

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
            <p>{awardedPlayer ? `Karte für ${awardedPlayer.name}` : "Keine Karte vergeben"}</p>
            <h2>{result?.activePlayerCorrect ? "Richtig" : "Falsch"}</h2>
          </div>
          {result?.message ? <p>{result.message}</p> : null}
        </motion.div>
      </div>
      <TimelinePreview
        game={game}
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

function TimelinePreview({
  entry,
  game,
  insertIndex,
  insertedState,
  onTogglePause,
  paused,
  player,
  revealInserted = false,
}: {
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
              entry={item}
              inserted={entry?.id === item.id}
              insertedState={entry?.id === item.id ? insertedState : undefined}
              key={item.id}
              mode={game.settings.mode}
              onTogglePause={entry?.id === item.id ? onTogglePause : undefined}
              orderKey={orderKey}
              paused={entry?.id === item.id ? paused : undefined}
              revealed={entry?.id !== item.id || revealInserted}
              animateReveal={entry?.id === item.id && revealInserted}
            />
          ))
        )}
      </div>
    </div>
  );
}

function FinishedGame({ game, onArchive }: { game: Game; onArchive: () => void }) {
  const topScore = Math.max(...game.players.map((player) => player.points));
  const winners = game.players.filter((player) => player.points === topScore);
  useFooterActions([
    {
      key: "archive-game",
      label: "In Historie ablegen",
      icon: <Upload size={16} />,
      variant: "primary",
      onClick: onArchive,
    },
  ]);

  return (
    <div className="flow">
      <div className="result-box">
        <h1>Spiel beendet</h1>
        <p>Gewinner: {winners.map((winner) => winner.name).join(", ")}</p>
      </div>
    </div>
  );
}

function HistoryPage() {
  const state = useAppState();

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

function SettingsPage() {
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
    <section className="panel connectors-panel">
      <div className="section-heading">
        <p>{translate("settings.eyebrow")}</p>
        <h1>{translate("settings.title")}</h1>
      </div>
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
      <div className="connector-list">
        <form className="connector-card" onSubmit={connectSpotify}>
          <div>
            <h2>Spotify</h2>
            <p>
              {configuredSpotifyConnector
                ? `${translate("settings.spotifyConnected")}${spotifyConnector?.account?.displayName ? ` ${translate("settings.as")} ${spotifyConnector.account.displayName}` : ""}.`
                : translate("settings.spotifyRequired")}
            </p>
          </div>
          <span className={configuredSpotifyConnector ? "status-dot configured" : "status-dot"}>
            {configuredSpotifyConnector ? translate("settings.active") : translate("settings.open")}
          </span>
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
    </section>
  );
}

function SpotifyCallbackPage() {
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
      .then((connector) => {
        setState((current) => ({
          ...current,
          connectors: [
            connector,
            ...current.connectors.filter((entry) => entry.kind !== "spotify"),
          ],
        }));
        setMessage("Spotify ist verbunden.");
        navigate({ to: "/settings", replace: true });
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

  return (
    <article className={compact ? "audio-presentation compact" : "audio-presentation"}>
      <div className="audio-mark" aria-hidden="true">
        Audio
      </div>
      {isAudioValue(audio) ? (
        <audio controls preload="none" src={audio.url} aria-label="Audio der gezogenen Karte" />
      ) : (
        <p className="muted">Keine Audioquelle für diese Karte vorhanden.</p>
      )}
    </article>
  );
}

function TimelineCard({
  entry,
  inserted = false,
  insertedState,
  mode,
  onTogglePause,
  orderKey,
  paused,
  revealed = true,
  animateReveal = false,
}: {
  animateReveal?: boolean;
  entry: GuessEntry;
  inserted?: boolean;
  insertedState?: "correct" | "wrong";
  mode: GameMode;
  onTogglePause?: () => void;
  orderKey: string;
  paused?: boolean;
  revealed?: boolean;
}) {
  return (
    <div className={["timeline-card", inserted ? "inserted" : "", insertedState ? insertedState : ""].filter(Boolean).join(" ")}>
      <PlayCard
        animateReveal={animateReveal}
        entry={entry}
        mode={mode}
        onTogglePause={onTogglePause}
        orderKey={orderKey}
        paused={Boolean(paused)}
        revealed={revealed}
      />
    </div>
  );
}

function CoverImage({ entry }: { entry: GuessEntry }) {
  const cover = getEntryImage(entry);

  return isImageValue(cover) ? (
    <img src={cover.url} alt={cover.alt ?? ""} />
  ) : (
    <div className="cover-placeholder" />
  );
}

const getEntryImage = (entry: GuessEntry) => {
  const image = entry.image ?? entry.albumCover;
  return isImageValue(image) ? image : undefined;
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

const isExtraGuessCorrect = (type: string, value: string, expected: string) => {
  if (!value) return false;
  if (type === "number") return Number(value) === Number(expected);
  const normalizedValue = value.trim().toLocaleLowerCase();
  const normalizedExpected = expected.trim().toLocaleLowerCase();
  if (type === "text-exact") return normalizedValue === normalizedExpected;
  return normalizedExpected.includes(normalizedValue) || normalizedValue.includes(normalizedExpected);
};

type OklchColor = {
  mode: "oklch";
  l: number;
  c: number;
  h?: number;
};

const toOklch = converter("oklch") as (color: string) => OklchColor | undefined;
const toRgb = converter("rgb") as (color: string) => { r: number; g: number; b: number } | undefined;

const modeLabels: Record<GameMode, string> = {
  "spotify-generator": "Spotify-Generator",
  "image-art": "Bild-Künstler",
  autoquartett: "Autoquartett",
  replay: "Replay",
  custom: "Custom",
};

const modeDescriptions: Record<GameMode, string> = {
  "spotify-generator": "Song hören, Jahr einordnen, Titel und Künstler raten.",
  "image-art": "Bild sehen, Jahr einsortieren und Künstler raten.",
  autoquartett: "Auto sehen, PS einsortieren, Baujahr danach auflösen.",
  replay: "Karten aus einem archivierten Spiel erneut spielen.",
  custom: "Eigene CSV-Datei laden und Spalten auf Karten mappen.",
};

const initialSpotifyCardCount = 40;

const staticModeCardCounts: Record<Exclude<GameMode, "spotify-generator">, number> = {
  "image-art": 5,
  autoquartett: 5,
  replay: 0,
  custom: 0,
};

const getAvailableCardsLabel = (mode: GameMode, spotifyCount = 0, replayCount = 0, customCount = 0) => {
  if (mode === "replay") return String(replayCount);
  if (mode === "custom") return String(customCount);
  if (mode !== "spotify-generator") return String(staticModeCardCounts[mode]);
  return `${spotifyCount}+`;
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

const createDefaultCustomSetup = (): CustomSetupState => ({
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

const buildCustomEntries = (setup: CustomSetupState): CustomSetupState => {
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

const resolveDelimiter = (rawText: string, delimiter: string) => {
  if (delimiter !== "auto") return delimiter;
  const firstLine = rawText.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];
  return candidates
    .map((candidate) => ({ candidate, count: firstLine.split(candidate).length }))
    .sort((left, right) => right.count - left.count)[0]?.candidate ?? ",";
};

const parseCsv = (rawText: string, delimiter: string) => {
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

const parseCustomNumber = (value: string | undefined) => {
  const normalized = value?.trim().replace(",", ".").match(/-?\d+(\.\d+)?/)?.[0];
  if (!normalized) return undefined;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
};

const createCustomGameSettings = (setup: CustomSetupState): GameSettings => ({
  name: "Custom",
  mode: "custom",
  stopCondition: { type: "maxPoints", points: 10 },
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

const getGameBackgroundStyle = (color: string): React.CSSProperties => {
  const base = toOklch(color) ?? { mode: "oklch", l: 0.72, c: 0.12, h: 30 };
  const soft = formatHex({
    mode: "oklch",
    l: Math.min(0.95, base.l + 0.16),
    c: Math.max(0.03, base.c * 0.42),
    h: base.h,
  });
  const vivid = formatHex({
    mode: "oklch",
    l: Math.max(0.54, base.l - 0.04),
    c: Math.min(0.22, base.c * 1.2),
    h: base.h,
  });
  const deep = formatHex({
    mode: "oklch",
    l: 0.24,
    c: Math.max(0.04, base.c * 0.5),
    h: base.h,
  });

  return {
    backgroundColor: soft,
    backgroundImage: `
      radial-gradient(circle at 18% 16%, ${vivid}66 0, transparent 34%),
      radial-gradient(circle at 88% 12%, ${deep}33 0, transparent 28%),
      linear-gradient(135deg, ${soft} 0%, #fffdfa 48%, ${vivid}28 100%)
    `,
  };
};

const getDitherWaveColor = (color: string): [number, number, number] => {
  const rgb = toRgb(color);
  if (!rgb) return [0.32, 0.15, 1];

  const maxChannel = Math.max(rgb.r, rgb.g, rgb.b, 0.001);
  return [
    Math.min(1, Math.max(0.08, (rgb.r / maxChannel) * 0.92)),
    Math.min(1, Math.max(0.08, (rgb.g / maxChannel) * 0.92)),
    Math.min(1, Math.max(0.08, (rgb.b / maxChannel) * 0.92)),
  ];
};

const getTimelinePreviewEntries = (timeline: GuessEntry[], entry?: GuessEntry, insertIndex?: number) => {
  if (!entry || insertIndex === undefined) return timeline;

  const withoutEntry = timeline.filter((item) => item.id !== entry.id);
  const index = Math.min(insertIndex, withoutEntry.length);
  return [...withoutEntry.slice(0, index), entry, ...withoutEntry.slice(index)];
};

const phaseLabel = (phase: Game["phase"]) =>
  ({
    "pick-card": "Karte ziehen",
    "present-card": "Präsentieren",
    "place-card": "Einsortieren",
    "extra-guesses": "Extra Guesses",
    challenge: "Korrektur",
    "round-result": "Auflösung",
    finished: "Beendet",
  })[phase];
