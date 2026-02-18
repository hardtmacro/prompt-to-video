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
};

function generateScript(userPrompt: string): Array<{ name: string; text: string; imagePrompt: string }> {
  const theme = userPrompt.trim();
  
  return [
    { name: 'Narrator', text: `In the world of ${theme}, a tale of transformation is about to unfold. The stage is set, and destiny awaits those bold enough to seek it.`, imagePrompt: `cinematic wide establishing shot, ${theme}, dramatic golden hour lighting, epic scale, movie poster style, consistent color palette` },
    { name: 'Seeker', text: `I've traveled far to find this place. They say ${theme} holds the answers I've been searching for my entire life.`, imagePrompt: `close-up portrait of determined traveler, ${theme} in background, warm lighting, cinematic, consistent visual theme` },
    { name: 'Guide', text: `Many come to ${theme} seeking glory, but few understand what true power costs. Are you prepared for the journey ahead?`, imagePrompt: `wise mentor figure standing in doorway, ${theme} environment, mystical atmosphere, consistent lighting style` },
    { name: 'Seeker', text: `I've faced challenges before. Whatever ${theme} throws at me, I won't back down. Show me what I need to learn.`, imagePrompt: `brave hero ready for adventure, standing tall, ${theme} landscape, dramatic pose, cinematic lighting` },
    { name: 'Spirit', text: `The path through ${theme} is not for the faint of heart. You must first understand yourself before you can conquer your fears.`, imagePrompt: `ethereal spirit guide appearing from mist, ${theme} mystical realm, supernatural glow, consistent visual style` },
    { name: 'Guardian', text: `You have come far, but the final trial awaits. Only those who truly understand ${theme} can pass through these gates.`, imagePrompt: `formidable guardian at gate, ${theme} fortress, imposing presence, consistent dark cinematic theme` },
    { name: 'Seeker', text: `I see it now - the heart of ${theme}. This is where my true test begins. I won't let this opportunity pass me by.`, imagePrompt: `hero confronting great challenge, ${theme} dramatic moment, powerful composition, cinematic style` },
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
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setError(null);
    abortRef.current = new AbortController();
    
    try {
      const script = generateScript(prompt);
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
        
        setDialogueNodes(prev => prev.map((n, idx) => 
          idx === i ? { ...n, status: 'loading' } : n
        ));
        
        try {
          const [imageUrl, audioUrl] = await Promise.all([
            generateImage(initialNodes[i].imagePrompt, abortRef.current?.signal),
            generateSpeech(initialNodes[i].text, abortRef.current?.signal),
          ]);
          
          setDialogueNodes(prev => prev.map((n, idx) => 
            idx === i ? { 
              ...n, 
              imageUrl: imageUrl || undefined, 
              audioUrl: audioUrl || undefined,
              status: (imageUrl || audioUrl) ? 'ready' : 'error'
            } : n
          ));
        } catch (err) {
          setDialogueNodes(prev => prev.map((n, idx) => 
            idx === i ? { ...n, status: 'error' } : n
          ));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  };

  const handlePlay = useCallback(async () => {
    if (isPlaying) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      if (audioRef.current) audioRef.current.pause();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    setIsPlaying(true);
    isPlayingRef.current = true;

    for (let i = currentIndex; i < dialogueNodes.length; i++) {
      if (!isPlayingRef.current) break;
      
      setCurrentIndex(i);
      const node = dialogueNodes[i];
      
      if (node.status === 'ready' || node.status === 'pending') {
        try {
          await playNodeAudio(node);
        } catch (e) {
          console.error('Playback error:', e);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    setIsPlaying(false);
    isPlayingRef.current = false;
  }, [isPlaying, currentIndex, dialogueNodes, playNodeAudio]);

  const handleNodeClick = (index: number) => {
    if (isPlaying) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      if (audioRef.current) audioRef.current.pause();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }
    setCurrentIndex(index);
  };

  const handleReset = () => {
    if (isPlaying) {
      setIsPlaying(false);
      isPlayingRef.current = false;
    }
    if (audioRef.current) audioRef.current.pause();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setCurrentIndex(0);
  };

  const readyCount = dialogueNodes.filter(n => n.status === 'ready').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <audio ref={audioRef} className="hidden" />

      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Sparkles className="w-6 h-6 text-purple-400" />
            </div>
            <h1 className="text-xl font-bold text-white">Prompt to Video Story</h1>
          </div>
          <div className="flex items-center gap-4">
            {dialogueNodes.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <ImageIcon className="w-4 h-4" />
                <span>{readyCount}/{dialogueNodes.length} ready</span>
              </div>
            )}
            <button
              onClick={toggleMute}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              {isMuted ? (
                <VolumeX className="w-5 h-5 text-gray-300" />
              ) : (
                <Volume2 className="w-5 h-5 text-gray-300" />
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Input Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Enter your story theme
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g., The Lost Kingdom, Space Odyssey, Ancient Egypt..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                disabled={isGenerating}
              />
              <button
                onClick={handleGenerateAll}
                disabled={!prompt.trim() || isGenerating}
                className={clsx(
                  "px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-all",
                  prompt.trim() && !isGenerating
                    ? "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/25"
                    : "bg-white/10 text-gray-500 cursor-not-allowed"
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
            {error && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-3 text-red-400 text-sm flex items-center gap-2"
              >
                <Info className="w-4 h-4" />
                {error}
              </motion.p>
            )}
          </div>
        </motion.div>

        {/* Story Timeline */}
        {dialogueNodes.length > 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            {/* Playback Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={handlePlay}
                  disabled={dialogueNodes.every(n => n.status === 'error' || n.status === 'pending')}
                  className={clsx(
                    "p-3 rounded-full flex items-center gap-2 transition-all",
                    dialogueNodes.some(n => n.status === 'ready')
                      ? "bg-purple-500 hover:bg-purple-600 text-white shadow-lg shadow-purple-500/25"
                      : "bg-white/10 text-gray-500 cursor-not-allowed"
                  )}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-5 h-5" />
                      <span className="font-medium">Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      <span className="font-medium">Play All</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleReset}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <RotateCcw className="w-5 h-5 text-gray-300" />
                </button>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                  disabled={currentIndex === 0}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-300" />
                </button>
                <span className="text-gray-300 text-sm">
                  {currentIndex + 1} / {dialogueNodes.length}
                </span>
                <button
                  onClick={() => setCurrentIndex(i => Math.min(dialogueNodes.length - 1, i + 1))}
                  disabled={currentIndex === dialogueNodes.length - 1}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-5 h-5 text-gray-300" />
                </button>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Image Display */}
              <motion.div 
                key={currentIndex}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="aspect-video bg-black/40 rounded-2xl overflow-hidden border border-white/10"
              >
                {dialogueNodes[currentIndex]?.imageUrl ? (
                  <img 
                    src={dialogueNodes[currentIndex].imageUrl} 
                    alt="Scene"
                    className="w-full h-full object-cover"
                  />
                ) : dialogueNodes[currentIndex]?.status === 'loading' ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="w-12 h-12 text-purple-400 animate-spin" />
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                    <ImageIcon className="w-16 h-16 mb-4 opacity-50" />
                    <p>Generate to see image</p>
                  </div>
                )}
              </motion.div>

              {/* Dialogue Card */}
              <motion.div 
                key={`dialogue-${currentIndex}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 flex flex-col"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                    {dialogueNodes[currentIndex]?.characterName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">{dialogueNodes[currentIndex]?.characterName}</h3>
                    <span className={clsx(
                      "text-xs px-2 py-0.5 rounded-full",
                      dialogueNodes[currentIndex]?.status === 'ready' && "bg-green-500/20 text-green-400",
                      dialogueNodes[currentIndex]?.status === 'loading' && "bg-yellow-500/20 text-yellow-400",
                      dialogueNodes[currentIndex]?.status === 'pending' && "bg-gray-500/20 text-gray-400",
                      dialogueNodes[currentIndex]?.status === 'error' && "bg-red-500/20 text-red-400"
                    )}>
                      {dialogueNodes[currentIndex]?.status}
                    </span>
                  </div>
                </div>
                <p className="text-gray-200 leading-relaxed flex-1">
                  {dialogueNodes[currentIndex]?.text}
                </p>
                <button
                  onClick={() => playNodeAudio(dialogueNodes[currentIndex])}
                  disabled={dialogueNodes[currentIndex]?.status === 'loading'}
                  className="mt-4 w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 text-gray-200 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>Play Voice</span>
                </button>
              </motion.div>
            </div>

            {/* Timeline Nodes */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {dialogueNodes.map((node, idx) => (
                <button
                  key={node.id}
                  onClick={() => handleNodeClick(idx)}
                  className={clsx(
                    "flex-shrink-0 w-12 h-12 rounded-lg border-2 flex items-center justify-center transition-all",
                    idx === currentIndex 
                      ? "border-purple-500 bg-purple-500/20" 
                      : "border-white/10 bg-white/5 hover:bg-white/10",
                    node.status === 'ready' && "border-green-500/50",
                    node.status === 'error' && "border-red-500/50",
                    node.status === 'loading' && "border-yellow-500/50"
                  )}
                >
                  {node.status === 'loading' ? (
                    <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />
                  ) : node.status === 'error' ? (
                    <span className="text-red-400 text-xs">!</span>
                  ) : (
                    <span className="text-gray-300 text-sm">{idx + 1}</span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Empty State */}
        {dialogueNodes.length === 0 && !isGenerating && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-white/5 flex items-center justify-center">
              <Sparkles className="w-12 h-12 text-purple-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Create Your Story</h2>
            <p className="text-gray-400 max-w-md mx-auto">
              Enter a theme above and let AI generate a complete visual story with characters, dialogue, and scenes.
            </p>
          </motion.div>
        )}
      </main>
    </div>
  );
}