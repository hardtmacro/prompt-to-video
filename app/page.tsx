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
};

function generateScript(userPrompt: string): Array<{ name: string; text: string; imagePrompt: string }> {
  const theme = userPrompt.trim();
  
  return [
    { name: 'Narrator', text: `In the world of ${theme}, a tale of transformation is about to unfold. The stage is set, and destiny awaits those bold enough to seek it.`, imagePrompt: `cinematic wide establishing shot, ${theme} world, dramatic golden hour lighting, epic scale, movie poster style, consistent color palette` },
    { name: 'Seeker', text: `I've traveled far to find this place. They say ${theme} holds the answers I've been searching for my entire life.`, imagePrompt: `close-up portrait of determined traveler, ${theme} in background, warm cinematic lighting, consistent visual theme` },
    { name: 'Guide', text: `Many come to ${theme} seeking glory, but few understand what true power costs. Are you prepared for the journey ahead?`, imagePrompt: `wise mentor figure standing in doorway, ${theme} environment, mystical atmosphere, consistent lighting style` },
    { name: 'Seeker', text: `I've faced challenges before. Whatever ${theme} throws at me, I won't back down. Show me what I need to learn.`, imagePrompt: `brave hero ready for adventure, standing tall, ${theme} landscape, dramatic pose, cinematic lighting, consistent theme` },
    { name: 'Spirit', text: `The path through ${theme} is not for the faint of heart. You must first understand yourself before you can conquer your fears.`, imagePrompt: `ethereal spirit guide appearing from mist, ${theme} mystical realm, supernatural glow, consistent visual style` },
    { name: 'Guardian', text: `You have come far, but the final trial awaits. Only those who truly understand ${theme} can pass through these gates.`, imagePrompt: `formidable guardian at gate, ${theme} fortress, imposing presence, consistent dark cinematic theme` },
    { name: 'Seeker', text: `I see it now - the heart of ${theme}. This is where my true test begins. I won't let this opportunity pass me by.`, imagePrompt: `hero confronting great challenge, ${theme} dramatic moment, powerful composition, cinematic style, consistent theme` },
    { name: 'Oracle', text: `The wisdom you seek lies not in the destination, but in the journey itself. You have already found what you were looking for.`, imagePrompt: `mysterious oracle figure shrouded in light, ${theme} temple, divine glow, consistent mystical theme` },
    { name: 'Narrator', text: `And so, in the world of ${theme}, a new chapter begins. The seeker has found not just answers, but wisdom that will guide countless others.`, imagePrompt: `panoramic view of transformed world, ${theme} harmonious landscape, beautiful sunrise, consistent cinematic quality` },
    { name: 'Guide', text: `Remember, in ${theme} and beyond, true power comes from understanding, not force. Go now and share what you have learned.`, imagePrompt: `mentor and student together, ${theme} peaceful ending scene, warm colors, consistent movie poster style` },
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
        if (node.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(node.imageUrl);
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
      
      for (let i = 0; i < initialNodes.length; i++) {
        if (abortRef.current?.signal.aborted) break;
        
        setDialogueNodes(prev => prev.map((node, idx) => 
          idx === i ? { ...node, status: 'loading' as const } : node
        ));
        
        try {
          // Generate image first, then audio - sequential to ensure proper loading
          const imageUrl = await generateImage(initialNodes[i].imagePrompt, abortRef.current?.signal);
          
          // Only proceed to audio after image is ready
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
      
      for (let i = currentIndex; i < dialogueNodes.length; i++) {
        if (!isPlayingRef.current) break;
        
        setCurrentIndex(i);
        const node = dialogueNodes[i];
        
        if (node.status === 'ready') {
          await playNodeAudio(node);
        } else {
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
            <span>{dialogueNodes.length} scenes</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Prompt Input */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-neutral-300 mb-2">
            Enter your story prompt
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., The Kingdom of Shadows, A Journey Through Time, The Last Frontier..."
              className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all"
            />
            <button
              onClick={handleGenerateAll}
              disabled={isGenerating || !prompt.trim()}
              className={clsx(
                "px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all shadow-lg",
                isGenerating || !prompt.trim()
                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed opacity-50"
                  : "bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/20"
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
                  Generate
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 flex items-center gap-2">
            <Info className="w-5 h-5" />
            {error}
          </div>
        )}

        {/* Story Display */}
        {dialogueNodes.length > 0 && currentNode && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Image Panel */}
            <div className="space-y-4">
              <div className="aspect-video bg-neutral-900 rounded-2xl overflow-hidden border border-neutral-800 relative">
                {currentNode.status === 'loading' ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
                    <Loader2 className="w-12 h-12 animate-spin text-violet-500" />
                  </div>
                ) : currentNode.imageUrl ? (
                  <img 
                    src={currentNode.imageUrl} 
                    alt={currentNode.imagePrompt}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ImageIcon className="w-16 h-16 text-neutral-700" />
                  </div>
                )}
              </div>
              
              {/* Scene Navigation */}
              <div className="flex items-center justify-between">
                <button
                  onClick={handlePrevious}
                  disabled={currentIndex === 0 || isGenerating}
                  className="p-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm text-neutral-400">
                  Scene {currentIndex + 1} of {dialogueNodes.length}
                </span>
                <button
                  onClick={handleNext}
                  disabled={currentIndex === dialogueNodes.length - 1 || isGenerating}
                  className="p-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Dialogue Panel */}
            <div className="space-y-6">
              <div className="bg-neutral-900/50 rounded-2xl p-6 border border-neutral-800">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white font-semibold">
                    {currentNode.characterName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{currentNode.characterName}</h3>
                    <span className={clsx(
                      "text-xs px-2 py-0.5 rounded-full",
                      currentNode.status === 'ready' && "bg-green-500/20 text-green-400",
                      currentNode.status === 'loading' && "bg-yellow-500/20 text-yellow-400",
                      currentNode.status === 'error' && "bg-red-500/20 text-red-400",
                      currentNode.status === 'pending' && "bg-neutral-700 text-neutral-400"
                    )}>
                      {currentNode.status}
                    </span>
                  </div>
                </div>
                <p className="text-lg text-neutral-200 leading-relaxed">
                  {currentNode.text}
                </p>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={handleReset}
                  disabled={isGenerating}
                  className="p-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button
                  onClick={handlePlayPause}
                  disabled={isGenerating || dialogueNodes.every(n => n.status !== 'ready')}
                  className="p-4 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6" />
                  ) : (
                    <Play className="w-6 h-6 ml-1" />
                  )}
                </button>
                <button
                  onClick={toggleMute}
                  disabled={isGenerating}
                  className="p-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isMuted ? (
                    <VolumeX className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>
              </div>

              {/* Scene List */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-neutral-400">All Scenes</h4>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {dialogueNodes.map((node, idx) => (
                    <button
                      key={node.id}
                      onClick={() => setCurrentIndex(idx)}
                      disabled={isGenerating}
                      className={clsx(
                        "w-full text-left px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2",
                        idx === currentIndex 
                          ? "bg-violet-600/20 text-violet-300" 
                          : "hover:bg-neutral-800 text-neutral-400",
                        isGenerating && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <span className={clsx(
                        "w-2 h-2 rounded-full",
                        node.status === 'ready' && "bg-green-500",
                        node.status === 'loading' && "bg-yellow-500 animate-pulse",
                        node.status === 'error' && "bg-red-500",
                        node.status === 'pending' && "bg-neutral-600"
                      )} />
                      <span className="truncate">{node.characterName}: {node.text.substring(0, 40)}...</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}