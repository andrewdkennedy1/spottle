import { Track } from "../types";

// Type definitions for MusicKit
// These are minimal definitions needed for our use case
declare global {
    interface Window {
        MusicKit: any;
    }
}

let musicKitInstance: any = null;

function normalizeResourceArray(value: any): any[] {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (Array.isArray(value.data)) return value.data;
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.data?.data)) return value.data.data;
    if (Array.isArray(value.data?.items)) return value.data.items;
    if (Array.isArray(value.results)) return value.results;
    return [];
}

function pickFirstResource(value: any): any | null {
    const items = normalizeResourceArray(value);
    if (items.length) return items[0];
    if (value?.data && !Array.isArray(value.data)) return value.data;
    return value ?? null;
}

export async function initializeMusicKit(): Promise<any> {
    if (musicKitInstance) return musicKitInstance;

    try {
        // Wait for the script to load if it hasn't yet
        if (!window.MusicKit) {
            let attempts = 0;
            while (!window.MusicKit && attempts < 10) {
                await new Promise(r => setTimeout(r, 500));
                attempts++;
            }
        }

        if (!window.MusicKit) {
            throw new Error("MusicKit JS not loaded");
        }

        console.log("Fetching Apple developer token...");
        const response = await fetch("/api/apple-token");
        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Failed to fetch developer token: ${response.status} ${errBody}`);
        }
        const { token } = await response.json();
        console.log("Developer token received. Configuring MusicKit...");

        musicKitInstance = await window.MusicKit.configure({
            developerToken: token,
            app: {
                name: "Spottle",
                build: "1.0.0"
            }
        });

        console.log("MusicKit configured successfully.");
        return musicKitInstance;
    } catch (error) {
        console.error("CRITICAL: Failed to initialize MusicKit", error);
        throw error;
    }
}

export async function authorizeUser(): Promise<boolean> {
    try {
        const mk = await initializeMusicKit();
        console.log("Initiating Apple Music authorization...");
        await mk.authorize();
        console.log("Authorization completed. Status:", mk.isAuthorized);
        return mk.isAuthorized;
    } catch (e) {
        console.error("Apple Music Authorization Error:", e);
        return false;
    }
}

export function isAuthorized(): boolean {
    if (!window.MusicKit) return false;
    const instance = window.MusicKit.getInstance();
    return instance ? instance.isAuthorized : false;
}

export async function searchAndMatchTrack(track: Track): Promise<string | null> {
    const mk = window.MusicKit.getInstance();
    const term = `${track.title} ${track.artist}`.replace(/[\(\)\[\]]/g, ""); // Clean search term

    try {
        const result = await mk.api.search(term, { types: ["songs"], limit: 3 });
        const songs = result.songs?.data;

        if (!songs || songs.length === 0) return null;

        // Simple heuristic: First result usually best, but could add fuzzy matching logic here
        // For now, trusting Apple's search relevance
        return songs[0].id;
    } catch (e) {
        console.warn(`Search failed for ${term}`, e);
        return null;
    }
}

export async function createPlaylist(name: string, description: string, trackIds: string[]): Promise<any> {
    const mk = window.MusicKit.getInstance();

    // Create playlist
    // Note: MusicKit doesn't support creating with tracks in one go easily via the JS wrapper sometimes,
    // but looking at docs, we might need to create then add.
    // Using the documented `library.playlist.create`

    const payload = {
        attributes: {
            name: name,
            description: description
        },
        relationships: {
            tracks: {
                data: trackIds.map(id => ({ id, type: "songs" }))
            }
        }
    };

    return mk.api.library.playlist.create(payload);
}

export async function getAppleMusicUserPlaylists(): Promise<{ id: string; name: string; tracks: { total: number } }[]> {
    const mk = window.MusicKit.getInstance();
    if (!mk.isAuthorized) return [];

    try {
        let result: any;
        try {
            result = await mk.api.library.playlists({ limit: 100 });
        } catch (err) {
            result = await mk.api.library.playlists(null, { limit: 100 });
        }

        const playlists = normalizeResourceArray(result);
        return playlists.map((p: any) => ({
            id: p.id,
            name: p.attributes?.name ?? "Untitled Playlist",
            tracks: { total: p.attributes?.trackCount ?? 0 }
        }));
    } catch (e: any) {
        if (e.status === 403 || e.status === "403" || e.httpStatusCode === 403) {
            throw new Error("SUBSCRIPTION_REQUIRED");
        }
        console.error("Failed to fetch Apple Music playlists", e);
        throw e;
    }
}

export async function getAppleMusicPlaylist(playlistId: string): Promise<{ name: string; tracks: Track[] }> {
    const mk = window.MusicKit.getInstance();
    const playlistResponse = await mk.api.library.playlist(playlistId, { include: "tracks" });
    const playlist = pickFirstResource(playlistResponse);

    const included = normalizeResourceArray((playlistResponse as any)?.included);
    const includedById = new Map(included.map((item: any) => [item.id, item]));

    const trackRefs = normalizeResourceArray(
        playlist?.relationships?.tracks?.data ?? playlist?.tracks?.data ?? playlist?.tracks
    );
    const sourceTracks = trackRefs.length ? trackRefs : included;

    const tracks = sourceTracks
        .map((t: any) => {
            const resolved = includedById.get(t.id) ?? t;
            const title = resolved.attributes?.name ?? "";
            const artist = resolved.attributes?.artistName ?? "";
            if (!title || !artist) return null;
            return {
                id: resolved.id ?? t.id,
                title: title,
                artist: artist,
                album: resolved.attributes?.albumName ?? "",
                status: "pending" as const
            };
        })
        .filter((track: Track | null): track is Track => Boolean(track));

    return {
        name: playlist?.attributes?.name ?? "Apple Music Playlist",
        tracks
    };
}
