
export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  status: 'pending' | 'matching' | 'matched' | 'failed';
  confidence?: number;
}

export interface PlaylistManifest {
  name: string;
  tracks: Track[];
}

export enum AppState {
  IDLE,
  PROCESSING,
  PREVIEW,
  SYNCING,
  COMPLETED
}
