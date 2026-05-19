import type { DataConnector, GeneratedEntriesResult, GuessEntry, MediaData } from "./types";

const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const PROFILE_URL = "https://api.spotify.com/v1/me";
const API_URL = "https://api.spotify.com/v1";
const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";
const OAUTH_STORAGE_KEY = "chroniq:spotify-oauth";
const SCOPES = ["user-read-private", "user-read-email", "streaming", "user-read-playback-state", "user-modify-playback-state"];
const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID?.trim() ?? "";
const APP_BASE_PATH = import.meta.env.BASE_URL || "/";

interface SpotifyOAuthSession {
  clientId: string;
  codeVerifier: string;
  state: string;
  redirectUri: string;
  createdAt: string;
}

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

interface SpotifyProfileResponse {
  id: string;
  display_name?: string;
}

interface SpotifyImage {
  url?: string;
}

interface SpotifyArtistRef {
  id?: string;
  name?: string;
}

interface SpotifyAlbum {
  name?: string;
  release_date?: string;
  images?: SpotifyImage[];
}

interface SpotifyTrack {
  id?: string;
  name?: string;
  artists?: SpotifyArtistRef[];
  album?: SpotifyAlbum;
  preview_url?: string | null;
  external_urls?: {
    spotify?: string;
  };
}

interface ItunesSearchResponse {
  results?: {
    artistName?: string;
    trackName?: string;
    previewUrl?: string;
  }[];
}

interface SpotifyWebPlaybackInstance {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, callback: (payload: never) => void) => void;
}

interface SpotifyWebPlaybackReadyPayload {
  device_id: string;
}

interface SpotifyWebPlaybackErrorPayload {
  message: string;
}

interface SpotifyWebPlaybackConstructor {
  Player: new (options: {
    name: string;
    getOAuthToken: (callback: (token: string) => void) => void;
    volume?: number;
  }) => SpotifyWebPlaybackInstance;
}

declare global {
  interface Window {
    Spotify?: SpotifyWebPlaybackConstructor;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

let playbackDevicePromise: Promise<string> | undefined;
let playbackPlayer: SpotifyWebPlaybackInstance | undefined;

export type SpotifySeedType = "track" | "playlist" | "artist";

export interface SpotifySeedPreview {
  id: string;
  type: SpotifySeedType;
  title: string;
  subtitle: string;
  totalTracks?: number;
  imageUrl?: string;
  externalUrl: string;
  strategy: string;
}

export const getSpotifyRedirectUri = () => `${window.location.origin}${joinBasePath("connectors/spotify/callback")}`;

export const hasSpotifyClientId = () => Boolean(SPOTIFY_CLIENT_ID);

export const isUnsupportedSpotifyDevOrigin = () =>
  window.location.protocol === "http:" && window.location.hostname === "localhost";

export const getSpotifySafeDevUrl = () => {
  const url = new URL(window.location.href);
  if (url.hostname === "localhost") {
    url.hostname = "127.0.0.1";
  }
  return url.toString();
};

export const startSpotifyAuthorization = async () => {
  if (!SPOTIFY_CLIENT_ID) {
    throw new Error("Spotify Client ID fehlt in VITE_SPOTIFY_CLIENT_ID.");
  }
  if (isUnsupportedSpotifyDevOrigin()) {
    throw new Error("Spotify erlaubt localhost nicht als Redirect URI. Oeffne die App ueber 127.0.0.1.");
  }

  const redirectUri = getSpotifyRedirectUri();
  const codeVerifier = generateRandomString(64);
  const state = generateRandomString(24);
  const codeChallenge = await createCodeChallenge(codeVerifier);

  const session: SpotifyOAuthSession = {
    clientId: SPOTIFY_CLIENT_ID,
    codeVerifier,
    state,
    redirectUri,
    createdAt: new Date().toISOString(),
  };
  window.sessionStorage.setItem(OAUTH_STORAGE_KEY, JSON.stringify(session));

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    scope: SCOPES.join(" "),
    redirect_uri: redirectUri,
    state,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  });

  window.location.assign(`${AUTHORIZE_URL}?${params.toString()}`);
};

