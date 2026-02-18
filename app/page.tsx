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
  
  const characters = [
    { name: 'Sage', voice: VOICES[0], role: 'wise elder' },
    { name: 'Aria', voice: VOICES[1], role: 'brave protagonist' },
    { name: 'Raven', voice: VOICES[3], role: 'mysterious guide' },
    { name: 'Theron', voice: VOICES[2], role: 'skeptical companion' },
    { name: 'The Void', voice: VOICES[0], role: 'antagonist force' },
  ];

  return [
    { name: 'Narrator', text: `In the realm of ${theme}, ancient powers stirred from their eternal slumber.`, imagePrompt: `${stylePrefix}Epic establishing shot of ${theme} world at dawn, mystical atmosphere.`, voiceId: VOICES[0] },
    { name: characters[0].name, text: `The prophecy speaks of travelers who would come seeking the Heart of ${theme}. I have waited centuries for this moment.`, imagePrompt: `${stylePrefix}An ancient wise elder with glowing eyes, draped in mystical robes, looking toward the horizon.`, voiceId: characters[0].voice },
    { name: characters[1].name, text: `We crossed the Shattered Lands to get here, Sage. Is the Heart of ${theme} truly within reach?`, imagePrompt: `${stylePrefix}A brave young heroine standing at a cliff's edge, wind blowing through her hair, determined expression.`, voiceId: characters[1].voice },
    { name: characters[2].name, text: `Careful what you wish for, Aria. The ${theme} Heart has claimed many who came before you.`, imagePrompt: `${stylePrefix}A mysterious cloaked figure emerging from shadows, eyes glowing with ancient knowledge.`, voiceId: characters[2].voice },
    { name: characters[3].name, text: `I've seen what this place does to dreamers. The ${theme} realm doesn't give freely—it takes.`, imagePrompt: `${stylePrefix}A skeptical warrior examining ancient ruins, hand on weapon, wary expression.`, voiceId: characters[3].voice },
    { name: characters[0].name, text: `The trial of ${theme} will test your hearts. Only those united by true bonds may claim its power.`, imagePrompt: `${stylePrefix}The Sage gesturing toward a massive stone door covered in glowing runes.`, voiceId: characters[0].voice },
    { name: characters[1].name, text: `Then let's show ${theme} what true unity looks like. Together, we face whatever comes.`, imagePrompt: `${stylePrefix}The heroine stepping forward confidently, hand reaching out to touch the glowing runes.`, voiceId: characters[1].voice },
    { name: 'Narrator', text: `The ancient door groaned, revealing the Chamber of ${theme}—a vast hall of floating crystals and pulsing light.`, imagePrompt: `${stylePrefix}Massive chamber filled with floating glowing crystals, ethereal light beams, awe-inspiring scale.`, voiceId: VOICES[0] },
    { name: characters[2].name, text: `Wait... I sense something ancient awakening. The ${theme} entity stirs within.`, imagePrompt: `${stylePrefix}The mysterious guide raising a hand, sensing danger, shadows gathering around.`, voiceId: characters[2].voice },
    { name: characters[4].name, text: `FOOLS. You dare enter my domain? I am the embodiment of ${theme}, and you are but fleeting sparks.`, imagePrompt: `${stylePrefix}An enormous dark entity rising from the ground, made of swirling shadows and glowing eyes, terrifying presence.`, voiceId: characters[4].voice },
    { name: characters[3].name, text: `It's a trap! The ${theme} Heart isn't a gift—it's a prison designed to consume souls!`, imagePrompt: `${stylePrefix}The warrior drawing weapon, standing protectively in front of companions, battle-ready stance.`, voiceId: characters[3].voice },
    { name: characters[1].name, text: `We won't be consumed! We came here to free ${theme}, not serve it!`, imagePrompt: `${stylePrefix}The heroine surrounded by glowing energy, standing defiant against the darkness.`, voiceId: characters[1].voice },
    { name: characters[0].name, text: `Aria—use your bond with your companions! Love is stronger than ${theme}'s hunger!`, imagePrompt: `${stylePrefix}The Sage channeling energy, light radiating from hands, inspiring expression.`, voiceId: characters[0].voice },
    { name: characters[2].name, text: `For all the souls lost to this place—we break the cycle NOW!`, imagePrompt: `${stylePrefix}The mysterious guide unleashing powerful magic, light exploding outward.`, voiceId: characters[2].voice },
    { name: characters[1].name, text: `Together! We are the light of ${theme}!`, imagePrompt: `${stylePrefix}All four heroes united, brilliant light forming around them, defeating the darkness.`, voiceId: characters[1].voice },
    { name: 'Narrator', text: `As the light of their unity blazed through the Chamber of ${theme}, the ancient entity shattered. The realm was reborn.`, imagePrompt: `${stylePrefix}The ${theme} world transformed—darkness replaced by brilliant light, flowers blooming, hope restored.`, voiceId: VOICES[0] },
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

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const generateImage = async (imagePrompt: string, signal?: AbortSignal): Promise<string> => {
    const res = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: imagePrompt }),
      signal,
    });
    
    if (!res.ok) {
      throw new Error('Image generation failed');
    }
    const data = await res.json();
    return data.url || data.image || '';
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
    if (!prompt.trim()) return;
    
    // Prevent multiple simultaneous generations
    if (isGenerating) return;
    
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
    
    // Create nodes with proper state references
    const newNodes: DialogueNode[] = script.map((item, idx) => ({
      id: `node-${idx}`,
      characterName: item.name,
      text: item.text,
      imagePrompt: item.imagePrompt,
      voiceId: item.voiceId,
      status: 'pending',
    }));

    setDialogueNodes(newNodes);

    try {
      for (let i = 0; i < newNodes.length; i++) {
        if (signal.aborted) break;

        // Update current node to loading state
        setDialogueNodes(prev => prev.map((n, idx) => 
          idx === i ? { ...n, status: 'loading' } : n
        ));

        // Process current node - wrap in try/catch to continue on individual failures
        let imageUrl = '';
        let audioUrl: string | null = null;

        try {
          imageUrl = await generateImage(newNodes[i].imagePrompt, signal);
        } catch (imgErr) {
          console.error('Image generation error:', imgErr);
          // Use placeholder on error
          imageUrl = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect fill="#f0f0f0" width="800" height="600"/><rect fill="#ddd" x="0" y="450" width="800" height="150"/><text x="400" y="300" text-anchor="middle" fill="#333" font-size="32" font-family="system-ui">Image Placeholder</text></svg>`)}`;
        }

        try {
          audioUrl = await generateSpeech(newNodes[i].text, newNodes[i].voiceId, signal);
        } catch (audioErr) {
          console.error('Speech generation error:', audioErr);
        }

        if (!signal.aborted) {
          setDialogueNodes(prev => prev.map((n, idx) => 
            idx === i ? { ...n, imageUrl, audioUrl: audioUrl || undefined, status: 'ready' } : n
          ));
        }
      }
    } catch (err) {
      console.error('Generation error:', err);
      setError('Failed to generate content');
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
      
      if (node.audioUrl) {
        await playNodeAudio(node);
      }
      
      if (isPlayingRef.current) {
        setTimeout(() => playNextNode(index + 1), 500);
      }
    } else {
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
      <audio ref={audioRef} />
      
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">
              AI Story Generator
            </h1>
          </div>
          <button
            onClick={handleReset}
            className="p-2 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
            title="Reset"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Input Section */}
        <div className="mb-8">
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter a theme for your story (e.g., 'Cyberpunk Tokyo', 'Medieval Fantasy', 'Space Opera')..."
              className="w-full h-32 bg-neutral-900 border border-neutral-800 rounded-xl p-4 pr-12 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 resize-none"
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className={clsx(
                "absolute bottom-4 right-4 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all",
                isGenerating || !prompt.trim()
                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25"
              )}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate
                </>
              )}
            </button>
          </div>
          
          {error && (
            <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
        </div>

        {/* Playback Controls */}
        {hasContent && (
          <div className="mb-6 flex items-center justify-between bg-neutral-900 rounded-xl p-4 border border-neutral-800">
            <div className="flex items-center gap-4">
              <button
                onClick={handlePlayPause}
                disabled={!allReady}
                className={clsx(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                  allReady 
                    ? "bg-indigo-600 hover:bg-indigo-500 text-white" 
                    : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                )}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5 ml-0.5" />
                )}
              </button>
              <div>
                <div className="text-sm font-medium text-white">
                  {isPlaying ? 'Playing' : allReady ? 'Ready to Play' : 'Generating...'}
                </div>
                <div className="text-xs text-neutral-400">
                  {currentIndex + 1} / {dialogueNodes.length} scenes
                </div>
              </div>
            </div>
            
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-2 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
            >
              {isMuted ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>
          </div>
        )}

        {/* Dialogue Nodes */}
        <div className="space-y-4">
          <AnimatePresence>
            {dialogueNodes.map((node, index) => (
              <motion.div
                key={node.id}
                ref={(el) => { nodeRefs.current[index] = el; }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.05 }}
                className={clsx(
                  "bg-neutral-900 rounded-xl border overflow-hidden transition-all",
                  currentIndex === index 
                    ? "border-indigo-500 ring-2 ring-indigo-500/20" 
                    : "border-neutral-800"
                )}
              >
                <div className="flex">
                  {/* Image Side */}
                  <div className="w-48 h-32 bg-neutral-800 relative flex-shrink-0">
                    {node.status === 'loading' ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                      </div>
                    ) : node.imageUrl ? (
                      <img 
                        src={node.imageUrl} 
                        alt={node.characterName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-neutral-600" />
                      </div>
                    )}
                  </div>
                  
                  {/* Content Side */}
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-indigo-400" />
                        <span className="font-medium text-indigo-400">{node.characterName}</span>
                      </div>
                      <span className={clsx(
                        "text-xs px-2 py-0.5 rounded-full",
                        node.status === 'ready' && "bg-green-500/20 text-green-400",
                        node.status === 'loading' && "bg-yellow-500/20 text-yellow-400",
                        node.status === 'pending' && "bg-neutral-700 text-neutral-400"
                      )}>
                        {node.status === 'ready' ? 'Ready' : node.status === 'loading' ? 'Generating' : 'Pending'}
                      </span>
                    </div>
                    
                    <p className="text-neutral-300 text-sm leading-relaxed">
                      {node.text}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Empty State */}
        {!hasContent && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-neutral-900 flex items-center justify-center mx-auto mb-4 border border-neutral-800">
              <ScrollText className="w-8 h-8 text-neutral-600" />
            </div>
            <h3 className="text-lg font-medium text-neutral-400 mb-2">No story yet</h3>
            <p className="text-neutral-500 text-sm max-w-md mx-auto">
              Enter a theme above and click Generate to create an AI-powered interactive story with images and audio.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}