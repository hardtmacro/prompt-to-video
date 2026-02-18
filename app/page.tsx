'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, Wand2, Volume2, Image as ImageIcon,
  Loader2, Sparkles, VolumeX, RotateCcw, User, 
  AlertCircle, ScrollText
} from 'lucide-react';
import { clsx } from 'clsx';

interface DialogueNode {
  id: string;
  characterName: string;
  text: string;
  imagePrompt: string;
  imageUrl?: string;
  audioUrl?: string;
  status: 'pending' | 'loading' | 'ready' | 'error';
  error?: string;
  voiceId: string;
}

const VOICES = ['en-us-male-1', 'en-us-female-1', 'en-gb-male-1', 'en-gb-female-1'];

function generateScript(userPrompt: string): Array<{ name: string; text: string; imagePrompt: string; voiceId: string }> {
  const theme = userPrompt.trim();
  const stylePrefix = `Cinematic ${theme} art style, hyper-realistic, 8k resolution, dramatic lighting, consistent character design, concept art, epic composition, professional color grading, atmospheric depth. `;
  
  return [
    { name: 'Narrator', text: `The world of ${theme} was once a paradise, until the shifting began.`, imagePrompt: `${stylePrefix}Epic landscape of ${theme} world, establishing shot.`, voiceId: VOICES[0] },
    { name: 'Kaelen', text: `I can't believe the legends were true. The ${theme} core is actually here.`, imagePrompt: `${stylePrefix}Kaelen, a young explorer, looking in awe at a glowing artifact.`, voiceId: VOICES[2] },
    { name: 'Lyra', text: `Watch your step, Kaelen. This place hasn't seen a living soul in centuries.`, imagePrompt: `${stylePrefix}Lyra, a skilled tracker, holding a glowing lantern, cautious expression.`, voiceId: VOICES[1] },
    { name: 'The Watcher', text: `Who dares disturb the silence of the ${theme} sanctuary?`, imagePrompt: `${stylePrefix}A giant stone statue with glowing eyes, coming to life.`, voiceId: VOICES[0] },
    { name: 'Kaelen', text: `We come in peace! We only seek to restore the balance of ${theme}.`, imagePrompt: `${stylePrefix}Kaelen raising hands in peace, artifact glowing between them.`, voiceId: VOICES[2] },
    { name: 'The Watcher', text: `Restoration requires sacrifice. Are you prepared to give what is necessary?`, imagePrompt: `${stylePrefix}The Watcher's face close up, ancient and stern.`, voiceId: VOICES[0] },
    { name: 'Lyra', text: `We didn't come this far to turn back now. Tell us what must be done.`, imagePrompt: `${stylePrefix}Lyra stepping forward, determined gaze.`, voiceId: VOICES[1] },
    { name: 'The Watcher', text: `Then touch the core. Let ${theme} judge the purity of your intent.`, imagePrompt: `${stylePrefix}The artifact erupting in brilliant light, illuminating the chamber.`, voiceId: VOICES[0] },
    { name: 'Kaelen', text: `It's warm... like a heartbeat. The whole world is breathing through this.`, imagePrompt: `${stylePrefix}Close up of hands touching the glowing core, energy tendrils spreading.`, voiceId: VOICES[2] },
    { name: 'Narrator', text: `As the light faded, the ${theme} realm began its slow transformation back to its former glory.`, imagePrompt: `${stylePrefix}The landscape from the first scene, now lush and vibrant.`, voiceId: VOICES[0] },
  ];
}

