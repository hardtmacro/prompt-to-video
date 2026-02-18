'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, Wand2, Volume2, Image as ImageIcon,
  Loader2, Sparkles, VolumeX, RotateCcw, User, 
  AlertCircle, ScrollText, Send
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const generateImage = async (imagePrompt: string, signal?: AbortSignal): Promise<string> => {
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imagePrompt }),
        signal,
      });
      
      if (!res.ok) throw new Error('Image failed');
      const data = await res.json();
      return data.url || data.image || '';
    } catch (err) {
      // Return placeholder SVG - light background for visibility
      return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect fill="#f0f0f0" width="800" height="600"/><rect fill="#ddd" x="0" y="450" width="800" height="150"/><text x="400" y="300" text-anchor="middle" fill="#333" font-size="32" font-family="system-ui">Image Placeholder</text></svg>`)}`;
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
      if (!res.ok) return null;
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch (err) {
      return null;
    }
  };

  const playNodeAudio = useCallback(async (node: DialogueNode): Promise<void> => {
    if (isMuted || !node.audioUrl || !audioRef.current) return;
    return new Promise((resolve) => {
      audioRef.current!.src = node.audioUrl!;
      audioRef.current!.onended = () => resolve();
      audioRef.current!.onerror = () => resolve();
      audioRef.current!.play().catch(() => resolve());
    });
  }, [isMuted]);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    
    // Clean up previous generation
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    
    // Cancel any ongoing speech synthesis
    window.speechSynthesis?.cancel();
    
    // Pause any playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    setIsGenerating(true);
    setError(null);
    setCurrentIndex(0);
    setIsPlaying(false);
    isPlayingRef.current = false;

    const script = generateScript(prompt);
    const initialNodes: DialogueNode[] = script.map((item, idx) => ({
      id: `node-${idx}`,
      characterName: item.name,
      text: item.text,
      imagePrompt: item.imagePrompt,
      voiceId: item.voiceId,
      status: 'pending',
    }));

    setDialogueNodes(initialNodes);

    try {
      for (let i = 0; i < initialNodes.length; i++) {
        if (signal.aborted) break;

        setDialogueNodes(prev => prev.map((n, idx) => idx === i ? { ...n, status: 'loading' } : n));

        const [imageUrl, audioUrl] = await Promise.all([
          generateImage(initialNodes[i].imagePrompt, signal),
          generateSpeech(initialNodes[i].text, initialNodes[i].voiceId, signal),
        ]);

        if (!signal.aborted) {
          setDialogueNodes(prev => prev.map((n, idx) => 
            idx === i ? { ...n, imageUrl, audioUrl: audioUrl || undefined, status: 'ready' } : n
          ));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const playNextNode = useCallback(async (index: number) => {
    if (!isPlayingRef.current || index >= dialogueNodes.length) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      return;
    }

    const node = dialogueNodes[index];
    if (node.status === 'ready') {
      setCurrentIndex(index);
      nodeRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Try to play audio, but continue even if it fails
      if (node.audioUrl) {
        await playNodeAudio(node);
      }
      
      // Always advance to next node after a delay, regardless of audio
      if (isPlayingRef.current) {
        setTimeout(() => playNextNode(index + 1), 500);
      }
    } else {
      // If node is not ready, skip to next
      if (isPlayingRef.current) {
        setTimeout(() => playNextNode(index + 1), 100);
      }
    }
  }, [dialogueNodes, playNodeAudio]);

  const handlePlayPause = () => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
    } else {
      setIsPlaying(true);
      isPlayingRef.current = true;
      playNextNode(currentIndex);
    }
  };

  const handleReset = () => {
    if (abortRef.current) abortRef.current.abort();
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    setIsPlaying(false);
    isPlayingRef.current = false;
    setCurrentIndex(0);
    setDialogueNodes([]);
    setPrompt('');
    setError(null);
  };

  const hasContent = dialogueNodes.length > 0;
  const allReady = hasContent && dialogueNodes.every(n => n.status === 'ready');

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-indigo-500/30">
      <audio ref={audioRef} className="hidden" />

      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400">
              StoryGen AI
            </h1>
          </div>
          
          {hasContent && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 hover:bg-neutral-800 rounded-lg transition-colors text-sm font-medium"
              >
                <RotateCcw className="w-4 h-4" /> Reset
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {!hasContent ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-2xl mx-auto text-center space-y-8"
            >
              <div className="space-y-4">
                <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
                  Turn any prompt into a <span className="text-indigo-500">cinematic story</span>
                </h2>
                <p className="text-neutral-400 text-lg">
                  Enter a theme or world, and we'll generate a scripted scene with visuals and voiceovers.
                </p>
              </div>

              <div className="relative group">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. A cyberpunk neon city during a crimson rainstorm..."
                  className="w-full h-40 bg-neutral-900 border border-neutral-800 rounded-2xl p-6 text-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none group-hover:border-neutral-700 shadow-2xl"
                />
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !prompt.trim()}
                  className="absolute bottom-4 right-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500 px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-xl hover:scale-105 active:scale-95"
                >
                  {isGenerating ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Generating...</>
                  ) : (
                    <><Send className="w-5 h-5" /> Generate Story</>
                  )}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              {/* Generation progress / controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    onClick={handlePlayPause}
                    disabled={!allReady && dialogueNodes.every(n => n.status !== 'ready')}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500 rounded-xl font-bold transition-all hover:scale-105 active:scale-95"
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    {isPlaying ? 'Pause' : 'Play'}
                  </button>
                  
                  {isGenerating && (
                    <div className="flex items-center gap-2 text-indigo-400">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Generating {currentIndex + 1}/{dialogueNodes.length}</span>
                    </div>
                  )}
                </div>
                
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors text-sm font-medium"
                >
                  <Wand2 className="w-4 h-4" /> Regenerate
                </button>
              </div>

              {/* Dialogue nodes */}
              <div className="space-y-6">
                {dialogueNodes.map((node, idx) => (
                  <motion.div
                    key={node.id}
                    ref={(el) => { nodeRefs.current[idx] = el; }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={clsx(
                      "bg-neutral-900 rounded-2xl border overflow-hidden transition-all",
                      currentIndex === idx 
                        ? "border-indigo-500 ring-2 ring-indigo-500/20" 
                        : "border-neutral-800"
                    )}
                  >
                    <div className="flex flex-col lg:flex-row">
                      {/* Image section */}
                      <div className="lg:w-1/2 relative bg-neutral-950 min-h-[300px] lg:min-h-[400px]">
                        {node.status === 'loading' ? (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                          </div>
                        ) : node.imageUrl ? (
                          <img 
                            src={node.imageUrl} 
                            alt={node.imagePrompt}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback if image fails to load
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent) {
                                const placeholder = document.createElement('div');
                                placeholder.className = 'w-full h-full flex items-center justify-center bg-neutral-800 text-neutral-400';
                                placeholder.textContent = 'Image Placeholder';
                                parent.appendChild(placeholder);
                              }
                            }}
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <ImageIcon className="w-12 h-12 text-neutral-700" />
                          </div>
                        )}
                      </div>
                      
                      {/* Text section */}
                      <div className="lg:w-1/2 p-6 flex flex-col justify-center">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-white" />
                          </div>
                          <span className="font-bold text-indigo-400">{node.characterName}</span>
                          {node.status === 'loading' && (
                            <Loader2 className="w-4 h-4 text-indigo-500 animate-spin ml-auto" />
                          )}
                        </div>
                        
                        <p className="text-lg leading-relaxed text-neutral-200">
                          {node.text}
                        </p>
                        
                        {node.error && (
                          <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
                            <AlertCircle className="w-4 h-4" />
                            {node.error}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}