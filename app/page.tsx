'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, Wand2, Volume2, Image as ImageIcon,
  Loader2, Sparkles, ChevronLeft, ChevronRight,
  VolumeX, Info, RotateCcw, User, AlertCircle
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
}

const CHARACTER_VOICES: Record<string, { rate?: number; pitch?: number; voiceName?: string }> = {
  'Narrator': { rate: 0.9, pitch: 1.0, voiceName: 'Google UK English Male' },
  'The Seeker': { rate: 1.0, pitch: 1.1, voiceName: 'Google US English' },
  'Ancient Guide': { rate: 0.85, pitch: 0.8, voiceName: 'Google UK English Male' },
  'Forest Spirit': { rate: 1.1, pitch: 1.3, voiceName: 'Google US English' },
  'Iron Guardian': { rate: 0.75, pitch: 0.7, voiceName: 'Google UK English Male' },
  'The Oracle': { rate: 0.8, pitch: 1.2, voiceName: 'Google US English' },
  'Village Elder': { rate: 0.85, pitch: 0.85, voiceName: 'Google UK English Male' },
  'Lost Wanderer': { rate: 1.0, pitch: 1.0, voiceName: 'Google US English' },
  'Gate Keeper': { rate: 0.8, pitch: 0.9, voiceName: 'Google UK English Male' },
  'Mystic Sage': { rate: 0.9, pitch: 1.1, voiceName: 'Google US English' },
  'Shadow Weaver': { rate: 0.95, pitch: 0.75, voiceName: 'Google UK English Male' },
  'Light Bringer': { rate: 1.05, pitch: 1.25, voiceName: 'Google US English' },
};