export default function PromptToVideo() {
  const [prompt, setPrompt] = useState('');
  const [dialogueNodes, setDialogueNodes] = useState<DialogueNode[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isGeneratingRef = useRef(false);
  
  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  // Scroll active node into view
  useEffect(() => {
    if (isPlaying && nodeRefs.current[currentIndex]) {
      nodeRefs.current[currentIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentIndex, isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dialogueNodes.forEach(node => {
        if (node.audioUrl?.startsWith('blob:')) {
          try { URL.revokeObjectURL(node.audioUrl); } catch {}
        }
      });
      if (abortRef.current) abortRef.current.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      if (!prev && audioRef.current) {
        audioRef.current.pause();
      }
      return !prev;
    });
  }, []);

  const generateImage = async (imagePrompt: string, signal?: AbortSignal, retryCount = 0): Promise<string> => {
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imagePrompt }),
        signal,
      });
      
      if (!res.ok) {
        if (res.status === 504 && retryCount < 1) return generateImage(imagePrompt, signal, retryCount + 1);
        
        // Return a fallback SVG placeholder instead of throwing
        return `data:image/svg+xml,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
            <rect fill="#1a1a2e" width="800" height="600"/>
            <circle cx="400" cy="250" r="60" fill="#6366f1" opacity="0.8"/>
            <text x="400" y="400" text-anchor="middle" fill="#a5b4fc" font-family="system-ui" font-size="20">Image generation placeholder</text>
            <text x="400" y="440" text-anchor="middle" fill="#818cf8" font-family="system-ui" font-size="14">Theme: ${imagePrompt.substring(0, 30)}...</text>
          </svg>
        `)}`;
      }
      
      const data = await res.json();
      return data.url || data.image || '';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (retryCount < 1) return generateImage(imagePrompt, signal, retryCount + 1);

      return `data:image/svg+xml,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
          <rect fill="#1e1b4b" width="800" height="600"/>
          <circle cx="400" cy="300" r="80" fill="#4f46e5" opacity="0.6"/>
          <text x="400" y="400" text-anchor="middle" fill="#c7d2fe" font-family="system-ui" font-size="18">Content unavailable</text>
        </svg>
      `)}`;
    }
  };

  const generateSpeech = async (text: string, voiceId: string, signal?: AbortSignal): Promise<string | null> => {
    try {
      const res = await fetch('/api/text-to-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: voiceId }),
        signal,
      });
      
      if (!res.ok) throw new Error('Speech failed');

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('audio')) {
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      }
      return null;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      return null;
    }
  };

  const playNodeAudio = useCallback(async (node: DialogueNode): Promise<void> => {
    if (isMuted) return;

    if (node.audioUrl) {
      return new Promise<void>((resolve, reject) => {
        if (!audioRef.current) { resolve(); return; }
        audioRef.current.src = node.audioUrl!;
        audioRef.current.onended = () => resolve();
        audioRef.current.onerror = () => reject(new Error('Audio playback error'));
        audioRef.current.play().catch(reject);
      });
    }
  }, [isMuted]);

  const generateAllContent = useCallback(async (script: Array<{ name: string; text: string; imagePrompt: string; voiceId: string }>) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    
    setIsGenerating(true);
    setError(null);

    const nodes: DialogueNode[] = script.map((item, idx) => ({
      id: `node-${idx}`,
      characterName: item.name,
      text: item.text,
      imagePrompt: item.imagePrompt,
      voiceId: item.voiceId,
      status: 'pending' as const,
    }));

    setDialogueNodes(nodes);

    for (let i = 0; i < nodes.length; i++) {
      if (signal.aborted) break;

      setDialogueNodes(prev => prev.map((n, idx) => 
        idx === i ? { ...n, status: 'loading' } : n
      ));

      try {
        const [imageUrl, audioUrl] = await Promise.all([
          generateImage(nodes[i].imagePrompt, signal),
          generateSpeech(nodes[i].text, nodes[i].voiceId, signal),
        ]);

        if (!signal.aborted) {
          setDialogueNodes(prev => prev.map((n, idx) => 
            idx === i ? { ...n, imageUrl, audioUrl: audioUrl || undefined, status: 'ready' } : n
          ));
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setDialogueNodes(prev => prev.map((n, idx) => 
            idx === i ? { ...n, status: 'error', error: err.message } : n
          ));
        }
      }
    }

    setIsGenerating(false);
  }, []);

  const handleGenerate = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isGeneratingRef.current) return;
    
    const script = generateScript(trimmedPrompt);
    await generateAllContent(script);
  }, [prompt, generateAllContent]);

  const playNextNode = useCallback(async (index: number, nodes: DialogueNode[]) => {
    if (!isPlayingRef.current || index >= nodes.length) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      return;
    }

    const node = nodes[index];
    if (node.status === 'ready') {
      setCurrentIndex(index);
      try {
        await playNodeAudio(node);
      } catch {}
    }

    // Wait for audio + small delay, then play next
    setTimeout(() => {
      if (isPlayingRef.current) {
        playNextNode(index + 1, nodes);
      }
    }, (node.audioUrl ? 3000 : 2000));
  }, [playNodeAudio]);

  const handlePlayPause = useCallback(() => {
    if (isPlayingRef.current) {
      audioRef.current?.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
    } else {
      setIsPlaying(true);
      isPlayingRef.current = true;
      setDialogueNodes(prev => {
        playNextNode(currentIndex, prev);
        return prev;
      });
    }
  }, [currentIndex, playNextNode]);

  const handleReset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    audioRef.current?.pause();
    setIsPlaying(false);
    isPlayingRef.current = false;
    setCurrentIndex(0);
    setDialogueNodes(prev => {
      prev.forEach(node => {
        if (node.audioUrl?.startsWith('blob:')) {
          try { URL.revokeObjectURL(node.audioUrl); } catch {}
        }
      });
      return [];
    });
    setError(null);
    setPrompt(''); // Clear the input field
  }, []);

  const setNodeRef = useCallback((idx: number) => (el: HTMLDivElement | null) => {
    nodeRefs.current[idx] = el;
  }, []);

  const hasContent = dialogueNodes.length > 0;
  const readyNodes = dialogueNodes.filter(n => n.status === 'ready');
  const canPlay = readyNodes.length > 0 && !isGenerating;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Hidden audio element */}
      <audio ref={audioRef} preload="auto" />

      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-indigo-400" />
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Story Generator
            </h1>
          </div>
          
          {hasContent && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                aria-label="Reset all content"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Input Section */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your story theme"
              className="flex-1 px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            />
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isGenerating}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-medium rounded-xl transition-all hover:shadow-lg hover:shadow-indigo-500/25 disabled:shadow-none"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5" />
                  Generate Story
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded-xl flex items-center gap-3 text-red-400"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p>{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Story Preview */}
        <AnimatePresence mode="wait">
          {hasContent ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* Playback Controls */}
              <div className="flex items-center justify-between p-4 bg-neutral-900 rounded-xl border border-neutral-800">
                <div className="flex items-center gap-4">
                  <button
                    onClick={handlePlayPause}
                    disabled={!canPlay}
                    className="flex items-center justify-center w-12 h-12 bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-full transition-all hover:shadow-lg hover:shadow-indigo-500/25 disabled:shadow-none"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5 ml-0.5" />
                    )}
                  </button>
                  <div>
                    <p className="text-sm font-medium text-neutral-300">
                      {isPlaying ? 'Playing...' : readyNodes.length > 0 ? 'Ready to play' : 'Generating...'}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {readyNodes.length} / {dialogueNodes.length} scenes ready
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={toggleMute}
                  className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? (
                    <VolumeX className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>
              </div>

              {/* Dialogue Nodes */}
              <div className="space-y-4">
                {dialogueNodes.map((node, idx) => (
                  <motion.div
                    key={node.id}
                    ref={setNodeRef(idx)}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={clsx(
                      'p-4 rounded-xl border transition-all',
                      idx === currentIndex && isPlaying
                        ? 'bg-indigo-900/20 border-indigo-500/50 shadow-lg shadow-indigo-500/10'
                        : 'bg-neutral-900 border-neutral-800'
                    )}
                  >
                    <div className="flex items-start gap-4">
                      {/* Character Avatar */}
                      <div className={clsx(
                        'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                        node.characterName === 'Narrator' ? 'bg-amber-500/20 text-amber-400' :
                        node.characterName === 'The Watcher' ? 'bg-purple-500/20 text-purple-400' :
                        'bg-indigo-500/20 text-indigo-400'
                      )}>
                        {node.characterName === 'Narrator' ? (
                          <ScrollText className="w-5 h-5" />
                        ) : node.characterName === 'The Watcher' ? (
                          <AlertCircle className="w-5 h-5" />
                        ) : (
                          <User className="w-5 h-5" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-neutral-200">{node.characterName}</span>
                          {node.status === 'loading' && (
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                          )}
                          {node.status === 'error' && (
                            <AlertCircle className="w-4 h-4 text-red-400" />
                          )}
                        </div>
                        
                        <p className="text-neutral-300 mb-3">{node.text}</p>

                        {/* Image */}
                        {node.imageUrl ? (
                          <div className="relative rounded-lg overflow-hidden bg-neutral-800 mb-3">
                            <img
                              src={node.imageUrl}
                              alt={node.imagePrompt}
                              className="w-full h-auto object-cover"
                            />
                          </div>
                        ) : node.status === 'loading' ? (
                          <div className="w-full h-48 bg-neutral-800 rounded-lg flex items-center justify-center mb-3">
                            <Loader2 className="w-8 h-8 animate-spin text-neutral-600" />
                          </div>
                        ) : null}

                        {/* Error message */}
                        {node.error && (
                          <p className="text-sm text-red-400">{node.error}</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <div className="w-20 h-20 mx-auto mb-6 bg-neutral-900 rounded-full flex items-center justify-center">
                <Wand2 className="w-10 h-10 text-neutral-600" />
              </div>
              <h2 className="text-xl font-semibold text-neutral-400 mb-2">Create Your Story</h2>
              <p className="text-neutral-500 max-w-md mx-auto">
                Enter a theme above and watch as AI generates an immersive story with images and voice narration.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}