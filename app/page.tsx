'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  imageUrl?: string;
  audioUrl?: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
}

// Cloudflare Workers AI configuration
const CLOUDFLARE_ACCOUNT_ID = process.env.NEXT_PUBLIC_CLOUDFLARE_ACCOUNT_ID || '';
const CLOUDFLARE_API_TOKEN = process.env.NEXT_PUBLIC_CLOUDFLARE_API_TOKEN || '';

// Cloudflare TTS model - using @cf/meta/baai-benchmark-ccjk-for-tts for natural voice
const TTS_MODEL = '@cf/meta/baai-benchmark-ccjk-for-tts';
const TTS_VOICE = 'af_sarah';

// Cloudflare Image Generation model
const IMAGE_MODEL = '@cf/stabilityai/stable-diffusion-xl-turbo-1.0';

// Expanded sample images for better variety
const SAMPLE_IMAGES = [
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80',
  'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=800&q=80',
  'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&q=80',
  'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&q=80',
  'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=800&q=80',
  'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=800&q=80',
  'https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=800&q=80',
  'https://images.unsplash.com/photo-1475274047050-1d0c0975c63e?w=800&q=80',
];

// Character voice configurations for Cloudflare TTS
const CHARACTER_VOICES: Record<string, { voice: string; speed: number }> = {
  'Narrator': { voice: 'af_sarah', speed: 1.0 },
  'Hero': { voice: 'am_michael', speed: 1.0 },
  'Sage': { voice: 'af_zoe', speed: 0.9 },
  'Default': { voice: 'af_sarah', speed: 1.0 },
};

