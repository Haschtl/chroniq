import * as Accordion from "@radix-ui/react-accordion";
import { Check, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { generateEntriesForGenerator } from "../../generators";
import {
  getSpotifySeedPreview,
  searchSpotifySeeds,
  startSpotifyAuthorization,
  type SpotifySeedPreview,
} from "../../spotify";
import {
  normalizeSpotifyAdvancedSettings,
  spotifyCardBackOptions,
  spotifyCardFrontOptions,
  spotifyCardKeyLabels,
  spotifyExtraGuessOptions,
  spotifyOrderLabels,
  spotifyOrderOptions,
} from "../../lib/setupOptions";
import type {
  DataConnector,
  GameGeneratorSettings,
  GuessEntry,
  SetupState,
  SpotifyAdvancedSettings,
  SpotifyCardBackKey,
  SpotifyCardFrontKey,
  SpotifyExtraGuessKey,
  SpotifyOrderKey,
} from "../../types";

const initialSpotifyCardCount = 40;

export interface SpotifySetupState {
  advanced: SpotifyAdvancedSettings;
  clearPreload: () => void;
  entries: GuessEntry[];
  exhausted: boolean;
  generatedCount: number;
  loadBatch: (showInlineLoading: boolean) => Promise<SpotifyPool | undefined>;
  lookupError: string;
  lookupLoading: boolean;
  preloadLoading: boolean;
  preview?: SpotifySeedPreview;
  query: string;
  results: SpotifySeedPreview[];
  seed: string;
  setAdvanced: (value: SpotifyAdvancedSettings) => void;
  setLookupError: (value: string) => void;
  setPreview: (value: SpotifySeedPreview | undefined) => void;
  setQuery: (value: string) => void;
  setResults: (value: SpotifySeedPreview[]) => void;
  setSeed: (value: string) => void;
}

export interface SpotifyPool {
  entries: GuessEntry[];
  generatedCount: number;
  exhausted: boolean;
}

export const useSpotifySetup = ({
  enabled,
  savedSetup,
  spotifyConnector,
}: {
  enabled: boolean;
  savedSetup?: SetupState;
  spotifyConnector?: DataConnector;
}): SpotifySetupState => {
  const [seed, setSeed] = useState(savedSetup?.spotifySeed ?? "");
  const [entries, setEntries] = useState<GuessEntry[]>(savedSetup?.spotifyEntries ?? []);
  const [generatedCount, setGeneratedCount] = useState(savedSetup?.spotifyGeneratedCount ?? 0);
  const [exhausted, setExhausted] = useState(savedSetup?.spotifyExhausted ?? false);
  const [advanced, setAdvanced] = useState<SpotifyAdvancedSettings>(
    normalizeSpotifyAdvancedSettings(savedSetup?.spotifyAdvanced),
  );
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<SpotifySeedPreview | undefined>(savedSetup?.spotifyPreview);
  const [results, setResults] = useState<SpotifySeedPreview[]>([]);
  const [lookupError, setLookupError] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [preloadLoading, setPreloadLoading] = useState(false);

  const clearPreload = () => {
    setEntries([]);
    setGeneratedCount(0);
    setExhausted(false);
  };

  const loadBatch = async (showInlineLoading: boolean): Promise<SpotifyPool | undefined> => {
    if (!spotifyConnector?.auth || !seed) return undefined;
    if (showInlineLoading) setPreloadLoading(true);
    setLookupError("");
    try {
      const spotifyGenerator: GameGeneratorSettings = {
        id: "spotify-generator",
        label: "Spotify-Generator",
        type: "spotify-generator",
        seed,
        connectorId: spotifyConnector.id,
        generatedCount,
        exhausted,
      };
      const generated = await generateEntriesForGenerator(spotifyGenerator, initialSpotifyCardCount, {
        accessToken: spotifyConnector.auth.accessToken,
        excludeIds: entries.map((entry) => entry.id),
      });
      const existingIds = new Set(entries.map((entry) => entry.id));
      const freshEntries = generated.entries.filter((entry) => !existingIds.has(entry.id));
      const nextEntries = [...entries, ...freshEntries];
      const nextPool = {
        entries: nextEntries,
        generatedCount: generated.nextIndex,
        exhausted: Boolean(generated.exhausted),
      };
      setEntries((current) => [...current, ...freshEntries]);
      setGeneratedCount(nextPool.generatedCount);
      setExhausted(nextPool.exhausted);
      return nextPool;
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : "Spotify Karten konnten nicht vorgeladen werden.");
      return undefined;
    } finally {
      if (showInlineLoading) setPreloadLoading(false);
    }
  };

  useEffect(() => {
    if (!spotifyConnector?.auth || !enabled) return;
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setLookupError("");
    setLookupLoading(true);
    const timeout = window.setTimeout(() => {
      const lookup = trimmedQuery.includes("open.spotify.com/") || trimmedQuery.startsWith("spotify:")
        ? getSpotifySeedPreview(spotifyConnector.auth!.accessToken, trimmedQuery).then((seedPreview) => [seedPreview])
        : searchSpotifySeeds(spotifyConnector.auth!.accessToken, trimmedQuery);

      lookup
        .then((nextResults) => {
          if (!cancelled) setResults(nextResults);
        })
        .catch((error) => {
          if (!cancelled) {
            setResults([]);
            setLookupError(error instanceof Error ? error.message : "Spotify Suche fehlgeschlagen.");
          }
        })
        .finally(() => {
          if (!cancelled) setLookupLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [enabled, spotifyConnector?.auth, query]);

  return {
    advanced,
    entries,
    exhausted,
    generatedCount,
    loadBatch,
    lookupError,
    lookupLoading,
    preloadLoading,
    preview,
    query,
    results,
    seed,
    setAdvanced,
    setLookupError,
    setPreview,
    setQuery,
    setResults,
    setSeed,
    clearPreload,
  };
};

export function SpotifyGeneratorSetup({
  setup,
  spotifyConnector,
}: {
  setup: ReturnType<typeof useSpotifySetup>;
  spotifyConnector?: DataConnector;
}) {
  const connectSpotifyFromSeed = async () => {
    if (spotifyConnector) return;
    setup.setLookupError("");
    try {
      await startSpotifyAuthorization();
    } catch (error) {
      setup.setLookupError(error instanceof Error ? error.message : "Spotify Verbindung konnte nicht gestartet werden.");
    }
  };

  const preloadSpotifyBatch = () => {
    void setup.loadBatch(true);
  };

  return (
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
            value={setup.query}
            onChange={(event) => {
              setup.setQuery(event.target.value);
              setup.setPreview(undefined);
              setup.setSeed("");
              setup.clearPreload();
            }}
          />
        </div>
      </label>
      {setup.lookupError ? <p className="form-error">{setup.lookupError}</p> : null}
      {setup.preview ? (
        <div className="spotify-seed-selection">
          <SpotifySeedCard preview={setup.preview} />
          <div className="spotify-preload-row">
            <span>
              {setup.entries.length} Karten vorgeladen{setup.exhausted ? " · Quelle ausgeschöpft" : ""}
            </span>
            <button
              className="secondary-button"
              type="button"
              disabled={setup.preloadLoading || !spotifyConnector || setup.exhausted}
              onClick={preloadSpotifyBatch}
            >
              <Download size={15} />
              {setup.preloadLoading ? "Lädt..." : "Batch nachladen"}
            </button>
          </div>
        </div>
      ) : null}
      {setup.results.length > 0 ? (
        <div className="spotify-live-results">
          {setup.results.map((result) => (
            <button
              className="spotify-result"
              key={`${result.type}-${result.id}`}
              type="button"
              onClick={() => {
                setup.setPreview(result);
                setup.setSeed(result.externalUrl);
                setup.setQuery("");
                setup.setResults([]);
                setup.clearPreload();
              }}
            >
              <SpotifySeedCard preview={result} compact />
            </button>
          ))}
        </div>
      ) : setup.lookupLoading ? <p className="muted">Suche läuft...</p> : null}
      <SpotifyAdvancedOptions value={setup.advanced} onChange={setup.setAdvanced} />
    </div>
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

function SpotifyAdvancedOptions({
  value,
  onChange,
}: {
  value: SpotifyAdvancedSettings;
  onChange: (value: SpotifyAdvancedSettings) => void;
}) {
  const cardBackKeys = value.cardBackKeys?.length ? value.cardBackKeys : ["audioPreview" as SpotifyCardBackKey];
  const updateCardBackKey = (key: SpotifyCardBackKey, checked: boolean) => {
    const nextKeys = checked
      ? [...cardBackKeys, key]
      : cardBackKeys.filter((cardBackKey) => cardBackKey !== key);
    const normalizedKeys = nextKeys.length ? nextKeys : ["audioPreview" as SpotifyCardBackKey];
    onChange({
      ...value,
      cardBackKeys: normalizedKeys,
    });
  };

  const updateCardFrontKey = (key: SpotifyCardFrontKey, checked: boolean) => {
    const nextKeys = checked
      ? [...value.cardFrontKeys, key]
      : value.cardFrontKeys.filter((cardFrontKey) => cardFrontKey !== key);
    onChange({
      ...value,
      cardFrontKeys: nextKeys.length ? nextKeys : ["title"],
    });
  };

  const updateExtraGuessKey = (key: SpotifyExtraGuessKey, checked: boolean) => {
    const nextKeys = checked
      ? [...value.extraGuessKeys, key]
      : value.extraGuessKeys.filter((extraGuessKey) => extraGuessKey !== key);
    onChange({
      ...value,
      extraGuessKeys: nextKeys,
    });
  };

  return (
    <Accordion.Root className="spotify-advanced-root" collapsible type="single">
      <Accordion.Item className="spotify-advanced-accordion" value="advanced">
        <Accordion.Header>
          <Accordion.Trigger className="spotify-advanced-trigger">
            <span>Advanced</span>
            <small>
              {cardBackKeys.map((key) => spotifyCardKeyLabels[key]).join(" + ")} · {spotifyOrderLabels[value.orderKey]} · {value.cardFrontKeys.length} Card-Front
            </small>
            <b aria-hidden="true">⌄</b>
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content className="spotify-advanced-content">
          <div className="spotify-display-options" aria-label="Card-Back-Keys">
            <span>Card-Back-Keys</span>
            <div>
              {spotifyCardBackOptions.map((option) => (
                <label
                  className={cardBackKeys.includes(option.key) ? "spotify-display-chip active" : "spotify-display-chip"}
                  key={option.key}
                >
                  <input
                    checked={cardBackKeys.includes(option.key)}
                    type="checkbox"
                    onChange={(event) => updateCardBackKey(option.key, event.target.checked)}
                  />
                  <span className="spotify-display-check" aria-hidden="true">
                    <Check size={12} strokeWidth={3} />
                  </span>
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="spotify-advanced-grid">
            <label className="field">
              Order-Key
              <select
                value={value.orderKey}
                onChange={(event) =>
                  onChange({
                    ...value,
                    orderKey: event.target.value as SpotifyOrderKey,
                  })
                }
              >
                {spotifyOrderOptions.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="spotify-display-options" aria-label="Card-Front-Keys">
            <span>Card-Front-Keys</span>
            <div>
              {spotifyCardFrontOptions.map((option) => (
                <label
                  className={value.cardFrontKeys.includes(option.key) ? "spotify-display-chip active" : "spotify-display-chip"}
                  key={option.key}
                >
                  <input
                    checked={value.cardFrontKeys.includes(option.key)}
                    type="checkbox"
                    onChange={(event) => updateCardFrontKey(option.key, event.target.checked)}
                  />
                  <span className="spotify-display-check" aria-hidden="true">
                    <Check size={12} strokeWidth={3} />
                  </span>
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="spotify-display-options" aria-label="Extra-Guess-Keys">
            <span>Extra-Guess-Keys</span>
            <div>
              {spotifyExtraGuessOptions.map((option) => (
                <label
                  className={value.extraGuessKeys.includes(option.key) ? "spotify-display-chip active" : "spotify-display-chip"}
                  key={option.key}
                >
                  <input
                    checked={value.extraGuessKeys.includes(option.key)}
                    type="checkbox"
                    onChange={(event) => updateExtraGuessKey(option.key, event.target.checked)}
                  />
                  <span className="spotify-display-check" aria-hidden="true">
                    <Check size={12} strokeWidth={3} />
                  </span>
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
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
