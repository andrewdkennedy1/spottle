import { Track } from "../types";

type ParseInput = string | { data: string; mimeType: string };

type ParsedTrack = {
  title: string;
  artist: string;
  album: string;
};

type SpotifyAccessTokenResponse = {
  accessToken?: string;
  accessTokenExpirationTimestampMs?: number;
};

type SpotifyArtist = {
  name?: string;
};

type SpotifyAlbum = {
  name?: string;
};

type SpotifyTrack = {
  name?: string;
  artists?: SpotifyArtist[];
  album?: SpotifyAlbum | null;
};

type SpotifyPlaylistTrackItem = {
  track?: SpotifyTrack | null;
};

type SpotifyPlaylistResponse = {
  name?: string;
  tracks?: {
    items?: SpotifyPlaylistTrackItem[];
    next?: string | null;
  };
};

type SpotifyTracksPage = {
  items?: SpotifyPlaylistTrackItem[];
  next?: string | null;
};

const TITLE_HINTS = [
  "remix",
  "mix",
  "edit",
  "version",
  "live",
  "demo",
  "acoustic",
  "instrumental",
  "remaster",
  "remastered",
  "radio",
  "extended",
  "feat",
  "ft",
  "featuring"
];

function isStandaloneUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

function isSingleToken(value: string): boolean {
  return !/\s/.test(value.trim());
}

function normalizeSpotifyUrl(value: string): URL | null {
  const trimmed = value.trim();
  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

function stripLinePrefix(line: string): string {
  let cleaned = line.trim();
  cleaned = cleaned.replace(/^\s*\d+\s*[\.\)\-:]\s*/, "");
  cleaned = cleaned.replace(/^\s*[\u2022\-\*\+]+\s*/, "");
  return cleaned.trim();
}

