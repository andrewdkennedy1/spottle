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

    try {
        const response = await fetch("/api/apple-token");
        if (!response.ok) throw new Error("Failed to fetch developer token");
        const { token } = await response.json();

        musicKitInstance = await window.MusicKit.configure({
            developerToken: token,
            app: {
                name: "SoundBridge",
                build: "1.0.0"
            }
        });

        return musicKitInstance;
    } catch (error) {
        console.error("Failed to initialize MusicKit", error);
        throw error;
    }
}

export async function authorizeUser(): Promise<void> {
    const mk = await initializeMusicKit();
    await mk.authorize();
}

export function isAuthorized(): boolean {
    if (!window.MusicKit) return false;
    return window.MusicKit.getInstance()?.isAuthorized ?? false;
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