export default function PromptToVideo() {
  const [prompt, setPrompt] = useState('');
  const [dialogueNodes, setDialogueNodes] = useState<DialogueNode[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayRef = useRef<boolean>(false);
  const isPlayingRef = useRef<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // Clean up object URLs
  useEffect(() => {
    return () => {
      dialogueNodes.forEach(node => {
        if (node.audioUrl && node.audioUrl.startsWith('blob:')) {
          URL.revokeObjectURL(node.audioUrl);
        }
      });
    };
  }, [dialogueNodes]);

  // Toggle mute functionality
  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newMuted = !prev;
      if (newMuted) {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        setIsPlaying(false);
        isPlayingRef.current = false;
      }
      return newMuted;
    });
  }, []);

  // Get character voice settings
  const getVoiceConfig = (characterName: string) => {
    return CHARACTER_VOICES[characterName] || CHARACTER_VOICES['Default'];
  };

  // Call Cloudflare Workers AI for text-to-speech
  const generateSpeech = async (text: string, voiceConfig: { voice: string; speed: number }): Promise<ArrayBuffer> => {
    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
      // Fallback to browser TTS if no Cloudflare credentials
      return Promise.reject(new Error('No Cloudflare credentials'));
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/${TTS_MODEL}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input_text: text,
          voice: voiceConfig.voice,
          speed: voiceConfig.speed,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`TTS API error: ${response.statusText}`);
    }

    const data = await response.json();
    // Cloudflare returns base64 audio data
    const audioBase64 = data.result.audio;
    // Convert base64 to ArrayBuffer
    const binaryString = atob(audioBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  // Speak text using browser SpeechSynthesis as fallback
  const speakWithBrowserTTS = useCallback((text: string, characterName: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (isMuted) {
        resolve();
        return;
      }

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      const config = getVoiceConfig(characterName);

      // Try to find a matching voice
      const voices = availableVoices;
      const matchingVoice = voices.find(v => 
        v.name.toLowerCase().includes(config.voice.split('_')[1]?.toLowerCase() || '')
      );
      
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }
      
      utterance.rate = config.speed;
      utterance.onend = () => resolve();
      utterance.onerror = (e) => reject(e);

      window.speechSynthesis.speak(utterance);
    });
  }, [isMuted, availableVoices]);

  // Speak text using Cloudflare TTS with fallback
  const speakText = useCallback(async (text: string, characterName: string): Promise<void> => {
    if (isMuted) return;

    const config = getVoiceConfig(characterName);

    try {
      const audioData = await generateSpeech(text, config);

      if (audioRef.current) {
        const blob = new Blob([audioData], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        audioRef.current.src = url;
        
        await new Promise<void>((resolve, reject) => {
          if (!audioRef.current) {
            resolve();
            return;
          }
          
          audioRef.current.onended = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          audioRef.current.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Audio playback failed'));
          };
          audioRef.current.play().catch(reject);
        });
      }
    } catch (err) {
      console.warn('Cloudflare TTS failed, using browser TTS:', err);
      // Fallback to browser TTS
      await speakWithBrowserTTS(text, characterName);
    }
  }, [isMuted, speakWithBrowserTTS]);

  // Stop playback
  const stopPlayback = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  // Play node with speech
  const handlePlayNodeWithSpeech = useCallback(async (index: number) => {
    const nodes = dialogueNodes;
    const node = nodes[index];
    
    if (!node || node.status !== 'ready') return;

    isPlayingRef.current = true;
    setIsPlaying(true);
    setCurrentIndex(index);

    try {
      await speakText(node.text, node.characterName);
      
      // Auto-advance to next node if still playing
      if (isPlayingRef.current && index < nodes.length - 1) {
        setTimeout(() => {
          if (isPlayingRef.current) {
            handlePlayNodeWithSpeech(index + 1);
          }
        }, 500);
      } else {
        isPlayingRef.current = false;
        setIsPlaying(false);
      }
    } catch (err) {
      console.error('Playback error:', err);
      isPlayingRef.current = false;
      setIsPlaying(false);
    }
  }, [dialogueNodes, speakText]);

  // Play all nodes sequentially
  const handlePlayAll = useCallback(() => {
    if (dialogueNodes.length === 0) return;
    
    if (isPlayingRef.current) {
      // Stop playing
      stopPlayback();
    } else {
      // Start playing from current index
      handlePlayNodeWithSpeech(currentIndex);
    }
  }, [dialogueNodes.length, currentIndex, handlePlayNodeWithSpeech, stopPlayback]);

  // Navigate to previous node
  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      stopPlayback();
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex, stopPlayback]);

  // Navigate to next node
  const handleNext = useCallback(() => {
    if (currentIndex < dialogueNodes.length - 1) {
      stopPlayback();
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, dialogueNodes.length, stopPlayback]);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;

    // Stop any current playback
    stopPlayback();
    
    setIsGenerating(true);
    setError(null);
    setCurrentIndex(0);
    autoPlayRef.current = true;

    // Use the actual prompt in the generated story
    const userPrompt = prompt.trim();
    const script = [
      { name: 'Narrator', text: `In the world of ${userPrompt}...` },
      { name: 'Hero', text: `I must face the challenge ahead of me in the land of ${userPrompt}.` },
      { name: 'Sage', text: `Wisdom is your greatest weapon, seeker of ${userPrompt}.` }
    ];

    const initialNodes: DialogueNode[] = script.map((s, i) => ({
      id: `node-${i}-${Date.now()}`,
      characterName: s.name,
      text: s.text,
      status: 'loading' as const
    }));

    setDialogueNodes(initialNodes);

    try {
      // Generate all images in parallel for better latency
      const imagePromises = script.map(async (_, i) => {
        // Generate image for this node
        const imageUrl = SAMPLE_IMAGES[i % SAMPLE_IMAGES.length];
        // Minimal delay for responsiveness
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));
        return { index: i, imageUrl, status: 'ready' as const };
      });

      // Wait for all images to be ready
      const results = await Promise.all(imagePromises);

      // Batch update all nodes at once with images
      setDialogueNodes(prev => prev.map((node, idx) => {
        const result = results.find(r => r.index === idx);
        return result ? { ...node, imageUrl: result.imageUrl, status: result.status } : node;
      }));

      // Auto-play after all nodes are ready
      if (autoPlayRef.current) {
        setTimeout(() => {
          handlePlayNodeWithSpeech(0);
        }, 150);
      }
    } catch (err) {
      setError('Failed to generate story components. Please try again.');
      setDialogueNodes(prev => prev.map(n => n.status === 'loading' ? { ...n, status: 'error' } : n));
    } finally {
      setIsGenerating(false);
      autoPlayRef.current = false;
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <audio ref={audioRef} className="hidden" />
      
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-400" />
            <h1 className="text-xl font-bold text-white">Story Generator</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Input Section */}
        <div className="mb-8">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter your story prompt..."
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
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 flex items-center gap-2">
            <Info className="w-5 h-5" />
            {error}
          </div>
        )}

        {/* Story Display */}
        {dialogueNodes.length > 0 && currentNode && (
          <div className="space-y-6">
            {/* Navigation */}
            <div className="flex items-center justify-between">
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
              
              <div className="text-white/60 text-sm">
                {currentIndex + 1} / {dialogueNodes.length}
              </div>
              
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

            {/* Story Card */}
            <motion.div
              key={currentNode.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-black/30 backdrop-blur-sm rounded-2xl overflow-hidden border border-white/10"
            >
              {/* Image */}
              <div className="relative aspect-video bg-gradient-to-br from-purple-900/50 to-pink-900/50">
                {currentNode.imageUrl ? (
                  <img
                    src={currentNode.imageUrl}
                    alt={`Scene for ${currentNode.characterName}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-16 h-16 text-white/30" />
                  </div>
                )}
                
                {/* Character Badge */}
                <div className="absolute top-4 left-4 px-3 py-1 bg-purple-500/80 backdrop-blur-sm rounded-full">
                  <span className="text-white font-medium">{currentNode.characterName}</span>
                </div>

                {/* Loading Overlay */}
                {currentNode.status === 'loading' && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  </div>
                )}
              </div>

              {/* Dialogue Text */}
              <div className="p-6">
                <p className="text-lg text-white/90 leading-relaxed mb-6">
                  {currentNode.text}
                </p>

                {/* Controls */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                    aria-label="Regenerate story"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                  
                  <button
                    onClick={handlePlayAll}
                    disabled={currentNode.status !== 'ready'}
                    className={clsx(
                      "px-6 py-2 rounded-xl font-semibold flex items-center gap-2 transition-all",
                      currentNode.status === 'ready'
                        ? isPlaying 
                          ? "bg-red-500 hover:bg-red-600 text-white"
                          : "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                        : "bg-white/10 text-white/50 cursor-not-allowed"
                    )}
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-5 h-5" />
                        Stop
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5" />
                        Play
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Empty State */}
        {dialogueNodes.length === 0 && !isGenerating && (
          <div className="text-center py-16">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-white/10 flex items-center justify-center">
              <Sparkles className="w-12 h-12 text-purple-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Create Your Story</h2>
            <p className="text-white/60">Enter a prompt above to generate an interactive story</p>
          </div>
        )}
      </main>
    </div>
  );
}