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
    { name: 'Guardian', text: `You have come far, but the final trial awaits. Only those who truly understand ${theme} can pass through these gates.`, imagePrompt: `formidable guardian at gate, ${theme} fortress, imposing presence, consistent dark cinematic theme` },
    { name: 'Elder', text: `The answers you seek are closer than you think. Look within yourself, and you will find the truth of ${theme}.`, imagePrompt: `ancient elder in meditation, ${theme} sacred grove, soft divine light, consistent mystical theme` },
    { name: 'Seeker', text: `I see it now - the heart of ${theme}. This is where my true test begins. I won't let this opportunity pass me by.`, imagePrompt: `hero confronting great challenge, ${theme} dramatic moment, powerful composition, cinematic style, consistent theme` },
    { name: 'Oracle', text: `The wisdom you seek lies not in the destination, but in the journey itself. You have already found what you were looking for.`, imagePrompt: `mysterious oracle figure shrouded in light, ${theme} temple, divine glow, consistent mystical theme` },
    { name: 'Sage', text: `Remember, in ${theme} and beyond, true power comes from understanding, not force. Go now and share what you have learned.`, imagePrompt: `venerable sage and student together, ${theme} peaceful ending scene, warm colors, consistent movie poster style` },
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
      setCurrentIndex(newIndex);
      await playNodeAudio(dialogueNodes[newIndex]);
    }
  };

  const handleNext = async () => {
    if (currentIndex < dialogueNodes.length - 1) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      await playNodeAudio(dialogueNodes[newIndex]);
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

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans">
      <audio ref={audioRef} className="hidden" />
      
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">
              Prompt to Video
            </h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <Info className="w-4 h-4" />
            <span>Story Mode</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Prompt Input */}
        <section className="mb-8">
          <div className="flex flex-col gap-3">
            <label htmlFor="prompt" className="text-sm font-medium text-neutral-300">
              Enter your story theme
            </label>
            <div className="flex gap-3">
              <input
                id="prompt"
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g., The Lost Kingdom, Space Odyssey, Ancient Mysteries..."
                className="flex-1 px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                onKeyDown={(e) => e.key === 'Enter' && !isGenerating && handleGenerateAll()}
              />
              <button
                onClick={handleGenerateAll}
                disabled={isGenerating || !prompt.trim()}
                className={clsx(
                  'px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2',
                  isGenerating || !prompt.trim()
                    ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-600/25'
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-5 h-5" />
                    <span>Generate Story</span>
                  </>
                )}
              </button>
            </div>
          </div>
          
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
            >
              {error}
            </motion.div>
          )}
        </section>

        {/* Story Progress */}
        {dialogueNodes.length > 0 && (
          <section className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-medium text-neutral-200">Story Sequence</h2>
              <span className="text-sm text-neutral-400">
                Scene {currentIndex + 1} of {dialogueNodes.length}
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-neutral-900">
              {dialogueNodes.map((node, idx) => (
                <button
                  key={node.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={clsx(
                    'flex-shrink-0 w-12 h-12 rounded-lg border-2 transition-all flex items-center justify-center text-xs font-medium',
                    idx === currentIndex
                      ? 'border-violet-500 bg-violet-500/20 text-white'
                      : idx < currentIndex
                      ? 'border-green-500/50 bg-green-500/10 text-green-400'
                      : 'border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600'
                  )}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Main Content */}
        {dialogueNodes.length > 0 && currentNode && (
          <section className="grid lg:grid-cols-2 gap-8">
            {/* Scene Display */}
            <div className="space-y-4">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-neutral-900 border border-neutral-800">
                {currentNode.status === 'loading' ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                      <span className="text-sm text-neutral-400">Generating scene...</span>
                    </div>
                  </div>
                ) : currentNode.imageUrl ? (
                  <img 
                    src={currentNode.imageUrl} 
                    alt={`Scene ${currentIndex + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : currentNode.status === 'error' ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
                    <div className="flex flex-col items-center gap-2 text-red-400">
                      <ImageIcon className="w-8 h-8" />
                      <span className="text-sm">Failed to generate</span>
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
                    <ImageIcon className="w-8 h-8 text-neutral-600" />
                  </div>
                )}
                
                {/* Scene Number Badge */}
                <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/60 backdrop-blur-sm text-sm font-medium">
                  Scene {currentIndex + 1}
                </div>
              </div>
              
              {/* Playback Controls */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={handleReset}
                  className="p-3 rounded-full bg-neutral-800 hover:bg-neutral-700 transition-colors"
                  title="Reset"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button
                  onClick={handlePrevious}
                  disabled={currentIndex === 0}
                  className="p-3 rounded-full bg-neutral-800 hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={handlePlayPause}
                  className={clsx(
                    'p-4 rounded-full transition-colors',
                    isPlaying 
                      ? 'bg-red-500 hover:bg-red-600' 
                      : 'bg-violet-600 hover:bg-violet-500'
                  )}
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6" />
                  ) : (
                    <Play className="w-6 h-6" />
                  )}
                </button>
                <button
                  onClick={handleNext}
                  disabled={currentIndex === dialogueNodes.length - 1}
                  className="p-3 rounded-full bg-neutral-800 hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <button
                  onClick={toggleMute}
                  className="p-3 rounded-full bg-neutral-800 hover:bg-neutral-700 transition-colors"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? (
                    <VolumeX className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Dialogue Panel */}
            <div className="space-y-4">
              <div className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
                {/* Character Name Display */}
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1 rounded-full bg-violet-600/20 border border-violet-500/30 text-violet-300 text-sm font-medium">
                    {currentNode.characterName}
                  </div>
                  <span className="text-xs text-neutral-500">
                    Voice: {CHARACTER_VOICES[currentNode.characterName]?.voiceName || 'Default'}
                  </span>
                </div>
                
                <p className="text-lg leading-relaxed text-neutral-200">
                  {currentNode.text}
                </p>
                
                <div className="pt-4 border-t border-neutral-800">
                  <p className="text-xs text-neutral-500 mb-2">Image Prompt:</p>
                  <p className="text-sm text-neutral-400 italic">
                    {currentNode.imagePrompt}
                  </p>
                </div>
              </div>

              {/* Node Status */}
              <div className="flex items-center gap-2 text-sm">
                <span className={clsx(
                  'w-2 h-2 rounded-full',
                  currentNode.status === 'ready' ? 'bg-green-500' :
                  currentNode.status === 'loading' ? 'bg-yellow-500 animate-pulse' :
                  currentNode.status === 'error' ? 'bg-red-500' :
                  'bg-neutral-500'
                )} />
                <span className="text-neutral-400">
                  {currentNode.status === 'ready' ? 'Ready' :
                   currentNode.status === 'loading' ? 'Generating...' :
                   currentNode.status === 'error' ? 'Error' :
                   'Pending'}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Empty State */}
        {dialogueNodes.length === 0 && !isGenerating && (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-neutral-900 flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-neutral-600" />
            </div>
            <h3 className="text-xl font-medium text-neutral-300 mb-2">
              Create Your Story
            </h3>
            <p className="text-neutral-500 max-w-md mx-auto">
              Enter a theme above and let AI generate a 10-scene animated story with consistent characters, voices, and visual theme.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}