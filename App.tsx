
import React, { useState, useEffect } from 'react';
import { PlaylistManifest, AppState } from './types';
import { parsePlaylistData, getUserPlaylists, fetchSpotifyPlaylist } from './services/playlistService';
import { authorizeUser, isAuthorized, searchAndMatchTrack, createPlaylist, initializeMusicKit } from './services/musicKitService';
import {
  Music,
  ArrowRight,
  Trash2,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ChevronRight,
  Music2,
  ListMusic,
  LogOut
} from 'lucide-react';

export default function App() {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [manifest, setManifest] = useState<PlaylistManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [isAppleAuthorized, setIsAppleAuthorized] = useState(false);
  const [transferProgress, setTransferProgress] = useState(0);

  // Migration State
  const [direction, setDirection] = useState<'spotify-to-apple' | 'apple-to-spotify'>('spotify-to-apple');

  // Spotify State
  const [spotifyToken, setSpotifyToken] = useState<string | null>(null);
  const [userPlaylists, setUserPlaylists] = useState<any[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);

  useEffect(() => {
    // Initialize MusicKit
    initializeMusicKit().then(() => {
      setIsAppleAuthorized(isAuthorized());
    }).catch(console.error);

    // Check for Spotify Token
    const hash = window.location.hash;
    if (hash.includes('spotify_token')) {
      const token = new URLSearchParams(hash.substring(1)).get('spotify_token');
      if (token) {
        setSpotifyToken(token);
        window.location.hash = '';
        fetchUserPlaylists(token);
      }
    }

    // Check for shared playlist
    const params = new URLSearchParams(window.location.search);
    const importId = params.get('import');
    if (importId) {
      // ... (existing import logic if needed, or handle differently)
    }
  }, []);

  const fetchUserPlaylists = async (token?: string) => {
    setLoadingPlaylists(true);
    try {
      let playlists = [];
      if (direction === 'spotify-to-apple') {
        if (token || spotifyToken) {
          playlists = await getUserPlaylists(token || spotifyToken!);
        }
      } else {
        if (isAppleAuthorized) {
          const { getAppleMusicUserPlaylists } = await import('./services/musicKitService');
          // @ts-ignore
          playlists = await getAppleMusicUserPlaylists();
        }
      }
      setUserPlaylists(playlists);
    } catch (e) {
      setError("Failed to load playlists.");
    } finally {
      setLoadingPlaylists(false);
    }
  };

  useEffect(() => {
    // Re-fetch playlists if direction changes
    fetchUserPlaylists();
  }, [direction, isAppleAuthorized, spotifyToken]);

  const handleSpotifyLogin = () => {
    window.location.href = '/api/spotify/login';
  };

  const handlePlaylistSelect = async (playlistId: string) => {
    setAppState(AppState.PROCESSING);
    setError(null);
    try {
      let data;
      if (direction === 'spotify-to-apple') {
        data = await fetchSpotifyPlaylist(playlistId, spotifyToken || undefined);
      } else {
        const { getAppleMusicPlaylist } = await import('./services/musicKitService');
        data = await getAppleMusicPlaylist(playlistId);
      }
      setManifest(data);
      setAppState(AppState.PREVIEW);
    } catch (err) {
      setError("Failed to load playlist tracks.");
      setAppState(AppState.IDLE);
    }
  };

  const handleTextSubmit = async () => {
    if (!pastedText.trim()) return;
    setAppState(AppState.PROCESSING);
    setError(null);
    try {
      const data = await parsePlaylistData(pastedText);
      setManifest(data);
      setAppState(AppState.PREVIEW);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to parse the track list.";
      setError(message);
      setAppState(AppState.IDLE);
    }
  };

  const handleAuthorize = async () => {
    try {
      await authorizeUser();
      setIsAppleAuthorized(true);
    } catch (e) {
      setError("Failed to authorize with Apple Music.");
    }
  };

  const startMigration = async () => {
    if (!manifest) return;
    setAppState(AppState.SYNCING);
    setTransferProgress(0);

    const updatedTracks = [...manifest.tracks];
    const trackIds: string[] = [];

    // Lazy load services based on direction
    const { searchAndMatchTrack, createPlaylist } = await import('./services/musicKitService');
    const { searchSpotifyTrack, createSpotifyPlaylist, addTracksToSpotifyPlaylist, getSpotifyProfile } = await import('./services/playlistService');

    for (let i = 0; i < updatedTracks.length; i++) {
      const track = updatedTracks[i];
      updatedTracks[i] = { ...track, status: 'matching' };
      setManifest(prev => prev ? { ...prev, tracks: [...updatedTracks] } : null);

      let matchedId: string | null = null;

      if (direction === 'spotify-to-apple') {
        matchedId = await searchAndMatchTrack(track);
      } else {
        if (spotifyToken) {
          matchedId = await searchSpotifyTrack(track, spotifyToken);
        }
      }

      if (matchedId) {
        trackIds.push(matchedId);
        updatedTracks[i] = { ...track, status: 'matched', confidence: 1.0 };
      } else {
        updatedTracks[i] = { ...track, status: 'failed' };
      }

      setManifest(prev => prev ? { ...prev, tracks: [...updatedTracks] } : null);
      setTransferProgress(Math.round(((i + 1) / updatedTracks.length) * 100));
      await new Promise(r => setTimeout(r, 50));
    }

    if (trackIds.length > 0) {
      try {
        if (direction === 'spotify-to-apple') {
          await createPlaylist(manifest.name, "Migrated via Spottle", trackIds);
        } else {
          if (spotifyToken) {
            const profile = await getSpotifyProfile(spotifyToken);
            const playlistId = await createSpotifyPlaylist(profile.id, manifest.name, spotifyToken);
            await addTracksToSpotifyPlaylist(playlistId, trackIds, spotifyToken);
          }
        }
        setAppState(AppState.COMPLETED);
      } catch (e) {
        setError("Failed to create playlist in target library.");
        setAppState(AppState.PREVIEW);
      }
    } else {
      setError("No tracks matched, cannot create empty playlist.");
      setAppState(AppState.PREVIEW);
    }
  };

  const reset = () => {
    setAppState(AppState.IDLE);
    setManifest(null);
    setPastedText('');
    setError(null);
    setTransferProgress(0);
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8">
      {/* Header */}
      <header className="w-full max-w-6xl flex justify-between items-center mb-12">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Music2 className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Spottle</h1>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-1">
          <div className="flex gap-4 items-center bg-slate-800/50 px-4 py-2 rounded-full border border-slate-700">
            {isAppleAuthorized ? (
              <div className="flex items-center gap-2 text-green-400 text-xs font-bold">
                <CheckCircle2 size={12} /> Connected to Apple Music
              </div>
            ) : (
              <button
                onClick={handleAuthorize}
                className="text-xs font-medium text-slate-300 hover:text-white hover:underline transition-colors"
              >
                Not connected to Apple Music (Login)
              </button>
            )}
          </div>
          <span className="text-[10px] text-slate-500 italic pr-2">Built for Melissa (but you can use it too)</span>
        </div>
      </header>

      <main className="w-full max-w-4xl flex flex-col gap-8">
        {/* Intro */}
        {appState === AppState.IDLE && (
          <div className="text-center space-y-4 mb-8">
            <h2 className="text-4xl md:text-5xl font-extrabold text-white">
              Bridge your playlists <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-indigo-500">
                directly to Apple Music
              </span>
            </h2>
            <p className="text-slate-400 text-lg max-w-xl mx-auto">
              Select a Spotify playlist or paste a link, and we'll recreate it in your Apple Music Library instantly.
            </p>
          </div>
        )}

        {/* Action Panel */}
        <div className="glass-morphism rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
          {appState === AppState.IDLE && (
            <div className="space-y-8">

              {/* Setup Connections */}
              <div className="flex flex-col md:flex-row gap-4 items-stretch relative">
                {/* Source Card */}
                <div className={`flex-1 p-6 rounded-2xl border transition-all ${direction === 'spotify-to-apple'
                    ? (spotifyToken ? 'bg-green-500/10 border-green-500/50' : 'bg-slate-800/50 border-slate-700')
                    : (isAppleAuthorized ? 'bg-red-500/10 border-red-500/50' : 'bg-slate-800/50 border-slate-700')
                  }`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${direction === 'spotify-to-apple' ? 'bg-[#1DB954] text-black' : 'bg-[#FA243C] text-white'}`}>
                      {direction === 'spotify-to-apple' ? <Music2 size={20} /> : <Music size={20} />}
                    </div>
                    {((direction === 'spotify-to-apple' && spotifyToken) || (direction === 'apple-to-spotify' && isAppleAuthorized)) &&
                      <CheckCircle2 className={direction === 'spotify-to-apple' ? "text-green-500" : "text-red-500"} size={20} />
                    }
                  </div>
                  <h3 className="font-bold text-white mb-1">{direction === 'spotify-to-apple' ? 'Spotify' : 'Apple Music'} (Source)</h3>
                  <p className="text-xs text-slate-400 mb-4 h-10">
                    {direction === 'spotify-to-apple'
                      ? 'Connect Spotify to access your playlists.'
                      : 'Connect Apple Music to access your library.'}
                  </p>

                  {direction === 'spotify-to-apple' ? (
                    !spotifyToken ? (
                      <button onClick={handleSpotifyLogin} className="w-full py-2 bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold rounded-lg transition-all text-sm">Connect Spotify</button>
                    ) : (
                      <button onClick={() => { setSpotifyToken(null); setUserPlaylists([]); }} className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-all text-sm">Disconnect</button>
                    )
                  ) : (
                    !isAppleAuthorized ? (
                      <button onClick={handleAuthorize} className="w-full py-2 bg-[#FA243C] hover:bg-[#ff364e] text-white font-bold rounded-lg transition-all text-sm">Connect Apple Music</button>
                    ) : (
                      <div className="w-full py-2 bg-transparent text-red-400 font-medium text-center text-sm border border-red-500/30 rounded-lg cursor-default">Connected</div>
                    )
                  )}
                </div>

                {/* Swap Button */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 hidden md:block">
                  <button
                    onClick={() => setDirection(d => d === 'spotify-to-apple' ? 'apple-to-spotify' : 'spotify-to-apple')}
                    className="bg-slate-800 p-2 rounded-full border border-slate-600 hover:border-indigo-500 hover:text-indigo-400 text-slate-400 shadow-xl transition-all"
                  >
                    <ArrowRight size={20} />
                  </button>
                </div>
                {/* Mobile Swap */}
                <div className="flex justify-center md:hidden -my-2 z-10">
                  <button
                    onClick={() => setDirection(d => d === 'spotify-to-apple' ? 'apple-to-spotify' : 'spotify-to-apple')}
                    className="bg-slate-800 p-2 rounded-full border border-slate-600 hover:border-indigo-500 hover:text-indigo-400 text-slate-400 shadow-xl transition-all rotate-90"
                  >
                    <ArrowRight size={20} />
                  </button>
                </div>

                {/* Target Card */}
                <div className={`flex-1 p-6 rounded-2xl border transition-all ${direction === 'apple-to-spotify'
                    ? (spotifyToken ? 'bg-green-500/10 border-green-500/50' : 'bg-slate-800/50 border-slate-700')
                    : (isAppleAuthorized ? 'bg-red-500/10 border-red-500/50' : 'bg-slate-800/50 border-slate-700')
                  }`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${direction === 'apple-to-spotify' ? 'bg-[#1DB954] text-black' : 'bg-[#FA243C] text-white'}`}>
                      {direction === 'apple-to-spotify' ? <Music2 size={20} /> : <Music size={20} />}
                    </div>
                    {((direction === 'apple-to-spotify' && spotifyToken) || (direction === 'spotify-to-apple' && isAppleAuthorized)) &&
                      <CheckCircle2 className={direction === 'apple-to-spotify' ? "text-green-500" : "text-red-500"} size={20} />
                    }
                  </div>
                  <h3 className="font-bold text-white mb-1">{direction === 'apple-to-spotify' ? 'Spotify' : 'Apple Music'} (Target)</h3>
                  <p className="text-xs text-slate-400 mb-4 h-10">
                    {direction === 'apple-to-spotify'
                      ? 'Connect Spotify to create playlists.'
                      : 'Authorize Apple Music to create playlists.'}
                  </p>

                  {direction === 'apple-to-spotify' ? (
                    !spotifyToken ? (
                      <button onClick={handleSpotifyLogin} className="w-full py-2 bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold rounded-lg transition-all text-sm">Connect Spotify</button>
                    ) : (
                      <button onClick={() => { setSpotifyToken(null); setUserPlaylists([]); }} className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-all text-sm">Disconnect</button>
                    )
                  ) : (
                    !isAppleAuthorized ? (
                      <button onClick={handleAuthorize} className="w-full py-2 bg-[#FA243C] hover:bg-[#ff364e] text-white font-bold rounded-lg transition-all text-sm">Connect Apple Music</button>
                    ) : (
                      <div className="w-full py-2 bg-transparent text-red-400 font-medium text-center text-sm border border-red-500/30 rounded-lg cursor-default">Connected</div>
                    )
                  )}
                </div>
              </div>

              {/* Playlist Picker (If Source Connected) */}
              {((direction === 'spotify-to-apple' && spotifyToken) || (direction === 'apple-to-spotify' && isAppleAuthorized)) && (
                <div className="bg-slate-800/30 rounded-2xl border border-slate-700 overflow-hidden">
                  <div className="p-4 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
                    <h3 className="font-bold text-white flex items-center gap-2">
                      <ListMusic size={18} className="text-indigo-400" />
                      Select a Playlist
                    </h3>
                    <span className="text-xs text-slate-500">{userPlaylists.length} playlists found</span>
                  </div>

                  <div className="max-h-64 overflow-y-auto space-y-1 p-2 scrollbar-thin scrollbar-thumb-slate-700">
                    {loadingPlaylists ? (
                      <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-500" /></div>
                    ) : (
                      userPlaylists.map(pl => (
                        <button
                          key={pl.id}
                          onClick={() => handlePlaylistSelect(pl.id)}
                          className="w-full text-left p-2 hover:bg-slate-700/50 rounded-lg transition-colors flex items-center gap-3 group"
                        >
                          {pl.images?.[0]?.url ? (
                            <img src={pl.images[0].url} className="w-10 h-10 rounded shadow-md object-cover" alt="" />
                          ) : (
                            <div className="w-10 h-10 bg-slate-700 rounded flex items-center justify-center"><Music size={16} /></div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-200 group-hover:text-white truncate">{pl.name}</div>
                            <div className="text-xs text-slate-500">{pl.tracks.total} tracks</div>
                          </div>
                          <ChevronRight className="ml-auto text-slate-600 group-hover:text-indigo-400" size={16} />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-700" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-[#0f172a] px-2 text-slate-500">Or paste raw text</span>
                </div>
              </div>

              <div className="relative group">
                <textarea
                  className="w-full h-24 bg-slate-800/50 border border-slate-700 rounded-2xl p-4 text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none text-base"
                  placeholder="Paste a Spotify link or 'Song - Artist' list..."
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                />
              </div>

              <button
                onClick={handleTextSubmit}
                disabled={!pastedText.trim()}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20 group"
              >
                Parse Manual Input
                <ChevronRight className="group-hover:translate-x-1 transition-transform" />
              </button>

              {error && (
                <div className="flex items-center gap-2 text-red-400 bg-red-400/10 p-4 rounded-xl border border-red-400/20">
                  <AlertCircle size={20} />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}
            </div>
          )}

          {appState === AppState.PROCESSING && (
            <div className="flex flex-col items-center justify-center py-20 space-y-6">
              <div className="relative">
                <Loader2 className="animate-spin text-indigo-500 w-20 h-20" />
                <Music className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-300 w-8 h-8" />
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-bold mb-2">Analyzing Playlist...</h3>
                <p className="text-slate-400 max-w-xs mx-auto">
                  Preparing your tracks for migration.
                </p>
              </div>
            </div>
          )}

          {(appState === AppState.PREVIEW || appState === AppState.SYNCING || appState === AppState.COMPLETED) && manifest && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-slate-700 pb-6 gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 rounded text-[10px] font-bold tracking-wider">MANIFEST</div>
                    <h3 className="text-2xl font-bold text-white">{manifest.name}</h3>
                  </div>
                  <p className="text-slate-400">{manifest.tracks.length} tracks identified</p>
                </div>
                {appState === AppState.PREVIEW && (
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button onClick={reset} className="p-3 hover:bg-slate-700 rounded-xl transition-colors text-slate-400 border border-slate-700">
                      <Trash2 size={20} />
                    </button>
                    {!isAppleAuthorized ? (
                      <button
                        onClick={handleAuthorize}
                        className="flex-1 sm:flex-none px-8 py-3 bg-red-500 hover:bg-red-400 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-red-600/30"
                      >
                        <Music size={18} />
                        Login to Apple Music
                      </button>
                    ) : (
                      <button
                        onClick={startMigration}
                        className="flex-1 sm:flex-none px-8 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30"
                      >
                        Transfer to Library
                        <ArrowRight size={18} />
                      </button>
                    )}
                  </div>
                )}
                {appState === AppState.COMPLETED && (
                  <button
                    onClick={reset}
                    className="w-full sm:w-auto px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold border border-slate-600"
                  >
                    Transfer Another
                  </button>
                )}
              </div>

              <div className="max-h-[400px] overflow-y-auto pr-2 space-y-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                {manifest.tracks.map((track, i) => (
                  <div
                    key={track.id}
                    className="flex items-center justify-between p-4 bg-slate-800/40 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-slate-500 font-mono text-sm w-4">{i + 1}</span>
                      <div>
                        <p className="font-semibold text-white leading-tight">{track.title}</p>
                        <p className="text-sm text-slate-400">{track.artist} {track.album ? `• ${track.album} ` : ''}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {track.status === 'pending' && <div className="w-2 h-2 rounded-full bg-slate-600" />}
                      {track.status === 'matching' && <Loader2 className="animate-spin text-indigo-500" size={18} />}
                      {track.status === 'matched' && (
                        <div className="flex flex-col items-end">
                          <CheckCircle2 className="text-green-500" size={18} />
                        </div>
                      )}
                      {track.status === 'failed' && (
                        <div className="flex items-center gap-1 text-red-400 text-xs font-medium">
                          <AlertCircle size={14} />
                          Not Found
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {appState === AppState.SYNCING && (
                <div className="bg-indigo-600/10 border border-indigo-500/20 p-5 rounded-2xl flex items-center gap-4 animate-pulse">
                  <div className="w-10 h-10 bg-indigo-500/20 rounded-full flex items-center justify-center">
                    <Loader2 className="animate-spin text-indigo-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-indigo-400">Migrating Tracks...</p>
                    <p className="text-xs text-slate-400">Searching catalog and adding to your library.</p>
                  </div>
                  <div className="text-lg font-mono font-bold text-indigo-400">
                    {transferProgress}%
                  </div>
                </div>
              )}

              {appState === AppState.COMPLETED && (
                <div className="flex flex-col items-center justify-center p-8 bg-green-500/10 border border-green-500/20 rounded-3xl space-y-4">
                  <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center shadow-lg shadow-green-500/30">
                    <CheckCircle2 className="text-white w-8 h-8" />
                  </div>
                  <h2 className="text-3xl font-bold text-white">Migration Complete!</h2>
                  <p className="text-slate-300 text-center max-w-md">
                    The playlist <strong>{manifest.name}</strong> has been created in your Apple Music Library.
                  </p>
                  <a
                    href="https://music.apple.com/library/playlists"
                    target="_blank"
                    rel="noreferrer"
                    className="px-6 py-3 bg-white text-slate-900 rounded-xl font-bold hover:bg-slate-200 transition-colors flex items-center gap-2"
                  >
                    <ListMusic size={18} />
                    Open Apple Music
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Features / Benefits */}
        {appState === AppState.IDLE && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            <FeatureCard
              icon={<Music className="text-indigo-400" />}
              title="Smart Search"
              description="We search the Apple Music catalog for the best match for every track."
            />
            <FeatureCard
              icon={<CheckCircle2 className="text-green-400" />}
              title="Direct Integration"
              description="Tracks are added directly to your iCloud Music Library instantly."
            />
            <FeatureCard
              icon={<ListMusic className="text-amber-400" />}
              title="Full Playlists"
              description="Migrate entire playlists without size limits."
            />
          </div>
        )}
      </main>

      <footer className="mt-auto py-8 text-slate-500 text-xs flex flex-col items-center gap-2">
        <p>Made with ❤️ for Melissa by her brother. (Currently accepting "Best Brother" awards)</p>
        <div className="flex gap-4">
          <span className="hover:text-indigo-400 cursor-pointer transition-colors underline decoration-slate-700 underline-offset-4">Terms</span>
          <span className="hover:text-indigo-400 cursor-pointer transition-colors underline decoration-slate-700 underline-offset-4">Privacy</span>
          <span className="hover:text-indigo-400 cursor-pointer transition-colors underline decoration-slate-700 underline-offset-4">API Status</span>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="glass-morphism p-6 rounded-2xl space-y-3 hover:border-indigo-500/50 transition-colors group cursor-default">
      <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center group-hover:bg-indigo-500/10 transition-colors">
        {icon}
      </div>
      <h4 className="font-bold text-white">{title}</h4>
      <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}
