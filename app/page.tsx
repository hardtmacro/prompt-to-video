'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Play, Pause, Wand2, Volume2, Image as ImageIcon,
  Loader2, Sparkles, ChevronLeft, ChevronRight,
  VolumeX, Info, RotateCcw
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
}

const CHARACTER_VOICES: Record<string, { rate?: number; pitch?: number; voiceName?: string }> = {
  'Narrator': { rate: 0.9, pitch: 1.0, voiceName: 'Google UK English Male' },
  'Seeker': { rate: 1.0, pitch: 1.1, voiceName: 'Google US English' },
  'Guide': { rate: 0.85, pitch: 0.9, voiceName: 'Google UK English Male' },
  'Spirit': { rate: 0.95, pitch: 1.2, voiceName: 'Google US English' },
  'Guardian': { rate: 0.8, pitch: 0.8, voiceName: 'Google UK English Male' },
  'Oracle': { rate: 0.85, pitch: 1.15, voiceName: 'Google US English' },
  'Elder': { rate: 0.85, pitch: 0.85, voiceName: 'Google UK English Male' },
  'Wanderer': { rate: 1.0, pitch: 1.1, voiceName: 'Google US English' },
  'Keeper': { rate: 0.8, pitch: 0.9, voiceName: 'Google UK English Male' },
  'Sage': { rate: 0.85, pitch: 1.0, voiceName: 'Google US English' },
};

function generateScript(userPrompt: string): Array<{ name: string; text: string; imagePrompt: string }> {
  const theme = userPrompt.trim();
  
  // Story arc: 10 nodes with clear beginning, middle, and end
  return [
    { name: 'Narrator', text: `In the world of ${theme}, a tale of transformation is about to unfold. The stage is set, and destiny awaits those bold enough to seek it.`, imagePrompt: `cinematic wide establishing shot, ${theme} world, dramatic golden hour lighting, epic scale, movie poster style, consistent color palette, dark atmospheric` },
    { name: 'Seeker', text: `I've traveled far to find this place. They say ${theme} holds the answers I've been searching for my entire life.`, imagePrompt: `close-up portrait of determined traveler, ${theme} in background, warm cinematic lighting, consistent visual theme, dramatic shadows` },
    { name: 'Guide', text: `Many come to ${theme} seeking glory, but few understand what true power costs. Are you prepared for the journey ahead?`, imagePrompt: `wise mentor figure standing in doorway, ${theme} environment, mystical atmosphere, consistent lighting style, cinematic composition` },
    { name: 'Wanderer', text: `The path before you is not what it seems. ${theme} has many secrets hidden in shadow and light.`, imagePrompt: `enigmatic wanderer on rocky path, ${theme} landscape, moody lighting, consistent dark cinematic theme, movie poster style` },
    { name: 'Spirit', text: `The path through ${theme} is not for the faint of heart. You must first understand yourself before you can conquer your fears.`, imagePrompt: `ethereal spirit guide appearing from mist, ${theme} mystical realm, supernatural glow, consistent visual style` },
    { name: 'Mystic', text: `The path through ${theme} reveals hidden truths. Only by facing your inner self can you truly proceed.`, imagePrompt: `mysterious mystic figure surrounded by glowing runes, ${theme} ancient chamber, ethereal light, consistent cinematic theme` },
    { name: 'Guardian', text: `You have come far, but the final trial awaits. Only those who truly understand ${theme} can pass through these gates.`, imagePrompt: `formidable guardian at gate, ${theme} fortress, imposing presence, consistent dark cinematic theme` },
    { name: 'Challenger', text: `The heart of ${theme} calls to those brave enough to face it. Your final test begins now.`, imagePrompt: `brave challenger facing great obstacle, ${theme} dramatic moment, powerful composition, cinematic style, consistent theme` },
    { name: 'Elder', text: `The answers you seek are closer than you think. Look within yourself, and you will find the truth of ${theme}.`, imagePrompt: `ancient elder in meditation, ${theme} sacred grove, soft divine light, consistent mystical theme` },
    { name: 'Oracle', text: `The wisdom you seek lies not in the destination, but in the journey itself. You have already found what you were looking for.`, imagePrompt: `mysterious oracle figure shrouded in light, ${theme} temple, divine glow, consistent mystical theme` },
    { name: 'Sage', text: `Remember, in ${theme} and beyond, true power comes from understanding, not force. Go now and share what you have learned.`, imagePrompt: `venerable sage and student together, ${theme} peaceful ending scene, warm colors, consistent movie poster style` },
  ];
}

