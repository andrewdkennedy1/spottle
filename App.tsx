
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Track, PlaylistManifest, AppState } from './types';
import { parsePlaylistData, verifyAppleMusicMatch } from './services/geminiService';
import { 
  Music, 
  ArrowRight, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Loader2, 
  Upload, 
  Camera,
  AlertCircle,
  Smartphone,
  ChevronRight,
  Music2,
  Link,
  QrCode,
  ExternalLink,
  Copy
} from 'lucide-react';

export default function App() {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [manifest, setManifest] = useState<PlaylistManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [isUrlDetected, setIsUrlDetected] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    setIsUrlDetected(urlPattern.test(pastedText));
  }, [pastedText]);

  const handleTextSubmit = async () => {
    if (!pastedText.trim()) return;
    setAppState(AppState.PROCESSING);
    setError(null);
    try {
      const data = await parsePlaylistData(pastedText);
      setManifest(data);
      setAppState(AppState.PREVIEW);
    } catch (err) {
      setError("Failed to process playlist data. If using a link, ensure it is public.");
      setAppState(AppState.IDLE);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAppState(AppState.PROCESSING);
    setError(null);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = (e.target?.result as string).split(',')[1];
        const data = await parsePlaylistData({ data: base64Data, mimeType: file.type });
        setManifest(data);
        setAppState(AppState.PREVIEW);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("Failed to read image. Please try again.");
      setAppState(AppState.IDLE);
    }
  };

  const startMigration = async () => {
    if (!manifest) return;
    setAppState(AppState.SYNCING);
    
    const updatedTracks = [...manifest.tracks];
    
    for (let i = 0; i < updatedTracks.length; i++) {
      updatedTracks[i] = { ...updatedTracks[i], status: 'matching' };
      setManifest(prev => prev ? { ...prev, tracks: [...updatedTracks] } : null);
      
      try {
        const verification = await verifyAppleMusicMatch(updatedTracks[i]);
        updatedTracks[i] = { 
          ...updatedTracks[i], 
          status: verification.matchFound ? 'matched' : 'failed',
          confidence: verification.confidence
        };
      } catch (e) {
        updatedTracks[i] = { ...updatedTracks[i], status: 'failed' };
      }
      
      setManifest(prev => prev ? { ...prev, tracks: [...updatedTracks] } : null);
      await new Promise(r => setTimeout(r, 150));
    }
    
    setAppState(AppState.COMPLETED);
  };

  const reset = () => {
    setAppState(AppState.IDLE);
    setManifest(null);
    setPastedText('');
    setError(null);
  };

  // Generate a simulated Apple Music import URL
  const getAppleMusicLink = () => {
    if (!manifest) return '';
    const matchedTracks = manifest.tracks.filter(t => t.status === 'matched');
    const query = matchedTracks.map(t => `${t.title} ${t.artist}`).join(',');
    return `https://music.apple.com/library/playlist/new?name=${encodeURIComponent(manifest.name)}&items=${encodeURIComponent(query)}`;
  };

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getAppleMusicLink())}&bgcolor=1e293b&color=ffffff&margin=10`;

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8">
      {/* Header */}
      <header className="w-full max-w-6xl flex justify-between items-center mb-12">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Music2 className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">SoundBridge <span className="text-indigo-500">AI</span></h1>
        </div>
        <div className="hidden sm:flex gap-4 items-center bg-slate-800/50 px-4 py-2 rounded-full border border-slate-700">
          <div className="flex -space-x-2">
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center ring-2 ring-slate-900 border border-green-400">
               <span className="text-[8px] font-bold">SP</span>
            </div>
            <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center ring-2 ring-slate-900 border border-red-400">
               <span className="text-[8px] font-bold">AM</span>
            </div>
          </div>
          <span className="text-xs font-medium text-slate-300">Spotify → Apple Music</span>
        </div>
      </header>

      <main className="w-full max-w-4xl flex flex-col gap-8">
        {/* Intro */}
        {appState === AppState.IDLE && (
          <div className="text-center space-y-4 mb-8">
            <h2 className="text-4xl md:text-5xl font-extrabold text-white">
              Transfer your music <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-red-500">
                seamlessly with AI
              </span>
            </h2>
            <p className="text-slate-400 text-lg max-w-xl mx-auto">
              Paste a Spotify playlist link, raw song lists, or even upload a screenshot. Gemini will find the matches on Apple Music.
            </p>
          </div>
        )}

        {/* Action Panel */}
        <div className="glass-morphism rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
          {appState === AppState.IDLE && (
            <div className="space-y-6">
              <div className="relative group">
                <textarea
                  className="w-full h-48 bg-slate-800/50 border border-slate-700 rounded-2xl p-6 text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none text-lg leading-relaxed"
                  placeholder="Paste a Spotify Playlist Link or song list here..."
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                />
                
                <div className="absolute top-4 right-4 flex gap-2">
                  {isUrlDetected && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs font-bold border border-green-500/30 animate-pulse">
                      <Link size={14} /> Link Detected
                    </div>
                  )}
                </div>

                <div className="absolute bottom-4 right-4 flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-medium transition-colors border border-slate-600"
                  >
                    <Camera size={16} />
                    Screenshot
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                </div>
              </div>

              <button
                onClick={handleTextSubmit}
                disabled={!pastedText.trim()}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20 group"
              >
                {isUrlDetected ? 'Fetch Playlist Content' : 'Analyze Track List'}
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
                <h3 className="text-2xl font-bold mb-2">Gemini is Reading...</h3>
                <p className="text-slate-400 max-w-xs mx-auto">
                  {isUrlDetected 
                    ? "Browsing the Spotify link to extract track metadata and album art information." 
                    : "Processing your input to create a structured migration manifest."
                  }
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
                    <button 
                      onClick={startMigration}
                      className="flex-1 sm:flex-none px-8 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30"
                    >
                      Start Apple Music Match
                      <ArrowRight size={18} />
                    </button>
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
                        <p className="text-sm text-slate-400">{track.artist} {track.album ? `• ${track.album}` : ''}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {track.status === 'pending' && <div className="w-2 h-2 rounded-full bg-slate-600" />}
                      {track.status === 'matching' && <Loader2 className="animate-spin text-indigo-500" size={18} />}
                      {track.status === 'matched' && (
                        <div className="flex flex-col items-end">
                          <CheckCircle2 className="text-green-500" size={18} />
                          {track.confidence && (
                            <span className="text-[10px] text-green-500/70">{(track.confidence * 100).toFixed(0)}% match</span>
                          )}
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
                    <p className="text-sm font-bold text-indigo-400">Verifying on Apple Music</p>
                    <p className="text-xs text-slate-400">Comparing metadata to ensure high-fidelity matching.</p>
                  </div>
                  <div className="text-lg font-mono font-bold text-indigo-400">
                    {Math.round((manifest.tracks.filter(t => t.status === 'matched' || t.status === 'failed').length / manifest.tracks.length) * 100)}%
                  </div>
                </div>
              )}

              {appState === AppState.COMPLETED && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-900/60 p-8 rounded-3xl border border-slate-700/50">
                  <div className="flex flex-col justify-center space-y-4">
                    <div className="w-12 h-12 bg-green-500/20 rounded-2xl flex items-center justify-center">
                      <CheckCircle2 className="text-green-500" size={32} />
                    </div>
                    <h4 className="text-2xl font-bold text-white">Import Ready!</h4>
                    <p className="text-slate-400 text-sm leading-relaxed">
                      We found {manifest.tracks.filter(t => t.status === 'matched').length} of your tracks. 
                      Scan the QR code with your phone to open Apple Music and finalize the import.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <a 
                        href={getAppleMusicLink()} 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-red-600/20"
                      >
                        <ExternalLink size={14} /> Open Link
                      </a>
                      <button 
                        onClick={() => navigator.clipboard.writeText(getAppleMusicLink())}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-bold transition-all"
                      >
                        <Copy size={14} /> Copy URL
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl shadow-inner">
                    <img 
                      src={qrCodeUrl} 
                      alt="Import QR Code" 
                      className="w-48 h-48 mb-3"
                    />
                    <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-widest">
                      <QrCode size={14} /> Scan to Import
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Features / Benefits */}
        {appState === AppState.IDLE && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            <FeatureCard 
              icon={<Link className="text-indigo-400" />}
              title="Spotify Link Support"
              description="Simply paste a public Spotify URL and let Gemini crawl the metadata for you."
            />
            <FeatureCard 
              icon={<QrCode className="text-green-400" />}
              title="QR Magic Import"
              description="Generate a scan-and-go code to move your library to your mobile device instantly."
            />
            <FeatureCard 
              icon={<Camera className="text-purple-400" />}
              title="Visual OCR"
              description="Snapshot any playlist on any device. Gemini handles the complex text recognition."
            />
          </div>
        )}
      </main>

      <footer className="mt-auto py-8 text-slate-500 text-xs flex flex-col items-center gap-2">
        <p>&copy; 2024 SoundBridge AI. Powered by Google Gemini 3 Pro.</p>
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
