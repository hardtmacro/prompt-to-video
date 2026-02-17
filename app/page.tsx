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

// Story script templates — the prompt fills in the world
function generateScript(userPrompt: string): Array<{ name: string; text: string; imagePrompt: string }> {
  return [
    { name: 'Narrator', text: `In the world of ${userPrompt}, a story begins to unfold beneath the fading light.`, imagePrompt: `cinematic wide shot, ${userPrompt}, atmospheric lighting, dramatic sky` },
    { name: 'Hero', text: `I never thought I'd find myself here. But something about ${userPrompt} called to me.`, imagePrompt: `close-up portrait of a hero character, ${userPrompt} background, determined expression, dramatic lighting` },
    { name: 'Sage', text: `Many have come seeking answers in ${userPrompt}. Few have found what they truly needed.`, imagePrompt: `wise elder figure, mystical setting, ${userPrompt}, warm golden light` },
    { name: 'Hero', text: `Then show me the way. I didn't come this far to turn back now.`, imagePrompt: `hero walking forward on a path, ${userPrompt} landscape, epic journey, sunrise` },
    { name: 'Narrator', text: `And so the journey through ${userPrompt} truly begins. What lies ahead, none can say.`, imagePrompt: `vast panoramic landscape, ${userPrompt}, cinematic, epic scale, beautiful colors` },
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

    // Process nodes: generate image + audio per node, update as each completes
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
      // Process 2 nodes at a time to balance speed vs rate limits
      for (let i = 0; i < nodes.length; i += 2) {
        if (controller.signal.aborted) break;
        const batch = [processNode(i)];
        if (i + 1 < nodes.length) batch.push(processNode(i + 1));
        await Promise.all(batch);
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

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 flex items-center gap-2">
            <Info className="w-5 h-5" />
            {error}
          </div>
        )}

        {/* Scene Navigator */}
        {dialogueNodes.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Scene Navigator</h2>
              <span className="text-xs text-white/50">{readyCount}/{dialogueNodes.length} ready</span>
            </div>
            <div className="flex gap-2">
              {dialogueNodes.map((node, i) => (
                <button
                  key={node.id}
                  onClick={() => { stopPlayback(); setCurrentIndex(i); }}
                  className={clsx(
                    "node-indicator flex-1 h-2 rounded-full transition-all",
                    i === currentIndex ? "bg-purple-400 scale-y-150" :
                    node.status === 'ready' ? "bg-white/30 hover:bg-white/50" :
                    node.status === 'loading' ? "bg-yellow-500/50 animate-pulse" :
                    node.status === 'error' ? "bg-red-500/50" :
                    "bg-white/10"
                  )}
                  aria-label={`Scene ${i + 1}: ${node.characterName}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Current Scene */}
        {currentNode && (
          <motion.div
            key={currentNode.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-black/30 backdrop-blur-sm rounded-2xl overflow-hidden border border-white/10"
          >
            {/* Image */}
            <div className="relative aspect-video bg-gradient-to-br from-purple-900/50 to-pink-900/50">
              {currentNode.imageUrl ? (
                <img
                  src={currentNode.imageUrl}
                  alt={`Scene: ${currentNode.characterName}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {currentNode.status === 'loading' ? (
                    <Loader2 className="w-12 h-12 text-white/30 animate-spin" />
                  ) : (
                    <ImageIcon className="w-16 h-16 text-white/20" />
                  )}
                </div>
              )}

              {/* Character badge */}
              <div className="absolute top-4 left-4 px-3 py-1 bg-purple-500/80 backdrop-blur-sm rounded-full">
                <span className="text-white text-sm font-medium">{currentNode.characterName}</span>
              </div>
            </div>

            {/* Dialogue + Controls */}
            <div className="p-6">
              <p className="text-lg text-white/90 leading-relaxed mb-6">{currentNode.text}</p>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrev}
                    disabled={!canNavigatePrev}
                    className={clsx(
                      "p-2 rounded-lg transition-colors",
                      canNavigatePrev ? "bg-white/10 hover:bg-white/20 text-white" : "bg-white/5 text-white/30 cursor-not-allowed"
                    )}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-white/50 text-sm font-mono">{String(currentIndex + 1).padStart(2, '0')} / {String(dialogueNodes.length).padStart(2, '0')}</span>
                  <button
                    onClick={handleNext}
                    disabled={!canNavigateNext}
                    className={clsx(
                      "p-2 rounded-lg transition-colors",
                      canNavigateNext ? "bg-white/10 hover:bg-white/20 text-white" : "bg-white/5 text-white/30 cursor-not-allowed"
                    )}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                    aria-label="Regenerate"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handlePlayAll}
                    disabled={readyCount === 0}
                    className={clsx(
                      "px-5 py-2 rounded-xl font-semibold flex items-center gap-2 transition-all",
                      readyCount > 0
                        ? isPlaying
                          ? "bg-red-500 hover:bg-red-600 text-white"
                          : "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                        : "bg-white/10 text-white/50 cursor-not-allowed"
                    )}
                  >
                    {isPlaying ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4" /> Play</>}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Empty State */}
        {dialogueNodes.length === 0 && !isGenerating && (
          <div className="text-center py-16">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-white/10 flex items-center justify-center">
              <Sparkles className="w-12 h-12 text-purple-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">No scenes generated yet</h2>
            <p className="text-white/60">Enter a prompt above to generate an interactive AI story with images and voice</p>
          </div>
        )}
      </main>
    </div>
  );
}