export const completeSpotifyAuthorization = async (code: string, state: string): Promise<DataConnector> => {
  const session = readOAuthSession();
  if (!session) {
    throw new Error("Spotify Login-Session fehlt. Starte die Verbindung erneut.");
  }
  if (session.state !== state) {
    throw new Error("Spotify Login-State stimmt nicht. Verbindung abgebrochen.");
  }

  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: session.redirectUri,
      client_id: session.clientId,
      code_verifier: session.codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Spotify Token-Exchange fehlgeschlagen (${tokenResponse.status}).`);
  }

  const token = (await tokenResponse.json()) as SpotifyTokenResponse;
  const profile = await fetchSpotifyProfile(token.access_token);
  window.sessionStorage.removeItem(OAUTH_STORAGE_KEY);

  const now = new Date();
  return {
    id: "connector_spotify_primary",
    kind: "spotify",
    label: "Spotify",
    status: "configured",
    clientId: session.clientId,
    auth: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(now.getTime() + token.expires_in * 1000).toISOString(),
      scope: token.scope,
      tokenType: token.token_type,
    },
    account: {
      id: profile.id,
      displayName: profile.display_name,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
};

export const disconnectSpotify = () => {
  window.sessionStorage.removeItem(OAUTH_STORAGE_KEY);
};

export const parseSpotifySeed = (value: string): { type: SpotifySeedType; id: string } | undefined => {
  const trimmed = value.trim();
  const uriMatch = trimmed.match(/^spotify:(track|playlist|artist):([A-Za-z0-9]+)$/);
  if (uriMatch) {
    return { type: uriMatch[1] as SpotifySeedType, id: uriMatch[2] };
  }

  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    const type = parts[0];
    const id = parts[1];
    if ((type === "track" || type === "playlist" || type === "artist") && id) {
      return { type, id };
    }
  } catch {
    return undefined;
  }

  return undefined;
};

export const getSpotifySeedPreview = async (accessToken: string, seed: string) => {
  const parsed = parseSpotifySeed(seed);
  if (!parsed) {
    throw new Error("Spotify Seed muss ein Song-, Playlist- oder Artist-Link sein.");
  }

  const data = await spotifyFetch<Record<string, unknown>>(accessToken, `/${parsed.type}s/${parsed.id}`);
  return normalizeSpotifyItem(parsed.type, data);
};

export const searchSpotifySeeds = async (accessToken: string, query: string) => {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) return [];

  const data = await spotifyFetch<{
    tracks?: { items?: Record<string, unknown>[] };
    playlists?: { items?: (Record<string, unknown> | null)[] };
    artists?: { items?: Record<string, unknown>[] };
  }>(
    accessToken,
    `/search?${new URLSearchParams({
      q: cleanQuery,
      type: "track,playlist,artist",
      limit: "4",
    }).toString()}`,
  );

  return [
    ...(data.tracks?.items ?? []).map((item) => normalizeSpotifyItem("track", item)),
    ...(data.playlists?.items ?? []).filter(Boolean).map((item) => normalizeSpotifyItem("playlist", item!)),
    ...(data.artists?.items ?? []).map((item) => normalizeSpotifyItem("artist", item)),
  ];
};

export const getSpotifySeedEntries = async (
  accessToken: string,
  seed: string,
  index = 0,
  limit = 40,
  excludeIds: string[] = [],
): Promise<GeneratedEntriesResult> => {
  const parsed = parseSpotifySeed(seed);
  if (!parsed) {
    throw new Error("Spotify Seed muss aus der Suche ausgewaehlt werden.");
  }

  const existingIds = new Set(excludeIds);
  const generated =
    parsed.type === "playlist"
      ? await getPlaylistGeneratedEntries(accessToken, parsed.id, index, limit, existingIds)
      : parsed.type === "artist"
        ? await getGeneratedEntriesFromTracks(await getArtistTracks(accessToken, parsed.id), index, limit, existingIds)
        : await getGeneratedEntriesFromTracks(await getTrackSeedTracks(accessToken, parsed.id), index, limit, existingIds);

  if (generated.entries.length === 0) {
    throw new Error("Fuer diesen Spotify Seed wurden keine spielbaren Tracks gefunden.");
  }

  return generated;
};

export const ensureSpotifyPlaybackDevice = async (accessToken: string) => {
  if (playbackDevicePromise) return playbackDevicePromise;

  playbackDevicePromise = new Promise<string>((resolve, reject) => {
    loadSpotifyPlaybackSdk()
      .then(() => {
        if (!window.Spotify) {
          reject(new Error("Spotify Web Playback SDK konnte nicht geladen werden."));
          return;
        }

        const player = new window.Spotify.Player({
          name: "ChronIQ",
          getOAuthToken: (callback) => callback(accessToken),
          volume: 0.8,
        });
        playbackPlayer = player;

        player.addListener("ready", (payload) => {
          resolve((payload as unknown as SpotifyWebPlaybackReadyPayload).device_id);
        });
        player.addListener("initialization_error", (payload) => rejectSpotifyPlayback(payload, reject));
        player.addListener("authentication_error", (payload) => rejectSpotifyPlayback(payload, reject));
        player.addListener("account_error", (payload) => rejectSpotifyPlayback(payload, reject));
        player.addListener("playback_error", (payload) => rejectSpotifyPlayback(payload, reject));

        player.connect().then((connected) => {
          if (!connected) reject(new Error("Spotify Player konnte nicht verbunden werden."));
        });
      })
      .catch(reject);
  });

  return playbackDevicePromise;
};

export const playSpotifyTrack = async (accessToken: string, deviceId: string, uri: string) => {
  await spotifyFetch<void>(
    accessToken,
    `/me/player/play?${new URLSearchParams({ device_id: deviceId }).toString()}`,
    {
      method: "PUT",
      body: JSON.stringify({ uris: [uri] }),
    },
  );
};

export const pauseSpotifyPlayback = async (accessToken: string) => {
  await spotifyFetch<void>(accessToken, "/me/player/pause", { method: "PUT" });
};

const fetchSpotifyProfile = async (accessToken: string) => {
  const response = await fetch(PROFILE_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Spotify Profil konnte nicht geladen werden (${response.status}).`);
  }
  return (await response.json()) as SpotifyProfileResponse;
};