function cleanField(value: string): string {
  return value
    .replace(/^[\"'`]+/, "")
    .replace(/[\"'`]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSpotifyPlaylistId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || !isSingleToken(trimmed)) {
    return null;
  }

  const uriMatch = trimmed.match(/^spotify:playlist:([a-zA-Z0-9]+)$/);
  if (uriMatch) {
    return uriMatch[1];
  }

  const url = normalizeSpotifyUrl(trimmed);
  if (!url) {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (!host.endsWith("spotify.com")) {
    return null;
  }

  const pathMatch = url.pathname.match(/\/(?:embed\/)?playlist\/([a-zA-Z0-9]+)/i);
  return pathMatch ? pathMatch[1] : null;
}

async function getSpotifyAccessToken(): Promise<string> {
  let response: Response;
  try {
    response = await fetch(
      "https://open.spotify.com/get_access_token?reason=transport&productType=web_player",
      {
        headers: {
          Accept: "application/json"
        }
      }
    );
  } catch {
    throw new Error("Spotify link could not be accessed. Paste the track list instead.");
  }

  if (!response.ok) {
    throw new Error("Spotify link could not be accessed. Paste the track list instead.");
  }

  const data = (await response.json()) as SpotifyAccessTokenResponse;
  if (!data.accessToken) {
    throw new Error("Spotify link could not be accessed. Paste the track list instead.");
  }

  return data.accessToken;
}

async function fetchSpotifyPlaylist(
  playlistId: string
): Promise<{ name: string; tracks: Track[] }> {
  const token = await getSpotifyAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`
  };

  const playlistUrl = new URL(`https://api.spotify.com/v1/playlists/${playlistId}`);
  playlistUrl.searchParams.set("market", "from_token");
  playlistUrl.searchParams.set(
    "fields",
    "name,tracks.items(track(name,artists(name),album(name))),tracks.next"
  );

  const items: SpotifyPlaylistTrackItem[] = [];
  let name = "";
  let nextUrl: string | null = playlistUrl.toString();

  while (nextUrl) {
    let response: Response;
    try {
      response = await fetch(nextUrl, { headers });
    } catch {
      throw new Error("Spotify request failed. Paste the track list instead.");
    }
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Spotify playlist not found or not public.");
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error("Spotify playlist could not be accessed. Paste the track list instead.");
      }
      throw new Error("Spotify request failed. Paste the track list instead.");
    }

    const data = (await response.json()) as SpotifyPlaylistResponse | SpotifyTracksPage;
    if ("tracks" in data) {
      if (!name && data.name) {
        name = data.name;
      }
      if (Array.isArray(data.tracks?.items)) {
        items.push(...data.tracks.items);
      }
      nextUrl = data.tracks?.next ?? null;
    } else {
      if (Array.isArray(data.items)) {
        items.push(...data.items);
      }
      nextUrl = data.next ?? null;
    }
  }

  const trackList = items
    .map((item) => item.track)
    .filter((track): track is SpotifyTrack => Boolean(track))
    .map((track) => ({
      title: cleanField(track.name ?? ""),
      artist: cleanField(
        track.artists?.map((artist) => artist.name ?? "").filter(Boolean).join(", ") ?? ""
      ),
      album: cleanField(track.album?.name ?? "")
    }))
    .filter((track) => track.title && track.artist);

  if (!trackList.length) {
    throw new Error("No tracks found in the Spotify playlist.");
  }

  return {
    name: cleanField(name) || "Spotify Playlist",
    tracks: trackList.map((track, index) => ({
      ...track,
      id: `track-${index}`,
      status: "pending"
    }))
  };
}

function scoreTitle(value: string): number {
  const lower = value.toLowerCase();
  let score = 0;
  for (const hint of TITLE_HINTS) {
    if (lower.includes(hint)) {
      score += 2;
    }
  }
  if (/[([{\]]/.test(value)) {
    score += 1;
  }
  if (/\d{4}/.test(value)) {
    score += 1;
  }
  return score;
}

function scoreArtist(value: string): number {
  const lower = value.toLowerCase();
  let score = 0;
  if (value.includes("&")) {
    score += 1;
  }
  if (lower.includes(" x ")) {
    score += 1;
  }
  if (lower.includes(" vs ")) {
    score += 1;
  }
  if (lower.includes(" and ")) {
    score += 1;
  }
  if (lower.includes(" with ")) {
    score += 1;
  }
  return score;
}

function resolveTitleArtist(left: string, right: string): { title: string; artist: string } {
  const leftTitleScore = scoreTitle(left);
  const rightTitleScore = scoreTitle(right);
  const leftArtistScore = scoreArtist(left);
  const rightArtistScore = scoreArtist(right);

  if (leftTitleScore > rightTitleScore && rightArtistScore >= leftArtistScore) {
    return { title: left, artist: right };
  }
  if (rightTitleScore > leftTitleScore && leftArtistScore >= rightArtistScore) {
    return { title: right, artist: left };
  }
  if (rightArtistScore > leftArtistScore) {
    return { title: left, artist: right };
  }
  if (leftArtistScore > rightArtistScore) {
    return { title: right, artist: left };
  }
  return { title: left, artist: right };
}

function splitParts(value: string, delimiter: RegExp): string[] {
  return value
    .split(delimiter)
    .map(cleanField)
    .filter(Boolean);
}

function buildFromParts(parts: string[]): ParsedTrack | null {
  if (parts.length < 2) {
    return null;
  }

  const [first, second, ...rest] = parts;
  const { title, artist } = resolveTitleArtist(first, second);
  const album = rest.length ? cleanField(rest.join(" - ")) : "";

  if (!title || !artist) {
    return null;
  }

  return { title, artist, album };
}

function parseTrackLine(line: string): ParsedTrack | null {
  const cleaned = stripLinePrefix(line);
  if (!cleaned) {
    return null;
  }

  const byMatch = cleaned.match(/^(.*?)\s+by\s+(.+)$/i);
  if (byMatch) {
    const title = cleanField(byMatch[1]);
    const artist = cleanField(byMatch[2]);
    if (!title || !artist) {
      return null;
    }
    return { title, artist, album: "" };
  }

  if (cleaned.includes("\t")) {
    const parts = splitParts(cleaned, /\t+/);
    return buildFromParts(parts);
  }

  const dashParts = splitParts(cleaned, /\s[-\u2013\u2014]\s/);
  if (dashParts.length >= 2) {
    return buildFromParts(dashParts);
  }

  const pipeParts = splitParts(cleaned, /\s*\|\s*/);
  if (pipeParts.length >= 2) {
    return buildFromParts(pipeParts);
  }

  const commaParts = splitParts(cleaned, /\s*,\s*/);
  if (commaParts.length === 2) {
    return buildFromParts(commaParts);
  }

  return null;
}

function splitCandidateLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 1) {
    const single = lines[0];
    const semicolonSplit = single.split(/\s*;\s*/).map((line) => line.trim()).filter(Boolean);
    if (semicolonSplit.length > 1) {
      lines = semicolonSplit;
    } else {
      const bulletSplit = single
        .split(/\s*\u2022\s*/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (bulletSplit.length > 1) {
        lines = bulletSplit;
      }
    }
  }

  return lines;
}

function derivePlaylistName(lines: string[], parsedTracks: Array<ParsedTrack | null>): { name: string; startIndex: number } {
  let name = "My Migrated Playlist";
  let startIndex = 0;

  if (!lines.length) {
    return { name, startIndex };
  }

  const headerMatch = lines[0].match(/^playlist\s*[:\-]\s*(.+)$/i);
  if (headerMatch) {
    name = cleanField(headerMatch[1]) || name;
    startIndex = 1;
    return { name, startIndex };
  }

  if (!parsedTracks[0] && parsedTracks.slice(1).some((track) => track)) {
    name = cleanField(lines[0]) || name;
    startIndex = 1;
  }

  return { name, startIndex };
}

export async function parsePlaylistData(input: ParseInput): Promise<{ name: string; tracks: Track[] }> {
  if (typeof input !== "string") {
    throw new Error("Image parsing is not supported. Paste a text track list instead.");
  }

  const text = input.trim();
  if (!text) {
    throw new Error("Paste a track list to continue.");
  }

  const spotifyPlaylistId = extractSpotifyPlaylistId(text);
  if (spotifyPlaylistId) {
    return fetchSpotifyPlaylist(spotifyPlaylistId);
  }

  if (isStandaloneUrl(text)) {
    throw new Error("Only Spotify playlist links are supported. Paste the track list instead.");
  }

  const lines = splitCandidateLines(text);
  if (!lines.length) {
    throw new Error("No tracks found. Try one track per line.");
  }

  const parsedTracks = lines.map(parseTrackLine);
  const { name, startIndex } = derivePlaylistName(lines, parsedTracks);
  const trackList = parsedTracks
    .slice(startIndex)
    .filter((track): track is ParsedTrack => Boolean(track));

  if (!trackList.length) {
    throw new Error("No tracks found. Use formats like 'Song - Artist' or 'Artist - Song'.");
  }

  return {
    name,
    tracks: trackList.map((track, index) => ({
      ...track,
      id: `track-${index}`,
      status: "pending"
    }))
  };
}

export async function verifyAppleMusicMatch(
  track: Track
): Promise<{ confidence: number; matchFound: boolean }> {
  const title = track.title.trim();
  const artist = track.artist.trim();
  const album = track.album.trim();

  if (!title || !artist) {
    return { confidence: 0, matchFound: false };
  }

  let confidence = 0.65;
  if (title.length >= 4) {
    confidence += 0.1;
  }
  if (artist.length >= 3) {
    confidence += 0.1;
  }
  if (album) {
    confidence += 0.05;
  }

  const lowered = `${title} ${artist} ${album}`.toLowerCase();
  if (TITLE_HINTS.some((hint) => lowered.includes(hint))) {
    confidence -= 0.05;
  }

  confidence = Math.min(0.95, Math.max(0.35, confidence));
  return { confidence, matchFound: confidence >= 0.5 };
}
