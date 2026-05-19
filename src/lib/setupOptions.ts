import type {
  SpotifyAdvancedSettings,
  SpotifyCardBackKey,
  SpotifyCardFrontKey,
  SpotifyExtraGuessKey,
  SpotifyOrderKey,
} from "../types";

export const defaultSpotifyAdvancedSettings: SpotifyAdvancedSettings = {
  cardBackKeys: ["audioPreview"],
  orderKey: "year",
  cardFrontKeys: ["albumCover", "title", "artist", "year"],
  extraGuessKeys: ["title", "artist"],
};

export const spotifyOrderOptions: { key: SpotifyOrderKey; label: string }[] = [
  { key: "year", label: "Year" },
  { key: "durationMs", label: "Duration" },
];

export const spotifyCardOptions: { key: SpotifyCardFrontKey; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "artist", label: "Artist" },
  { key: "year", label: "Year" },
  { key: "durationMs", label: "Duration" },
  { key: "albumCover", label: "Cover" },
  { key: "audioPreview", label: "Song" },
];

export const spotifyCardBackOptions: { key: SpotifyCardBackKey; label: string }[] = spotifyCardOptions;
export const spotifyCardFrontOptions: { key: SpotifyCardFrontKey; label: string }[] = spotifyCardOptions;

export const spotifyExtraGuessOptions: { key: SpotifyExtraGuessKey; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "artist", label: "Artist" },
  { key: "year", label: "Year" },
  { key: "durationMs", label: "Duration" },
];

export const spotifyCardKeyLabels = Object.fromEntries(
  spotifyCardOptions.map((option) => [option.key, option.label]),
) as Record<SpotifyCardFrontKey, string>;

export const spotifyOrderLabels = Object.fromEntries(
  spotifyOrderOptions.map((option) => [option.key, option.label]),
) as Record<SpotifyOrderKey, string>;

export const normalizeSpotifyAdvancedSettings = (settings?: Partial<SpotifyAdvancedSettings>): SpotifyAdvancedSettings => {
  const legacySettings = settings as Partial<SpotifyAdvancedSettings> & {
    presentationKey?: SpotifyCardBackKey;
    presentationKeys?: SpotifyCardBackKey[];
    displayKeys?: SpotifyCardFrontKey[];
  } | undefined;
  const cardFrontKeys = (settings?.cardFrontKeys ?? legacySettings?.displayKeys)?.filter((key) =>
    spotifyCardFrontOptions.some((option) => option.key === key),
  );
  const extraGuessKeys = settings?.extraGuessKeys?.filter((key) => spotifyExtraGuessOptions.some((option) => option.key === key));
  const legacyCardBackKey = legacySettings?.presentationKey ?? defaultSpotifyAdvancedSettings.cardBackKeys[0];
  const cardBackKeys = (settings?.cardBackKeys ?? legacySettings?.presentationKeys ?? [legacyCardBackKey]).filter((key) =>
    spotifyCardBackOptions.some((option) => option.key === key),
  );
  const normalizedCardBackKeys = cardBackKeys.length ? cardBackKeys : defaultSpotifyAdvancedSettings.cardBackKeys;

  return {
    cardBackKeys: normalizedCardBackKeys,
    orderKey: spotifyOrderLabels[settings?.orderKey ?? "year"]
      ? settings?.orderKey ?? defaultSpotifyAdvancedSettings.orderKey
      : defaultSpotifyAdvancedSettings.orderKey,
    cardFrontKeys: cardFrontKeys?.length ? cardFrontKeys : defaultSpotifyAdvancedSettings.cardFrontKeys,
    extraGuessKeys: extraGuessKeys?.length ? extraGuessKeys : defaultSpotifyAdvancedSettings.extraGuessKeys,
  };
};
