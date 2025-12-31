export interface MusicKitInstance {
    authorize(): Promise<void>;
    unauthorize(): Promise<void>;
    isAuthorized: boolean;
    api: {
        library: {
            playlist: {
                create(attributes: { name: string; description?: string }, relationships?: { tracks: { data: { id: string; type: string }[] } }): Promise<any>;
            }
        };
        search(term: string, options?: { types: string[]; limit: number }): Promise<any>;
    };
}

export interface MusicKitGlobal {
    configure(configuration: { developerToken: string; app: { name: string; build: string } }): Promise<MusicKitInstance>;
    getInstance(): MusicKitInstance;
}

declare global {
    interface Window {
        MusicKit: MusicKitGlobal;
    }
}
