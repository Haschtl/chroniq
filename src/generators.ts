import { getSpotifySeedEntries } from "./spotify";
import type { GameGeneratorSettings, GenerateEntriesContext, GeneratedEntriesResult } from "./types";

export const generateEntriesForGenerator = async (
  generator: GameGeneratorSettings,
  count: number,
  context: GenerateEntriesContext = {},
): Promise<GeneratedEntriesResult> => {
  if (generator.generateEntries) {
    return generator.generateEntries(generator.generatedCount, count, context);
  }

  if (generator.type === "spotify-generator") {
    if (!context.accessToken) {
      throw new Error("Spotify Zugriff fehlt zum Laden der Karten.");
    }
    return getSpotifySeedEntries(
      context.accessToken,
      generator.seed,
      generator.generatedCount,
      count,
      context.excludeIds,
    );
  }

  return {
    entries: [],
    nextIndex: generator.generatedCount,
    exhausted: true,
  };
};
