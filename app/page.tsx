'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, Pause, Wand2, Volume2, Image as ImageIcon,
  Loader2, Sparkles, ChevronLeft, ChevronRight,
  VolumeX, Info
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

// Sample images for demo (using unsplash)
const SAMPLE_IMAGES = [
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80',
  'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=800&q=80',
  'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&q=80',
];

// Character voice configurations using SpeechSynthesis
const CHARACTER_VOICES: Record<string, { rate: number; pitch: number; voiceIndex: number }> = {
  'Narrator': { rate: 0.9, pitch: 1.0, voiceIndex: 0 },
  'Hero': { rate: 1.0, pitch: 0.9, voiceIndex: 1 },
  'Sage': { rate: 0.85, pitch: 1.1, voiceIndex: 2 },
  'Default': { rate: 1.0, pitch: 1.0, voiceIndex: 0 },
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
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const autoPlayRef = useRef<boolean>(false);

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

  // Get character voice settings
  const getVoiceConfig = (characterName: string) => {
    return CHARACTER_VOICES[characterName] || CHARACTER_VOICES['Default'];
  };

  // Speak text using character voice (not narrator voice for characters)
  const speakText = useCallback((text: string, characterName: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      const config = getVoiceConfig(characterName);
      
      // Get appropriate voice - prefer different voices for different characters
      const voices = availableVoices.length > 0 ? availableVoices : window.speechSynthesis.getVoices();
      
      // Select voice based on character - use different voices for characters vs narrator
      if (characterName !== 'Narrator' && voices.length > 1) {
        // For characters, use a more expressive voice (typically different from default)
        const charVoiceIndex = Math.min(config.voiceIndex, voices.length - 1);
        utterance.voice = voices[charVoiceIndex] || voices[0];
        utterance.pitch = config.pitch;
        utterance.rate = config.rate;
      } else {
        // For narrator, use the default/first voice
        utterance.voice = voices[0] || null;
        utterance.rate = config.rate;
        utterance.pitch = config.pitch;
      }

      utterance.onend = () => resolve();
      utterance.onerror = (e) => reject(e);

      speechRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    });
  }, [availableVoices]);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;

    // Stop any current playback
    window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setIsPlaying(false);
    setIsGenerating(true);
    setError(null);
    setCurrentIndex(0);
    autoPlayRef.current = true; // Enable autoplay when first node is ready

    const script = [
      { name: 'Narrator', text: `In the world of ${prompt.slice(0, 20)}...` },
      { name: 'Hero', text: "I must face the challenge ahead of me." },
      { name: 'Sage', text: "Wisdom is your greatest weapon, seeker." }
    ];

    const initialNodes: DialogueNode[] = script.map((s, i) => ({
      id: `node-${i}-${Date.now()}`,
      characterName: s.name,
      text: s.text,
      status: 'loading'
    }));
    
    setDialogueNodes(initialNodes);

    try {
      for (let i = 0; i < script.length; i++) {
        // Use browser-native SpeechSynthesis for TTS (character voices)
        // and a placeholder image since we can't use external APIs in static export
        const imageUrl = SAMPLE_IMAGES[i % SAMPLE_IMAGES.length];
        
        // Simulate async generation with browser-native APIs
        await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 500));

        setDialogueNodes(prev => prev.map((node, idx) => 
          idx === i ? { 
            ...node, 
            imageUrl, 
            status: 'ready' 
          } : node
        ));

        // Autoplay when first node (index 0) is ready
        if (i === 0 && autoPlayRef.current) {
          setTimeout(() => {
            handlePlayNodeWithSpeech(i);
          }, 100);
        }
      }
    } catch (err) {
      setError('Failed to generate story components. Please try again.');
      setDialogueNodes(prev => prev.map(n => n.status === 'loading' ? { ...n, status: 'error' } : n));
    } finally {
      setIsGenerating(false);
      autoPlayRef.current = false;
    }
  };

  // Play node with SpeechSynthesis (character voices)
  const handlePlayNodeWithSpeech = async (index: number) => {
    const node = dialogueNodes[index];
    if (!node || node.status !== 'ready') return;

    setIsPlaying(true);
    setCurrentIndex(index);

    try {
      await speakText(node.text, node.characterName);
    } catch (err) {
      console.error('Speech error:', err);
      setIsPlaying(false);
    }
  };

  // Toggle play using SpeechSynthesis
  const togglePlay = () => {
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    } else {
      handlePlayNodeWithSpeech(currentIndex);
    }
  };

  // Handle when speech ends
  useEffect(() => {
    const checkSpeechEnded = setInterval(() => {
      if (isPlaying && !window.speechSynthesis.speaking) {
        setIsPlaying(false);
        
        // Auto-advance to next node
        if (currentIndex < dialogueNodes.length - 1) {
          const nextIndex = currentIndex + 1;
          if (dialogueNodes[nextIndex]?.status === 'ready') {
            setTimeout(() => {
              handlePlayNodeWithSpeech(nextIndex);
            }, 300);
          }
        }
      }
    }, 100);

    return () => clearInterval(checkSpeechEnded);
  }, [isPlaying, currentIndex, dialogueNodes]);

  const playNode = (index: number) => {
    handlePlayNodeWithSpeech(index);
  };

  const currentNode = dialogueNodes[currentIndex];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col p-4 md:p-8">
      <audio ref={audioRef} className="hidden" />

      <div className="max-w-5xl mx-auto w-full space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="bg-purple-600 p-2 rounded-xl">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Visionary AI</h1>
              <p className="text-neutral-500 text-sm">Prompt to Cinematic Scene</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <input 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A futuristic cyber-city at dusk..."
              className="bg-neutral-900 border border-neutral-800 px-4 py-2.5 rounded-xl w-full sm:w-72 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-900/20"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              Generate
            </button>
          </div>
        </header>

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center gap-3"
          >
            <Info className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-6">
            <div className="relative aspect-video rounded-3xl overflow-hidden bg-neutral-900 border border-neutral-800 shadow-2xl">
              <AnimatePresence mode="wait">
                {currentNode?.imageUrl ? (
                  <motion.img
                    key={currentNode.imageUrl}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    src={currentNode.imageUrl}
                    alt="Scene"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-neutral-600">
                    {isGenerating ? <Loader2 className="w-10 h-10 animate-spin" /> : <ImageIcon className="w-12 h-12" />}
                    <p className="text-sm font-medium">{isGenerating ? 'Synthesizing scene...' : 'No scene generated'}</p>
                  </div>
                )}
              </AnimatePresence>

              {/* Overlay Content */}
              {currentNode && (
                <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-10 bg-gradient-to-t from-black/90 via-black/20 to-transparent">
                  <motion.div
                    key={currentIndex}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                  >
                    <span className="inline-block px-3 py-1 rounded-full bg-purple-600/90 text-[10px] font-bold uppercase tracking-widest text-white">
                      {currentNode.characterName}
                    </span>
                    <p className="text-lg md:text-2xl font-medium leading-relaxed max-w-2xl text-white drop-shadow-md">
                      "{currentNode.text}"
                    </p>
                  </motion.div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between bg-neutral-900/80 backdrop-blur-sm p-4 rounded-2xl border border-neutral-800 shadow-lg">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    window.speechSynthesis.cancel();
                    const idx = Math.max(0, currentIndex - 1);
                    setCurrentIndex(idx);
                    if (isPlaying) playNode(idx);
                  }}
                  disabled={currentIndex === 0 || dialogueNodes.length === 0}
                  className="p-3 hover:bg-neutral-800 rounded-xl disabled:opacity-20 transition-colors"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={() => {
                    window.speechSynthesis.cancel();
                    const idx = Math.min(dialogueNodes.length - 1, currentIndex + 1);
                    setCurrentIndex(idx);
                    if (isPlaying) playNode(idx);
                  }}
                  disabled={currentIndex === dialogueNodes.length - 1 || dialogueNodes.length === 0}
                  className="p-3 hover:bg-neutral-800 rounded-xl disabled:opacity-20 transition-colors"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>

              <button
                onClick={togglePlay}
                disabled={!currentNode || currentNode.status !== 'ready'}
                className="bg-neutral-100 text-neutral-950 p-5 rounded-full hover:scale-105 active:scale-95 disabled:opacity-50 transition-all shadow-xl"
              >
                {isPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current" />}
              </button>

              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-3 hover:bg-neutral-800 rounded-xl text-neutral-400 transition-colors"
                >
                  {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                </button>
                <div className="hidden sm:block text-xs font-mono text-neutral-500 bg-black/30 px-3 py-1.5 rounded-lg border border-neutral-800">
                  {String(currentIndex + 1).padStart(2, '0')} / {String(dialogueNodes.length).padStart(2, '0')}
                </div>
              </div>
            </div>
          </div>

          {/* Scene Navigator - Characters shown on nodes, no separate characters section */}
          <div className="lg:col-span-4 space-y-4">
            <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest px-2">Scene Navigator</h3>
            <div className="space-y-3">
              {dialogueNodes.length > 0 ? (
                dialogueNodes.map((node, idx) => (
                  <button
                    key={node.id}
                    onClick={() => {
                      window.speechSynthesis.cancel();
                      setCurrentIndex(idx);
                      if (isPlaying) playNode(idx);
                    }}
                    className={clsx(
                      "node-indicator w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group",
                      currentIndex === idx 
                        ? "bg-purple-600/10 border-purple-500/50" 
                        : "bg-neutral-900/40 border-neutral-800 hover:border-neutral-700"
                    )}
                  >
                    <div className={clsx(
                      "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold",
                      node.status === 'ready' ? "bg-purple-600 text-white" :
                      node.status === 'loading' ? "bg-neutral-700 text-neutral-400 animate-pulse" :
                      node.status === 'error' ? "bg-red-600 text-white" : "bg-neutral-800 text-neutral-500"
                    )}>
                      {node.status === 'loading' ? <Loader2 className="w-5 h-5 animate-spin" /> : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={clsx(
                        "font-medium truncate",
                        currentIndex === idx ? "text-white" : "text-neutral-400 group-hover:text-neutral-200"
                      )}>
                        {node.characterName}
                      </p>
                      <p className="text-xs text-neutral-500 truncate mt-0.5">{node.text}</p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-center py-8 text-neutral-600">
                  <p className="text-sm">No scenes generated yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}