const spotifyFetch = async <T,>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Spotify API Anfrage fehlgeschlagen (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

const getPlaylistGeneratedEntries = async (
  accessToken: string,
  playlistId: string,
  index: number,
  limit: number,
  existingIds: Set<string>,
): Promise<GeneratedEntriesResult> => {
  const playlistChunk = await getPlaylistTracks(accessToken, playlistId, index, limit);
  const entries = await tracksToGuessEntries(playlistChunk.tracks, limit, existingIds);

  if (!playlistChunk.exhausted || entries.length >= limit) {
    return {
      entries,
      nextIndex: playlistChunk.nextIndex,
      exhausted: false,
    };
  }

  const radioTracks = await getPlaylistRadioTracks(accessToken, playlistId, limit * 3);
  const radioEntries = await tracksToGuessEntries(radioTracks, limit - entries.length, existingIds);

  return {
    entries: [...entries, ...radioEntries],
    nextIndex: playlistChunk.nextIndex,
    exhausted: false,
  };
};

const getGeneratedEntriesFromTracks = async (
  tracks: SpotifyTrack[],
  index: number,
  limit: number,
  existingIds: Set<string>,
): Promise<GeneratedEntriesResult> => {
  const entries = await tracksToGuessEntries(tracks.slice(index), limit, existingIds);
  return {
    entries,
    nextIndex: Math.min(index + limit, tracks.length),
    exhausted: index + limit >= tracks.length,
  };
};

const getPlaylistTracks = async (accessToken: string, playlistId: string, index: number, limit: number) => {
  const pageSize = 50;
  const firstPage = await spotifyFetch<{
    total?: number;
    items?: { track?: SpotifyTrack | null }[];
  }>(
    accessToken,
    `/playlists/${playlistId}/tracks?${new URLSearchParams({
      limit: String(pageSize),
      offset: String(index),
      fields: "total,items(track(id,name,artists(id,name),album(name,release_date,images),preview_url,external_urls))",
    }).toString()}`,
  );

  const tracks = getTracksFromPlaylistPage(firstPage);
  const total = firstPage.total ?? tracks.length;
  const nextIndex = Math.min(index + pageSize, total);
  const pagesToFetch = Math.max(0, Math.min(3, Math.ceil(Math.max(limit - tracks.length, 0) / pageSize)));
  const offsets = Array.from({ length: pagesToFetch }, (_, pageIndex) => nextIndex + pageIndex * pageSize).filter(
    (offset) => offset < total,
  );
  const pages = await Promise.all(
    offsets.map((offset) =>
      spotifyFetch<{
        items?: { track?: SpotifyTrack | null }[];
      }>(
        accessToken,
        `/playlists/${playlistId}/tracks?${new URLSearchParams({
          limit: String(pageSize),
          offset: String(offset),
          fields: "items(track(id,name,artists(id,name),album(name,release_date,images),preview_url,external_urls))",
        }).toString()}`,
      ),
    ),
  );

  const lastOffset = offsets.length > 0 ? offsets[offsets.length - 1] + pageSize : nextIndex;
  return {
    tracks: shuffleTracks([...tracks, ...pages.flatMap(getTracksFromPlaylistPage)]),
    nextIndex: Math.min(lastOffset, total),
    exhausted: Math.min(lastOffset, total) >= total,
  };
};

const getArtistTracks = async (accessToken: string, artistId: string) => {
  const data = await spotifyFetch<{ tracks?: SpotifyTrack[] }>(
    accessToken,
    `/artists/${artistId}/top-tracks?${new URLSearchParams({ market: "from_token" }).toString()}`,
  );
  return data.tracks ?? [];
};

const getTrackSeedTracks = async (accessToken: string, trackId: string) => {
  const seedTrack = await spotifyFetch<SpotifyTrack>(accessToken, `/tracks/${trackId}`);
  const artistId = seedTrack.artists?.find((artist) => artist.id)?.id;
  if (!artistId) return [seedTrack];
  const artistTracks = await getArtistTracks(accessToken, artistId);
  return [seedTrack, ...artistTracks];
};

const getPlaylistRadioTracks = async (accessToken: string, playlistId: string, limit: number) => {
  const sample = await getPlaylistTracks(accessToken, playlistId, 0, 80);
  const artistIds = [
    ...new Set(
      sample.tracks
        .flatMap((track) => track.artists ?? [])
        .map((artist) => artist.id)
        .filter((artistId): artistId is string => Boolean(artistId)),
    ),
  ];
  const selectedArtistIds = shuffleItems(artistIds).slice(0, 8);
  const batches = await Promise.all(selectedArtistIds.map((artistId) => getArtistTracks(accessToken, artistId)));
  return shuffleItems(batches.flat()).slice(0, limit);
};

const dedupeTracks = (tracks: SpotifyTrack[]) => {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (!track.id || seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
};

const tracksToGuessEntries = async (tracks: SpotifyTrack[], limit: number, existingIds: Set<string>) => {
  const entries: GuessEntry[] = [];
  const batchSize = 8;

  for (let index = 0; index < tracks.length && entries.length < limit; index += batchSize) {
    const batch = tracks
      .slice(index, index + batchSize)
      .filter((track) => track.id && !existingIds.has(`spotify_${track.id}`));
    const batchEntries = await Promise.all(batch.map(trackToGuessEntry));
    const freshEntries = batchEntries.filter((entry): entry is GuessEntry => Boolean(entry));
    freshEntries.forEach((entry) => existingIds.add(entry.id));
    entries.push(...freshEntries);
  }

  return entries.slice(0, limit);
};

const trackToGuessEntry = async (track: SpotifyTrack): Promise<GuessEntry | undefined> => {
  if (!track.id || !track.name) return undefined;
  const releaseYear = Number(track.album?.release_date?.slice(0, 4));
  if (!Number.isFinite(releaseYear)) return undefined;

  const artists = (track.artists ?? []).map((artist) => artist.name).filter(Boolean).join(", ");
  const previewUrl = track.preview_url ?? (await findExternalPreviewUrl(track.name, artists));
  const image = getSpotifyImage(track.album?.images);
  const albumCover: Extract<MediaData, { type: "image" }> | undefined = image
    ? {
        type: "image",
        url: image,
        alt: track.album?.name ?? track.name,
      }
    : undefined;

  return {
    id: `spotify_${track.id}`,
    used: false,
    title: track.name,
    artist: artists,
    year: releaseYear,
    spotifyUri: `spotify:track:${track.id}`,
    spotifyUrl: track.external_urls?.spotify ?? `https://open.spotify.com/track/${track.id}`,
    ...(previewUrl
      ? {
          audioPreview: {
            type: "audio" as const,
            url: previewUrl,
            title: track.name,
            artist: artists,
          },
        }
      : {}),
    ...(albumCover ? { albumCover } : {}),
  };
};

const getSpotifyImage = (images?: SpotifyImage[]) => images?.find((image) => image.url)?.url;

const loadSpotifyPlaybackSdk = () =>
  new Promise<void>((resolve, reject) => {
    if (window.Spotify) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://sdk.scdn.co/spotify-player.js"]');
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    if (existing) return;

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    script.onerror = () => reject(new Error("Spotify Web Playback SDK konnte nicht geladen werden."));
    document.body.appendChild(script);
  });

const rejectSpotifyPlayback = (payload: never, reject: (reason?: unknown) => void) => {
  const message = (payload as unknown as SpotifyWebPlaybackErrorPayload).message;
  reject(new Error(message || "Spotify Playback fehlgeschlagen."));
  playbackPlayer?.disconnect();
  playbackPlayer = undefined;
  playbackDevicePromise = undefined;
};

const getTracksFromPlaylistPage = (page: { items?: { track?: SpotifyTrack | null }[] }) =>
  (page.items ?? []).map((item) => item.track).filter((track): track is SpotifyTrack => Boolean(track?.id));

const shuffleTracks = (tracks: SpotifyTrack[]) => shuffleItems(tracks);

const shuffleItems = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);

const findExternalPreviewUrl = async (title: string, artist: string) => {
  try {
    const data = await fetchJson<ItunesSearchResponse>(
      `${ITUNES_SEARCH_URL}?${new URLSearchParams({
        term: `${title} ${artist}`,
        media: "music",
        entity: "song",
        limit: "8",
      }).toString()}`,
    );
    const normalizedTitle = normalizeMatchText(title);
    const normalizedArtist = normalizeMatchText(artist);
    const match = (data.results ?? []).find((result) => {
      if (!result.previewUrl || !result.trackName || !result.artistName) return false;
      const candidateTitle = normalizeMatchText(result.trackName);
      const candidateArtist = normalizeMatchText(result.artistName);
      const titleMatches =
        candidateTitle.includes(normalizedTitle) ||
        normalizedTitle.includes(candidateTitle) ||
        shareEnoughWords(candidateTitle, normalizedTitle);
      const artistMatches =
        candidateArtist.includes(normalizedArtist) ||
        normalizedArtist.includes(candidateArtist) ||
        shareEnoughWords(candidateArtist, normalizedArtist);
      return titleMatches && artistMatches;
    });
    return match?.previewUrl;
  } catch {
    return undefined;
  }
};

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Audio-Preview konnte nicht geladen werden (${response.status}).`);
  }
  return (await response.json()) as T;
};

const normalizeMatchText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const shareEnoughWords = (left: string, right: string) => {
  const leftWords = new Set(left.split(" ").filter((word) => word.length > 2));
  const rightWords = right.split(" ").filter((word) => word.length > 2);
  if (leftWords.size === 0 || rightWords.length === 0) return false;
  return rightWords.filter((word) => leftWords.has(word)).length >= Math.min(2, rightWords.length);
};

const normalizeSpotifyItem = (type: SpotifySeedType, item: Record<string, unknown>): SpotifySeedPreview => {
  const name = String(item.name ?? "");
  const externalUrl = getExternalUrl(item);
  if (type === "track") {
    const artists = Array.isArray(item.artists)
      ? item.artists.map((artist) => String((artist as Record<string, unknown>).name)).filter(Boolean)
      : [];
    const album = item.album as Record<string, unknown> | undefined;
    return {
      id: String(item.id),
      type,
      title: name,
      subtitle: artists.join(", "),
      imageUrl: getImageUrl(album),
      externalUrl,
      strategy: "Song-Radio",
    };
  }
  if (type === "playlist") {
    const tracks = item.tracks as Record<string, unknown> | undefined;
    const totalTracks = typeof tracks?.total === "number" ? tracks.total : undefined;
    const total = totalTracks ? `${totalTracks} Tracks` : "Playlist";
    return {
      id: String(item.id),
      type,
      title: name,
      subtitle: total,
      totalTracks,
      imageUrl: getImageUrl(item),
      externalUrl,
      strategy: "Playlist zufällig",
    };
  }
  return {
    id: String(item.id),
    type,
    title: name,
    subtitle: "Artist",
    imageUrl: getImageUrl(item),
    externalUrl,
    strategy: "Nur dieser Artist",
  };
};

const getImageUrl = (item?: Record<string, unknown>) => {
  const images = item?.images;
  if (!Array.isArray(images)) return undefined;
  const first = images[0] as Record<string, unknown> | undefined;
  return typeof first?.url === "string" ? first.url : undefined;
};

const getExternalUrl = (item: Record<string, unknown>) => {
  const urls = item.external_urls as Record<string, unknown> | undefined;
  return typeof urls?.spotify === "string" ? urls.spotify : "";
};

const readOAuthSession = () => {
  const raw = window.sessionStorage.getItem(OAUTH_STORAGE_KEY);
  if (!raw) return undefined;

  try {
    return JSON.parse(raw) as SpotifyOAuthSession;
  } catch {
    return undefined;
  }
};

const generateRandomString = (length: number) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).slice(-1)).join("");
};

const createCodeChallenge = async (codeVerifier: string) => {
  const encodedVerifier = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", encodedVerifier);
  return base64UrlEncode(digest);
};

const base64UrlEncode = (buffer: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const joinBasePath = (path: string) => {
  const base = APP_BASE_PATH.endsWith("/") ? APP_BASE_PATH : `${APP_BASE_PATH}/`;
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `${base}${cleanPath}`;
};
