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

// Story script templates with proper story arc - at least 10 nodes
function generateScript(userPrompt: string): Array<{ name: string; text: string; imagePrompt: string }> {
  const theme = userPrompt.trim();
  
  return [
    // ACT 1: SETUP (Nodes 1-2)
    { name: 'Narrator', text: `In the world of ${theme}, a tale of transformation is about to unfold. The stage is set, and destiny awaits those bold enough to seek it.`, imagePrompt: `cinematic wide establishing shot, ${theme}, dramatic golden hour lighting, epic scale, movie poster style, consistent color palette` },
    { name: 'Seeker', text: `I've traveled far to find this place. They say ${theme} holds the answers I've been searching for my entire life.`, imagePrompt: `close-up portrait of determined traveler, ${theme} in background, warm lighting, cinematic, consistent visual theme` },
    
    // ACT 2: RISING ACTION (Nodes 3-5)
    { name: 'Guide', text: `Many come to ${theme} seeking glory, but few understand what true power costs. Are you prepared for the journey ahead?`, imagePrompt: `wise mentor figure standing in doorway, ${theme} environment, mystical atmosphere, consistent lighting style` },
    { name: 'Seeker', text: `I've faced challenges before. Whatever ${theme} throws at me, I won't back down. Show me what I need to learn.`, imagePrompt: `brave hero ready for adventure, standing tall, ${theme} landscape, dramatic pose, cinematic lighting` },
    { name: 'Spirit', text: `The path through ${theme} is not for the faint of heart. You must first understand yourself before you can conquer your fears.`, imagePrompt: `ethereal spirit guide appearing from mist, ${theme} mystical realm, supernatural glow, consistent visual style` },
    
    // ACT 3: CLIMAX (Nodes 6-8)
    { name: 'Seeker', text: `I see it now - the heart of ${theme}. This is where my true test begins. I won't let this opportunity pass me by.`, imagePrompt: `hero confronting great challenge, ${theme} dramatic moment, powerful composition, cinematic style` },
    { name: 'Guardian', text: `You have come far, but the final trial awaits. Only those who truly understand ${theme} can pass through these gates.`, imagePrompt: `formidable guardian at gate, ${theme} fortress, imposing presence, consistent dark cinematic theme` },
    { name: 'Seeker', text: `I've learned so much on this journey through ${theme}. The real treasure wasn't what I sought - it was the growth along the way.`, imagePrompt: `enlightened hero in moment of revelation, ${theme} beautiful scene, golden light, consistent visual theme` },
    
    // ACT 4: RESOLUTION (Nodes 9-10)
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

  // Clean up audio URLs on unmount
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

  // Generate image via server API route
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

  // Generate speech via server API route
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
    // Fallback response (no CF credentials)
    const data = await res.json();
    if (data.fallback) return null;
    return null;
  };

  // Play audio for a node, with browser TTS fallback
  const playNodeAudio = useCallback(async (node: DialogueNode): Promise<void> => {
    if (isMuted) return;

    if (node.audioUrl) {
      // Play CF-generated audio
      return new Promise<void>((resolve, reject) => {
        if (!audioRef.current) { resolve(); return; }
        audioRef.current.src = node.audioUrl!;
        audioRef.current.onended = () => resolve();
        audioRef.current.onerror = () => reject(new Error('Playback failed'));
        audioRef.current.play().catch(reject);
      });
    }

    // Fallback: browser SpeechSynthesis
    return new Promise<void>((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) { resolve(); return; }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(node.text);
      utterance.rate = 0.95;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }, [isMuted]);

  const stopPlayback = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  // Sequential playback from a given index
  const playFrom = useCallback(async (startIndex: number, nodes: DialogueNode[]) => {
    isPlayingRef.current = true;
    setIsPlaying(true);

    for (let i = startIndex; i < nodes.length; i++) {
      if (!isPlayingRef.current) break;
      const node = nodes[i];
      if (node.status !== 'ready') continue;

      setCurrentIndex(i);
      try {
        await playNodeAudio(node);
      } catch {
        // Continue to next node on error
      }
      // Small pause between nodes
      if (isPlayingRef.current && i < nodes.length - 1) {
        await new Promise(r => setTimeout(r, 400));
      }
    }
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, [playNodeAudio]);

  const handlePlayAll = useCallback(() => {
    if (isPlayingRef.current) {
      stopPlayback();
    } else if (dialogueNodes.length > 0) {
      playFrom(currentIndex, dialogueNodes);
    }
  }, [dialogueNodes, currentIndex, playFrom, stopPlayback]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      stopPlayback();
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex, stopPlayback]);

  const handleNext = useCallback(() => {
    if (currentIndex < dialogueNodes.length - 1) {
      stopPlayback();
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, dialogueNodes.length, stopPlayback]);

  // Main generation handler
  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;

    stopPlayback();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsGenerating(true);
    setError(null);
    setCurrentIndex(0);

    const script = generateScript(prompt.trim());
    const nodes: DialogueNode[] = script.map((s, i) => ({
      id: `node-${i}-${Date.now()}`,
      characterName: s.name,
      text: s.text,
      imagePrompt: s.imagePrompt,
      status: 'pending',
    }));
    setDialogueNodes(nodes);

    let autoPlayStarted = false;
    const updatedNodes = [...nodes];

    // Process nodes SEQUENTIALLY - each node loads only after the previous one finishes
    const processNode = async (index: number) => {
      if (controller.signal.aborted) return;

      // Mark loading
      updatedNodes[index] = { ...updatedNodes[index], status: 'loading' };
      setDialogueNodes([...updatedNodes]);

      try {
        // Generate image and audio in parallel for this node
        const [imageUrl, audioUrl] = await Promise.all([
          generateImage(updatedNodes[index].imagePrompt, controller.signal).catch(() => ''),
          generateSpeech(updatedNodes[index].text, controller.signal).catch(() => null),
        ]);

        updatedNodes[index] = {
          ...updatedNodes[index],
          imageUrl: imageUrl || undefined,
          audioUrl: audioUrl || undefined,
          status: 'ready',
        };
        setDialogueNodes([...updatedNodes]);

        // Auto-play as soon as first node is ready
        if (!autoPlayStarted && index === 0) {
          autoPlayStarted = true;
          setTimeout(() => playFrom(0, updatedNodes), 200);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        updatedNodes[index] = { ...updatedNodes[index], status: 'error' };
        setDialogueNodes([...updatedNodes]);
      }
    };

    try {
      // Process nodes SEQUENTIALLY - one after another completes
      for (let i = 0; i < nodes.length; i++) {
        if (controller.signal.aborted) break;
        await processNode(i);
      }
    } catch {
      if (!controller.signal.aborted) {
        setError('Failed to generate story. Please try again.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && prompt.trim() && !isGenerating) {
      handleGenerate();
    }
  };

  const currentNode = dialogueNodes[currentIndex];
  const canNavigatePrev = currentIndex > 0;
  const canNavigateNext = currentIndex < dialogueNodes.length - 1;
  const readyCount = dialogueNodes.filter(n => n.status === 'ready').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <audio ref={audioRef} className="hidden" />

      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-400" />
            <h1 className="text-xl font-bold text-white">Visionary AI</h1>
          </div>
          <button
            onClick={toggleMute}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Input Section */}
        <div className="mb-8">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="A futuristic cyber-city at dusk..."
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={isGenerating}
              />
              {isGenerating && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                </div>
              )}
            </div>
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isGenerating}
              className={clsx(
                "px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all",
                prompt.trim() && !isGenerating
                  ? "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/25"
                  : "bg-white/10 text-white/50 cursor-not-allowed"
              )}
            >
              <Wand2 className="w-5 h-5" />
              Generate
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 flex items-center gap-2"
          >
            <Info className="w-5 h-5" />
            {error}
          </motion.div>
        )}

        {/* Progress Bar */}
        {isGenerating && dialogueNodes.length > 0 && (
          <div className="mb-6 p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="flex justify-between text-sm text-white/70 mb-2">
              <span>Generating story nodes...</span>
              <span>{readyCount} / {dialogueNodes.length} ready</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                initial={{ width: 0 }}
                animate={{ width: `${(readyCount / dialogueNodes.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Node Display */}
        {dialogueNodes.length > 0 && currentNode && (
          <motion.div
            key={currentNode.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-black/40 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden"
          >
            {/* Image Display */}
            <div className="relative aspect-video bg-white/5">
              {currentNode.status === 'loading' ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-12 h-12 text-purple-400 animate-spin" />
                </div>
              ) : currentNode.imageUrl ? (
                <img
                  src={currentNode.imageUrl}
                  alt={currentNode.imagePrompt}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <ImageIcon className="w-12 h-12 text-white/20" />
                </div>
              )}
              
              {/* Character Name Badge */}
              <div className="absolute top-4 left-4">
                <span className="px-3 py-1.5 bg-purple-600/90 backdrop-blur-sm rounded-full text-white text-sm font-medium">
                  {currentNode.characterName}
                </span>
              </div>
            </div>

            {/* Dialogue Text */}
            <div className="p-6">
              <p className="text-lg text-white/90 leading-relaxed">
                {currentNode.text}
              </p>

              {/* Node Navigation */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
                <button
                  onClick={handlePrev}
                  disabled={!canNavigatePrev}
                  className={clsx(
                    "p-2 rounded-lg transition-colors",
                    canNavigatePrev
                      ? "bg-white/10 hover:bg-white/20 text-white"
                      : "bg-white/5 text-white/30 cursor-not-allowed"
                  )}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <span className="text-sm text-white/50">
                  {currentIndex + 1} of {dialogueNodes.length}
                </span>

                <button
                  onClick={handleNext}
                  disabled={!canNavigateNext}
                  className={clsx(
                    "p-2 rounded-lg transition-colors",
                    canNavigateNext
                      ? "bg-white/10 hover:bg-white/20 text-white"
                      : "bg-white/5 text-white/30 cursor-not-allowed"
                  )}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* Playback Controls */}
              <div className="flex justify-center mt-4">
                <button
                  onClick={handlePlayAll}
                  disabled={readyCount === 0}
                  className={clsx(
                    "px-6 py-2 rounded-full font-medium flex items-center gap-2 transition-all",
                    readyCount > 0
                      ? "bg-white/10 hover:bg-white/20 text-white"
                      : "bg-white/5 text-white/30 cursor-not-allowed"
                  )}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4" />
                      Stop
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Play All
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Empty State */}
        {dialogueNodes.length === 0 && (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
              <Wand2 className="w-10 h-10 text-white/20" />
            </div>
            <h3 className="text-xl font-medium text-white mb-2">Create Your Vision</h3>
            <p className="text-white/50 max-w-md mx-auto">
              Enter a prompt to generate a cinematic story with characters, dialogue, and visuals.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}