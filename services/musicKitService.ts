import { Track } from "../types";

// Type definitions for MusicKit
// These are minimal definitions needed for our use case
declare global {
    interface Window {
        MusicKit: any;
    }
}

let musicKitInstance: any = null;

export async function initializeMusicKit(): Promise<any> {
    if (musicKitInstance) return musicKitInstance;

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
        const result = await mk.api.library.playlists(null, { limit: 100 });
        return result.map((p: any) => ({
            id: p.id,
            name: p.attributes.name,
            tracks: { total: p.attributes.trackCount || 0 } // heuristics, might need detailed fetch if trackCount missing
        }));
    } catch (e: any) {
        if (e.status === '403' || e.httpStatusCode === 403) {
            throw new Error("SUBSCRIPTION_REQUIRED");
        }
        console.error("Failed to fetch Apple Music playlists", e);
        return [];
    }
}

export async function getAppleMusicPlaylist(playlistId: string): Promise<{ name: string; tracks: Track[] }> {
    const mk = window.MusicKit.getInstance();
    const playlist = await mk.api.library.playlist(playlistId);

    // tracks might need to be fetched if not fully hydrated or paginated, 
    // but for now assumig simple access
    const tracksRel = playlist.relationships?.tracks?.data || [];

    return {
        name: playlist.attributes.name,
        tracks: tracksRel.map((t: any) => ({
            id: t.id,
            title: t.attributes.name,
            artist: t.attributes.artistName,
            album: t.attributes.albumName,
            status: 'pending' // Default status for migration
        }))
    };
}