function generateScript(userPrompt: string): Array<{ name: string; text: string; imagePrompt: string }> {
  const theme = userPrompt.trim();
  const stylePrefix = `Cinematic ${theme} art style, hyper-realistic, 8k resolution, dramatic lighting, consistent character design, concept art, epic composition, professional color grading, atmospheric depth. `;
  
  return [
    { name: 'Narrator', text: `In the heart of the ${theme} realm, a legacy long forgotten begins to stir once more.`, imagePrompt: `${stylePrefix}An epic panoramic view of the ${theme} world, landscape shot, grand scale.` },
    { name: 'The Seeker', text: `I have crossed the obsidian plains just to stand here. The ${theme} energy is pulsing beneath my feet.`, imagePrompt: `${stylePrefix}Close-up of The Seeker, determined eyes, ${theme} landscape reflected in pupils.` },
    { name: 'Ancient Guide', text: `Many have sought the core of ${theme}, young one. Few have returned with their souls intact.`, imagePrompt: `${stylePrefix}A weathered Ancient Guide holding a glowing staff, standing in a stone archway.` },
    { name: 'Forest Spirit', text: `Do you hear it? The trees of ${theme} whisper your name. They know why you have come.`, imagePrompt: `${stylePrefix}Ethereal Forest Spirit made of light and leaves, merging with the ${theme} background.` },
    { name: 'Iron Guardian', text: `HALT. None shall pass into the inner sanctum of ${theme} without the Mark of Sovereignty.`, imagePrompt: `${stylePrefix}A massive Iron Guardian towering over the path, metallic armor glinting.` },
    { name: 'The Oracle', text: `The threads of fate are tangled. In ${theme}, your past and future are colliding at this very moment.`, imagePrompt: `${stylePrefix}The Oracle peering into a pool of liquid light, face partially obscured by veils.` },
    { name: 'Village Elder', text: `We have waited generations for a sign. Could you truly be the one the legends of ${theme} foretold?`, imagePrompt: `${stylePrefix}An elderly villager in traditional ${theme} robes, hands clasped in prayer.` },
    { name: 'Lost Wanderer', text: `Don't trust the shadows here. I've been trapped in ${theme} for years... or perhaps it's only been minutes.`, imagePrompt: `${stylePrefix}A disheveled Wanderer hiding behind a jagged rock, fearful expression.` },
    { name: 'Gate Keeper', text: `Unlock the mechanism, and you unlock the truth. But remember: some doors are meant to stay closed.`, imagePrompt: `${stylePrefix}A mysterious Gate Keeper standing before a giant intricate clockwork door.` },
    { name: 'Shadow Weaver', text: `Your light is blinding. Let the darkness of ${theme} embrace you. Resistance is only temporary.`, imagePrompt: `${stylePrefix}A dark silhouette figure weaving strands of black smoke, ominous atmosphere.` },
    { name: 'Light Bringer', text: `Hold fast! The dawn is coming. ${theme} will be reborn through your courage.`, imagePrompt: `${stylePrefix}A radiant hero holding a brilliant sword, light erupting from the center.` },
    { name: 'Mystic Sage', text: `The circle is complete. The power of ${theme} is now yours to command. Use it wisely.`, imagePrompt: `${stylePrefix}A Sage standing at the peak of a mountain, ${theme} energy swirling around them.` },
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
  const promptRef = useRef(prompt);
  const voicesLoadedRef = useRef(false);
  
  promptRef.current = prompt;

  // Load voices on mount
  useEffect(() => {
    const loadVoices = () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          voicesLoadedRef.current = true;
        }
      }
    };
    
    loadVoices();
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoices);
    
    return () => {
      window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

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

  const generateImage = async (imagePrompt: string, signal?: AbortSignal): Promise<string> => {
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imagePrompt }),
        signal,
      });
      
      if (!res.ok) {
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
      // Return fallback on any error
      return `data:image/svg+xml,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
          <rect fill="#1e1b4b" width="800" height="600"/>
          <circle cx="400" cy="300" r="80" fill="#4f46e5" opacity="0.6"/>
          <text x="400" y="400" text-anchor="middle" fill="#c7d2fe" font-family="system-ui" font-size="18">Content unavailable</text>
        </svg>
      `)}`;
    }
  };

  const generateSpeech = async (text: string, signal?: AbortSignal): Promise<string | null> => {
    try {
      const res = await fetch('/api/text-to-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal,
      });
      
      if (!res.ok) return null;

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
        audioRef.current.onerror = () => reject(new Error('Playback failed'));
        audioRef.current.play().catch(() => resolve()); // Resolve on error to continue
      });
    }

    return new Promise<void>((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) { resolve(); return; }
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(node.text);
      const voiceSettings = CHARACTER_VOICES[node.characterName] || {};
      utterance.rate = voiceSettings.rate ?? 0.95;
      utterance.pitch = voiceSettings.pitch ?? 1.0;
      
      // Wait for voices if not loaded
      const trySetVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          const matchingVoice = voices.find(v => v.name.includes(voiceSettings.voiceName || ''));
          if (matchingVoice) utterance.voice = matchingVoice;
        }
      };
      
      if (voicesLoadedRef.current) {
        trySetVoice();
      } else {
        window.speechSynthesis.addEventListener('voiceschanged', function onVoices() {
          trySetVoice();
          window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
        }, { once: true });
      }

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }, [isMuted]);

  const handleGenerateAll = async () => {
    const currentPrompt = promptRef.current;
    if (!currentPrompt.trim()) {
      setError('Please enter a theme');
      return;
    }
    
    // Cancel any ongoing generation
    if (abortRef.current) {
      abortRef.current.abort();
    }
    window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    isPlayingRef.current = false;
    
    setIsGenerating(true);
    setError(null);
    abortRef.current = new AbortController();
    
    try {
      const script = generateScript(currentPrompt);
      const initialNodes: DialogueNode[] = script.map((item, idx) => ({
        id: `node-${idx}`,
        characterName: item.name,
        text: item.text,
        imagePrompt: item.imagePrompt,
        status: 'pending' as const,
      }));
      
      setDialogueNodes(initialNodes);
      setCurrentIndex(0);
      
      // Process nodes sequentially
      for (let i = 0; i < initialNodes.length; i++) {
        if (abortRef.current?.signal.aborted) break;
        
        setDialogueNodes(prev => prev.map((node, idx) => 
          idx === i ? { ...node, status: 'loading' as const } : node
        ));
        
        try {
          const [imageUrl, audioUrl] = await Promise.all([
            generateImage(initialNodes[i].imagePrompt, abortRef.current?.signal),
            generateSpeech(initialNodes[i].text, abortRef.current?.signal).catch(() => null)
          ]);

          setDialogueNodes(prev => prev.map((node, idx) => 
            idx === i ? { ...node, imageUrl, audioUrl: audioUrl || undefined, status: 'ready' as const } : node
          ));
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') break;
          console.error(`Error loading node ${i}:`, err);
          setDialogueNodes(prev => prev.map((node, idx) => 
            idx === i ? { ...node, status: 'error' as const, error: 'Failed to generate' } : node
          ));
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message || 'Generation failed');
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  };

  const handlePlayPause = async () => {
    if (isPlaying) {
      window.speechSynthesis.cancel();
      if (audioRef.current) audioRef.current.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
    } else {
      setIsPlaying(true);
      isPlayingRef.current = true;
      
      // Find next ready node from current position
      let i = currentIndex;
      while (i < dialogueNodes.length && isPlayingRef.current) {
        setCurrentIndex(i);
        const node = dialogueNodes[i];
        
        if (node.status === 'ready') {
          await playNodeAudio(node);
        } else if (node.status === 'loading') {
          // Wait for loading to complete
          let attempts = 0;
          while (dialogueNodes[i]?.status === 'loading' && attempts < 30 && isPlayingRef.current) {
            await new Promise(r => setTimeout(r, 500));
            attempts++;
          }
          if (dialogueNodes[i]?.status === 'ready') {
            await playNodeAudio(dialogueNodes[i]);
          }
        }
        
        i++;
        
        if (i >= dialogueNodes.length) {
          setIsPlaying(false);
          isPlayingRef.current = false;
        }
      }
    }
  };

  const handleReset = useCallback(() => {
    dialogueNodes.forEach(node => {
      if (node.audioUrl?.startsWith('blob:')) {
        try { URL.revokeObjectURL(node.audioUrl); } catch {}
      }
    });
    setDialogueNodes([]);
    setCurrentIndex(0);
    setPrompt('');
    setError(null);
    if (audioRef.current) audioRef.current.pause();
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    isPlayingRef.current = false;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [dialogueNodes]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      window.speechSynthesis.cancel();
      if (audioRef.current) audioRef.current.pause();
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < dialogueNodes.length - 1) {
      window.speechSynthesis.cancel();
      if (audioRef.current) audioRef.current.pause();
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, dialogueNodes.length]);

  const currentNode = dialogueNodes[currentIndex];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-purple-500/30">
      <audio ref={audioRef} className="hidden" preload="none" />
      
      <main className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-3 mb-4"
          >
            <Sparkles className="w-8 h-8 text-purple-400" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
              Story Weave
            </h1>
            <Sparkles className="w-8 h-8 text-pink-400" />
          </motion.div>
          <p className="text-neutral-400 text-lg">Transform your imagination into an interactive story experience</p>
        </header>

        {/* Input Section */}
        <motion.section 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-8"
        >
          <div className="bg-neutral-900/50 backdrop-blur-sm border border-neutral-800 rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerateAll()}
                placeholder="Enter a theme (e.g., 'Cyberpunk City', 'Ancient Dragon', 'Space Odyssey')"
                className="flex-1 px-5 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                disabled={isGenerating}
              />
              <button
                onClick={handleGenerateAll}
                disabled={isGenerating || !prompt.trim()}
                className={clsx(
                  'px-8 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all',
                  isGenerating || !prompt.trim()
                    ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40'
                )}
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
            
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 flex items-center gap-2 text-red-400 bg-red-950/30 px-4 py-2 rounded-lg"
              >
                <AlertCircle className="w-5 h-5" />
                {error}
              </motion.div>
            )}
          </div>
        </motion.section>

        {/* Content Display */}
        <AnimatePresence mode="wait">
          {dialogueNodes.length > 0 && currentNode && (
            <motion.section
              key={currentNode.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="mb-8"
            >
              {/* Image Display */}
              <div className="relative aspect-video bg-neutral-900 rounded-2xl overflow-hidden mb-6 border border-neutral-800">
                {currentNode.status === 'loading' ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
                    <div className="text-center">
                      <Loader2 className="w-12 h-12 animate-spin text-purple-500 mx-auto mb-4" />
                      <p className="text-neutral-400">Creating visual...</p>
                    </div>
                  </div>
                ) : currentNode.imageUrl ? (
                  <img 
                    src={currentNode.imageUrl} 
                    alt={`Scene: ${currentNode.characterName}`}
                    className="w-full h-full object-contain bg-neutral-900"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
                    <div className="text-center">
                      <ImageIcon className="w-16 h-16 text-neutral-700 mx-auto mb-4" />
                      <p className="text-neutral-500">No image available</p>
                    </div>
                  </div>
                )}
                
                {/* Character badge */}
                <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2">
                  <User className="w-4 h-4 text-purple-400" />
                  <span className="font-medium text-white">{currentNode.characterName}</span>
                </div>
                
                {/* Status indicator */}
                <div className="absolute top-4 right-4">
                  {currentNode.status === 'error' ? (
                    <span className="bg-red-500/80 px-3 py-1 rounded-full text-xs font-medium">Error</span>
                  ) : currentNode.status === 'ready' ? (
                    <span className="bg-green-500/80 px-3 py-1 rounded-full text-xs font-medium">Ready</span>
                  ) : (
                    <span className="bg-yellow-500/80 px-3 py-1 rounded-full text-xs font-medium">Loading</span>
                  )}
                </div>
              </div>

              {/* Dialogue Text */}
              <div className="bg-neutral-900/50 backdrop-blur-sm border border-neutral-800 rounded-2xl p-6 mb-4">
                <p className="text-xl sm:text-2xl leading-relaxed text-neutral-200">
                  {currentNode.text}
                </p>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between">
                <button
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  className={clsx(
                    'px-4 py-2 rounded-lg flex items-center gap-2 transition-all',
                    currentIndex === 0
                      ? 'text-neutral-600 cursor-not-allowed'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                  )}
                >
                  <ChevronLeft className="w-5 h-5" />
                  Previous
                </button>

                <span className="text-neutral-500">
                  {currentIndex + 1} / {dialogueNodes.length}
                </span>

                <button
                  onClick={handleNext}
                  disabled={currentIndex === dialogueNodes.length - 1}
                  className={clsx(
                    'px-4 py-2 rounded-lg flex items-center gap-2 transition-all',
                    currentIndex === dialogueNodes.length - 1
                      ? 'text-neutral-600 cursor-not-allowed'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                  )}
                >
                  Next
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Controls - Always visible when there's content */}
        {dialogueNodes.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-0 left-0 right-0 bg-neutral-900/90 backdrop-blur-lg border-t border-neutral-800 py-4"
          >
            <div className="max-w-6xl mx-auto px-4 flex items-center justify-center gap-4">
              {/* Reset */}
              <button
                onClick={handleReset}
                className="p-3 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-all"
                title="Reset"
              >
                <RotateCcw className="w-5 h-5" />
              </button>

              {/* Play/Pause */}
              <button
                onClick={handlePlayPause}
                disabled={dialogueNodes.every(n => n.status !== 'ready')}
                className={clsx(
                  'p-4 rounded-full transition-all',
                  dialogueNodes.every(n => n.status !== 'ready')
                    ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
                    : isPlaying
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-purple-600 hover:bg-purple-500 text-white'
                )}
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6" />
                ) : (
                  <Play className="w-6 h-6" />
                )}
              </button>

              {/* Mute toggle */}
              <button
                onClick={toggleMute}
                className={clsx(
                  'p-3 rounded-full transition-all',
                  isMuted 
                    ? 'bg-neutral-700 text-red-400' 
                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white'
                )}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>
            </div>
          </motion.section>
        )}

        {/* Empty state */}
        {dialogueNodes.length === 0 && !isGenerating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-neutral-900 mb-6">
              <Wand2 className="w-10 h-10 text-neutral-600" />
            </div>
            <h2 className="text-2xl font-semibold text-neutral-300 mb-2">Ready to Create</h2>
            <p className="text-neutral-500 max-w-md mx-auto">
              Enter a theme above and click Generate Story to create an immersive narrative experience with AI-generated images and voice narration.
            </p>
          </motion.div>
        )}
      </main>
    </div>
  );
}