export default function PromptToVideo() {
  const [prompt, setPrompt] = useState('');
  const [dialogueNodes, setDialogueNodes] = useState<DialogueNode[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // FIX: Add a ref to track the current prompt value for use in event handlers
  // This ensures we always have the latest prompt value even in closures
  const promptRef = useRef(prompt);
  promptRef.current = prompt;

  useEffect(() => {
    return () => {
      dialogueNodes.forEach(node => {
        if (node.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(node.audioUrl);
        if ( node.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(node.imageUrl);
      });
    };
  }, [dialogueNodes]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      if (!prev && audioRef.current) {
        audioRef.current.pause();
      }
      return !prev;
    });
  }, []);

  const generateImage = async (imagePrompt: string, signal?: AbortSignal): Promise<string> => {
    const res = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: imagePrompt }),
      signal,
    });
    if (!res.ok) throw new Error(`Image API error: ${res.status}`);
    const data = await res.json();
    return data.url || data.image || '';
  };

  const generateSpeech = async (text: string, signal?: AbortSignal): Promise<string | null> => {
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
    const data = await res.json();
    if (data.fallback) return null;
    return null;
  };

  const playNodeAudio = useCallback(async (node: DialogueNode): Promise<void> => {
    if (isMuted) return;

    if (node.audioUrl) {
      return new Promise<void>((resolve, reject) => {
        if (!audioRef.current) { resolve(); return; }
        audioRef.current.src = node.audioUrl!;
        audioRef.current.onended = () => resolve();
        audioRef.current.onerror = () => reject(new Error('Playback failed'));
        audioRef.current.play().catch(reject);
      });
    }

    return new Promise<void>((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) { resolve(); return; }
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(node.text);
      
      const voiceSettings = CHARACTER_VOICES[node.characterName] || {};
      utterance.rate = voiceSettings.rate ?? 0.95;
      utterance.pitch = voiceSettings.pitch ?? 1.0;
      
      if (voiceSettings.voiceName) {
        const voices = window.speechSynthesis.getVoices();
        const matchingVoice = voices.find(v => v.name.includes(voiceSettings.voiceName!));
        if (matchingVoice) {
          utterance.voice = matchingVoice;
        }
      }

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }, [isMuted]);

  const handleGenerateAll = async () => {
    // FIX: Use ref to get current prompt value to avoid stale closure
    const currentPrompt = promptRef.current;
    if (!currentPrompt.trim()) return;
    
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
      
      // Process each node sequentially - next node loads only after current finishes
      for (let i = 0; i < initialNodes.length; i++) {
        if (abortRef.current?.signal.aborted) break;
        
        setDialogueNodes(prev => prev.map((node, idx) => 
          idx === i ? { ...node, status: 'loading' as const } : node
        ));
        
        try {
          // Generate image first, then audio - sequential to ensure proper loading
          const imageUrl = await generateImage(initialNodes[i].imagePrompt, abortRef.current?.signal);
          
          // Only proceed to audio after image is ready - ensures sequential loading
          const audioUrl = await generateSpeech(initialNodes[i].text, abortRef.current?.signal);

          setDialogueNodes(prev => prev.map((node, idx) => 
            idx === i ? { ...node, imageUrl, audioUrl: audioUrl || undefined, status: 'ready' as const } : node
          ));
        } catch (err) {
          setDialogueNodes(prev => prev.map((node, idx) => 
            idx === i ? { ...node, status: 'error' as const } : node
          ));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrevious = async () => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      setIsNavigating(true);
      setCurrentIndex(newIndex);
      await playNodeAudio(dialogueNodes[newIndex]);
      setIsNavigating(false);
    }
  };

  const handleNext = async () => {
    if (currentIndex < dialogueNodes.length - 1) {
      setIsNavigating(true);
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      await playNodeAudio(dialogueNodes[newIndex]);
      setIsNavigating(false);
    }
  };

  const handlePlayPause = async () => {
    if (isPlaying) {
      window.speechSynthesis.cancel();
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(false);
      isPlayingRef.current = false;
    } else {
      setIsPlaying(true);
      isPlayingRef.current = true;
      
      // Sequential playback - next node loads only after current finishes
      for (let i = currentIndex; i < dialogueNodes.length; i++) {
        if (!isPlayingRef.current) break;
        
        setCurrentIndex(i);
        const node = dialogueNodes[i];
        
        if (node.status === 'ready') {
          // Wait for audio to finish before moving to next node
          await playNodeAudio(node);
        } else {
          // Wait for pending/loading nodes
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        if (i === dialogueNodes.length - 1) {
          setIsPlaying(false);
          isPlayingRef.current = false;
        }
      }
    }
  };

  const handleReset = () => {
    window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    isPlayingRef.current = false;
    setCurrentIndex(0);
  };

  const currentNode = dialogueNodes[currentIndex];
  const progress = dialogueNodes.length > 0 ? ((currentIndex + 1) / dialogueNodes.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <audio ref={audioRef} />
      
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                Prompt to Video
              </h1>
            </div>
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <Info className="w-4 h-4" />
              <span>AI-powered story generation</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Input Section */}
        <section className="mb-8">
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter a theme for your story (e.g., 'The Lost Kingdom', 'Space Odyssey', 'Ancient Dragons')..."
              className="w-full h-32 bg-neutral-900 border border-neutral-800 rounded-2xl p-4 pr-12 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
            />
            <button
              onClick={handleGenerateAll}
              disabled={isGenerating || !prompt.trim()}
              className="absolute bottom-4 right-4 px-6 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-neutral-700 disabled:to-neutral-700 rounded-xl font-medium transition-all duration-200 flex items-center gap-2"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              {isGenerating ? 'Generating...' : 'Generate Story'}
            </button>
          </div>
          
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm"
            >
              {error}
            </motion.div>
          )}
        </section>

        {/* Player Section */}
        {dialogueNodes.length > 0 && (
          <section className="bg-neutral-900 rounded-3xl border border-neutral-800 overflow-hidden">
            {/* Video/Image Display */}
            <div className="aspect-video relative bg-black">
              {currentNode?.imageUrl ? (
                <img 
                  src={currentNode.imageUrl} 
                  alt={`Scene ${currentIndex + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <ImageIcon className="w-16 h-16 text-neutral-700 mx-auto mb-4" />
                    <p className="text-neutral-500">
                      {currentNode?.status === 'loading' ? 'Generating image...' : 'No image yet'}
                    </p>
                  </div>
                </div>
              )}
              
              {/* Progress bar */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-800">
                <motion.div 
                  className="h-full bg-gradient-to-r from-violet-500 to-indigo-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                />
              </div>

              {/* Node indicator */}
              <div className="absolute top-4 left-4 px-3 py-1 bg-black/50 backdrop-blur-sm rounded-full text-sm text-neutral-300">
                Scene {currentIndex + 1} / {dialogueNodes.length}
              </div>
            </div>

            {/* Dialogue Box */}
            <div className="p-6">
              <div className="flex items-start gap-4">
                {/* Character Avatar */}
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600/20 to-indigo-600/20 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">
                    {currentNode?.characterName === 'Narrator' && '🎭'}
                    {currentNode?.characterName === 'Seeker' && '🧭'}
                    {currentNode?.characterName === 'Guide' && '🧙'}
                    {currentNode?.characterName === 'Spirit' && '👻'}
                    {currentNode?.characterName === 'Mystic' && '🔮'}
                    {currentNode?.characterName === 'Guardian' && '🛡️'}
                    {currentNode?.characterName === 'Challenger' && '⚔️'}
                    {currentNode?.characterName === 'Elder' && '👴'}
                    {currentNode?.characterName === 'Oracle' && '🌙'}
                    {currentNode?.characterName === 'Sage' && '📜'}
                    {currentNode?.characterName === 'Wanderer' && '🚶'}
                    {currentNode?.characterName === 'Keeper' && '🔑'}
                  </span>
                </div>
                
                <div className="flex-1 min-w-0">
                  {/* Character Name */}
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold text-violet-400">
                      {currentNode?.characterName}
                    </h3>
                    {currentNode?.status === 'loading' && (
                      <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                    )}
                    {currentNode?.status === 'error' && (
                      <span className="text-xs text-red-400">Error</span>
                    )}
                  </div>
                  
                  {/* Dialogue Text */}
                  <p className="text-lg text-neutral-200 leading-relaxed">
                    {currentNode?.text}
                  </p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between mt-6 pt-6 border-t border-neutral-800">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleReset}
                    className="p-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 transition-colors"
                    title="Reset"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                  
                  <button
                    onClick={toggleMute}
                    className="p-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 transition-colors"
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? (
                      <VolumeX className="w-5 h-5" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    onClick={handlePrevious}
                    disabled={currentIndex === 0 || isNavigating}
                    className="p-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  
                  <button
                    onClick={handlePlayPause}
                    disabled={isNavigating}
                    className={clsx(
                      "p-4 rounded-2xl transition-all duration-200 flex items-center gap-2",
                      isPlaying 
                        ? "bg-red-600 hover:bg-red-500" 
                        : "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500"
                    )}
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-6 h-6" />
                        <span className="font-medium">Pause</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-6 h-6" />
                        <span className="font-medium">Play All</span>
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={handleNext}
                    disabled={currentIndex === dialogueNodes.length - 1 || isNavigating}
                    className="p-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                <div className="w-24" /> {/* Spacer for centering */}
              </div>
            </div>
          </section>
        )}

        {/* Empty State */}
        {dialogueNodes.length === 0 && !isGenerating && (
          <div className="text-center py-16">
            <div className="w-24 h-24 rounded-3xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mx-auto mb-6">
              <Wand2 className="w-12 h-12 text-neutral-600" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-300 mb-2">
              Create Your Story
            </h2>
            <p className="text-neutral-500 max-w-md mx-auto">
              Enter a theme above and let AI generate a complete video story with multiple scenes, characters, and narration.
            </p>
          </div>
        )}

        {/* Thumbnail Strip */}
        {dialogueNodes.length > 1 && (
          <section className="mt-8">
            <h3 className="text-lg font-semibold text-neutral-300 mb-4">Story Nodes</h3>
            <div className="flex gap-3 overflow-x-auto pb-4">
              {dialogueNodes.map((node, idx) => (
                <motion.button
                  key={node.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={clsx(
                    "flex-shrink-0 w-32 aspect-video rounded-xl overflow-hidden border-2 transition-all",
                    idx === currentIndex 
                      ? "border-violet-500 ring-2 ring-violet-500/30" 
                      : "border-neutral-800 hover:border-neutral-700"
                  )}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {node.imageUrl ? (
                    <img 
                      src={node.imageUrl} 
                      alt={node.characterName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-neutral-900 flex items-center justify-center">
                      {node.status === 'loading' ? (
                        <Loader2 className="w-6 h-6 animate-spin text-neutral-600" />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-neutral-700" />
                      )}
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                    <p className="text-xs font-medium text-white truncate">{node.characterName}</p>
                  </div>
                </motion.button>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}