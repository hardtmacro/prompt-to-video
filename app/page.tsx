'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  RefreshCw, 
  Sparkles, 
  Mic2, 
  Video, 
  FileText, 
  Loader2,
  ArrowRight,
  ChevronDown,
  CheckCircle2,
  Volume2,
  VolumeX,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

// Types
interface Scene {
  id: string;
  imagePrompt: string;
  dialogue: string;
  characterName: string;
  narration: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  voiceId?: string;
  isGenerating?: boolean;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'system';
  text: string;
  timestamp: string;
}

// Character voice mappings - mapped to typical Kokoro/TTS voice IDs
const CHARACTER_VOICES: Record<string, string> = {
  'Narrator': 'af_sarah',
  'Visionary': 'af_adam',
  'Team Lead': 'af_sky',
  'Innovator': 'af_nicole',
  'Hero': 'am_eric',
  'Guide': 'af_bella',
  'Challenger': 'am_liam',
  'Sage': 'am_michael',
  'Spark': 'af_river',
  'Echo': 'am_fenrir',
  'Default': 'af_heart'
};

// Story arc template for 10+ nodes
const STORY_ARC_TEMPLATE = {
  setup: [
    { characterName: 'Narrator', dialogue: 'In a world where challenges seem insurmountable...', narration: 'Every great story begins with a single step into the unknown.' },
    { characterName: 'Visionary', dialogue: 'I see a different future. One where we rise together.', narration: 'The Visionary speaks of possibilities that others cannot yet see.' }
  ],
  conflict: [
    { characterName: 'Challenger', dialogue: 'Why should we believe? We have been disappointed before.', narration: 'Doubt casts long shadows, but it also reveals true conviction.' },
    { characterName: 'Guide', dialogue: 'The path is difficult, but not impossible. Trust the process.', narration: 'Experience speaks through the Guide, offering wisdom earned through trials.' },
    { characterName: 'Hero', dialogue: 'I will be the first to try. Watch me.', narration: 'Courage is the decision that something else matters more than fear.' }
  ],
  climax: [
    { characterName: 'Spark', dialogue: 'Together we are stronger! Let us unite!', narration: 'Individual sparks become a blazing fire of collective determination.' },
    { characterName: 'Echo', dialogue: 'I hear your call and I answer. We are many, now.', narration: 'One voice becomes many, echoing across the boundaries that once divided.' }
  ],
  resolution: [
    { characterName: 'Narrator', dialogue: 'And so the journey transformed everyone it touched.', narration: 'The circle of influence expanded beyond imagination.' },
    { characterName: 'Visionary', dialogue: 'This was always possible. You just needed to believe.', narration: 'The dream now stands as testament to human potential.' },
    { characterName: 'Sage', dialogue: 'Remember this moment. It will guide your tomorrow.', narration: 'Every ending is a new beginning waiting to unfold.' }
  ]
};

const generateImagePrompt = (characterName: string, sceneIndex: number, theme: string): string => {
  const backgrounds = [
    'serene mountain landscape at dawn',
    'modern office space with floor-to-ceiling windows',
    'cozy library filled with ancient books',
    'bustling city square with people collaborating',
    'peaceful forest with rays of sunlight',
    'futuristic technology hub with holographic displays',
    'coastal sunset with waves gently rolling',
    'mountain peak above the clouds',
    'intimate campfire gathering under starlit sky',
    'sprawling garden in full bloom'
  ];
  return `Cinematic 8k portrait of ${characterName}, ${backgrounds[sceneIndex % backgrounds.length]}, artistic style, thematic to ${theme}, consistent character design`;
};

const buildStoryArcHelper = (userPrompt: string): Scene[] => {
  const storyScenes: Scene[] = [];
  const theme = userPrompt.toLowerCase().split(' ').slice(0, 3).join(' ');
  
  const allSections = [
    ...STORY_ARC_TEMPLATE.setup,
    ...STORY_ARC_TEMPLATE.conflict,
    ...STORY_ARC_TEMPLATE.climax,
    ...STORY_ARC_TEMPLATE.resolution
  ];

  return allSections.map((item, index) => ({
    id: `scene-${index}`,
    characterName: item.characterName,
    dialogue: item.dialogue,
    narration: item.narration,
    imagePrompt: generateImagePrompt(item.characterName, index, theme),
    voiceId: CHARACTER_VOICES[item.characterName] || CHARACTER_VOICES['Default'],
    isGenerating: false
  }));
};

export default function PromptToVideoApp() {
  const [prompt, setPrompt] = useState<string>("A journey of innovation and unity");
  const [isGenerating, setIsGenerating] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentSceneIndex, setCurrentSceneIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scenesRef = useRef<Scene[]>([]);
  
  // Web Speech API ref for pre-generation announcements
  const speechSynthesisRef = useRef<SpeechSynthesis | null>(null);

  // Hydration fix
  useEffect(() => {
    setHasHydrated(true);
    if (typeof window !== 'undefined') {
      speechSynthesisRef.current = window.speechSynthesis;
    }
    setChatMessages([{
      id: 'init',
      sender: 'system',
      text: "Ready to generate your visual story. Enter a prompt to begin.",
      timestamp: new Date().toLocaleTimeString()
    }]);
    audioRef.current = new Audio();
  }, []);

  // Update scenesRef to keep track of current state in callbacks
  useEffect(() => {
    scenesRef.current = scenes;
  }, [scenes]);

  // Audio auto-play and transition logic
  useEffect(() => {
    if (!audioRef.current) return;

    const handleEnded = () => {
      const nextIndex = currentSceneIndex + 1;
      if (nextIndex < scenes.length) {
        // Only move to next if it's ready, otherwise wait for buffer
        if (scenes[nextIndex].audioUrl && scenes[nextIndex].imageUrl) {
          setCurrentSceneIndex(nextIndex);
        } else {
          // Buffering state - stay on current index but stop playing until next is ready
          // In this implementation, the generation loop will trigger it
        }
      } else {
        setIsPlaying(false);
      }
    };

    audioRef.current.onended = handleEnded;
    return () => {
      if (audioRef.current) audioRef.current.onended = null;
    };
  }, [currentSceneIndex, scenes, isPlaying]);

  // Scene transition side effect
  useEffect(() => {
    if (isPlaying && currentSceneIndex >= 0 && scenes[currentSceneIndex]?.audioUrl) {
      if (audioRef.current) {
        audioRef.current.src = scenes[currentSceneIndex].audioUrl!;
        audioRef.current.muted = isMuted;
        audioRef.current.play().catch(e => console.error("Playback error", e));
      }
    }
  }, [currentSceneIndex, isPlaying, scenes, isMuted]);

  // Pre-generation character line announcement function
  const announceCharacterLines = useCallback(async (newScenes: Scene[]) => {
    if (!speechSynthesisRef.current) return;
    
    try {
      for (const scene of newScenes) {
        // Cancel any ongoing speech
        speechSynthesisRef.current.cancel();
        
        const utterance = new SpeechSynthesisUtterance(scene.characterName + ": " + scene.dialogue);
        
        // Fix: Use character-specific voice selection based on CHARACTER_VOICES mapping
        const targetVoiceId = scene.voiceId || 'af_sarah';
        const voices = speechSynthesisRef.current.getVoices();
        const voice = voices.find(v => v.name.includes(targetVoiceId) || v.lang === 'en-US');
        
        if (voice) {
          utterance.voice = voice;
        }
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        
        await new Promise((resolve, reject) => {
          utterance.onend = resolve;
          utterance.onerror = reject;
          speechSynthesisRef.current?.speak(utterance);
        });
      }
    } catch (error) {
      console.error("Error in character announcements:", error);
    }
  }, []);

  const updateScene = (index: number, updates: Partial<Scene>) => {
    setScenes(prev => {
      const newScenes = [...prev];
      newScenes[index] = { ...newScenes[index], ...updates };
      return newScenes;
    });
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
    
    setIsGenerating(true);
    setIsPlaying(false);
    setCurrentSceneIndex(-1);
    
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Clear previous audio URLs to avoid memory leaks
    scenes.forEach(scene => {
      if (scene.audioUrl) URL.revokeObjectURL(scene.audioUrl);
    });

    const newScenes = buildStoryArcHelper(prompt);
    setScenes(newScenes);

    // Announce character lines before generation begins
    await announceCharacterLines(newScenes);

    // Sequence: For each node, generate audio FIRST, then image.
    // Start playing as soon as scene 0 is ready.
    for (let i = 0; i < newScenes.length; i++) {
      if (signal.aborted) break;

      updateScene(i, { isGenerating: true });

      try {
        // 1. Generate Voice Audio (matching character voice)
        const ttsRes = await fetch('/api/text-to-speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            text: newScenes[i].dialogue,
            voiceId: newScenes[i].voiceId 
          }),
          signal
        });

        if (ttsRes.ok) {
          const blob = await ttsRes.blob();
          const audioUrl = URL.createObjectURL(blob);
          updateScene(i, { audioUrl });
          
          // CRITICAL: Automatically start playing when the first node's audio is ready
          if (i === 0) {
            setCurrentSceneIndex(0);
            setIsPlaying(true);
          }
        }

        // 2. Generate Image
        const imgRes = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: newScenes[i].imagePrompt }),
          signal
        });

        if (imgRes.ok) {
          const { url } = await imgRes.json();
          updateScene(i, { imageUrl: url, isGenerating: false });

          // If we were waiting for this scene to play (it's the next in line)
          if (isPlaying && currentSceneIndex === i - 1 && audioRef.current?.paused) {
             setCurrentSceneIndex(i);
          }
        }
      } catch (error) {
        console.error("Generation error", error);
        updateScene(i, { isGenerating: false });
      }
    }
    
    setIsGenerating(false);
  };

  const togglePlay = () => {
    if (currentSceneIndex === -1 && scenes.length > 0) {
      setCurrentSceneIndex(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
      if (audioRef.current) {
        if (isPlaying) audioRef.current.pause();
        else audioRef.current.play();
      }
    }
  };

  if (!hasHydrated) return <div className="min-h-screen bg-neutral-950" />;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-indigo-500/30 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-600 rounded-lg">
            <Video className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Cine<span className="text-indigo-500">Flow</span></h1>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 hover:bg-neutral-800 rounded-full transition-colors"
          >
            {isMuted ? <VolumeX className="w-5 h-5 text-neutral-400" /> : <Volume2 className="w-5 h-5 text-indigo-400" />}
          </button>
          <div className="h-8 w-px bg-neutral-800" />
          <div className="flex -space-x-2">
            {[1,2,3].map(i => (
              <div key={i} className="w-8 h-8 rounded-full border-2 border-neutral-950 bg-neutral-800 flex items-center justify-center overflow-hidden">
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i + 10}`} alt="avatar" />
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Controls & Input */}
        <div className="w-96 border-r border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-6 overflow-y-auto">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-indigo-400 font-medium">
              <Sparkles className="w-4 h-4" />
              <span>Prompt Engine</span>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your story arc..."
              className="w-full h-32 bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none transition-all"
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt}
              className={clsx(
                "w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all",
                isGenerating ? "bg-neutral-800 text-neutral-500" : "bg-indigo-600 hover:bg-indigo-500 text-white"
              )}
            >
              {isGenerating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <RefreshCw className="w-5 h-5" />
              )}
              {isGenerating ? "Synthesizing Story..." : "Generate Production"}
            </button>
          </div>

          <div className="flex-1 flex flex-col gap-4">
            <div className="flex items-center justify-between text-neutral-400 text-sm font-medium">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span>Script Progress</span>
              </div>
              <span>{scenes.filter(s => s.imageUrl).length}/{scenes.length}</span>
            </div>
            
            <div className="space-y-3 overflow-y-auto pr-2 max-h-[400px]">
              {scenes.map((scene, idx) => (
                <div 
                  key={scene.id}
                  onClick={() => scene.imageUrl && setCurrentSceneIndex(idx)}
                  className={clsx(
                    "p-3 rounded-lg border cursor-pointer transition-all flex gap-3",
                    currentSceneIndex === idx ? "bg-indigo-900/20 border-indigo-500" : "bg-neutral-900 border-neutral-800 hover:border-neutral-700"
                  )}
                >
                  <div className="w-12 h-12 rounded-md bg-neutral-800 overflow-hidden flex-shrink-0 relative">
                    {scene.imageUrl ? (
                      <img src={scene.imageUrl} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className={clsx("w-4 h-4 text-neutral-600", scene.isGenerating && "animate-spin text-indigo-500")} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">{scene.characterName}</span>
                      {scene.imageUrl && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                    </div>
                    <p className="text-xs text-neutral-300 line-clamp-1 italic">"{scene.dialogue}"</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center: Stage */}
        <div className="flex-1 bg-neutral-900 relative flex flex-col">
          <div className="flex-1 relative flex items-center justify-center p-12 overflow-hidden">
            <AnimatePresence mode="wait">
              {currentSceneIndex >= 0 && scenes[currentSceneIndex] ? (
                <motion.div
                  key={scenes[currentSceneIndex].id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  transition={{ duration: 0.8 }}
                  className="relative aspect-video w-full max-w-5xl rounded-2xl overflow-hidden shadow-2xl shadow-black/50 border border-neutral-800"
                >
                  {scenes[currentSceneIndex].imageUrl ? (
                    <img 
                      src={scenes[currentSceneIndex].imageUrl!} 
                      className="w-full h-full object-cover"
                      alt="Scene View"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-neutral-950 flex flex-col items-center justify-center gap-4">
                      <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                      <p className="text-neutral-400 animate-pulse">Buffering visual data...</p>
                    </div>
                  )}

                  {/* Character Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/90 via-black/40 to-transparent">
                    <motion.div
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className="max-w-3xl"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <span className="px-2 py-0.5 bg-indigo-600 text-[10px] font-bold uppercase rounded tracking-widest text-white">
                          {scenes[currentSceneIndex].characterName}
                        </span>
                        <div className="h-px flex-1 bg-neutral-700/50" />
                      </div>
                      <h2 className="text-2xl font-semibold text-white leading-relaxed mb-1">
                        "{scenes[currentSceneIndex].dialogue}"
                      </h2>
                      <p className="text-neutral-400 text-sm italic font-light">
                        {scenes[currentSceneIndex].narration}
                      </p>
                    </motion.div>
                  </div>
                </motion.div>
              ) : (
                <div className="text-center space-y-4">
                  <div className="w-24 h-24 bg-neutral-800 rounded-full mx-auto flex items-center justify-center border border-neutral-700">
                    <Video className="w-10 h-10 text-neutral-600" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-medium text-neutral-400">Waiting for Script</h3>
                    <p className="text-neutral-600 text-sm">Enter a prompt to start generating your cinematic journey</p>
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Media Controls */}
          <div className="h-24 bg-neutral-950 border-t border-neutral-800 px-8 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <button 
                onClick={() => setCurrentSceneIndex(Math.max(0, currentSceneIndex - 1))}
                className="text-neutral-500 hover:text-white transition-colors"
                disabled={currentSceneIndex <= 0}
              >
                <ArrowRight className="w-6 h-6 rotate-180" />
              </button>
              
              <button 
                onClick={togglePlay}
                className="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center hover:bg-indigo-500 transition-all active:scale-95 shadow-lg shadow-indigo-600/20"
              >
                {isPlaying ? <Pause className="w-6 h-6 fill-white text-white" /> : <Play className="w-6 h-6 fill-white text-white ml-1" />}
              </button>

              <button 
                onClick={() => {
                  if (currentSceneIndex < scenes.length - 1 && scenes[currentSceneIndex + 1].imageUrl) {
                    setCurrentSceneIndex(currentSceneIndex + 1);
                  }
                }}
                className="text-neutral-500 hover:text-white transition-colors"
                disabled={currentSceneIndex >= scenes.length - 1}
              >
                <ArrowRight className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 mx-12">
              <div className="flex justify-between text-[10px] text-neutral-500 uppercase tracking-widest mb-2 font-bold">
                <span>Timeline</span>
                <span>{currentSceneIndex >= 0 ? `${currentSceneIndex + 1} / ${scenes.length}` : '0 / 0'}</span>
              </div>
              <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-indigo-500"
                  animate={{ width: `${scenes.length > 0 ? ((currentSceneIndex + 1) / scenes.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono text-neutral-500">
              <div className="flex items-center gap-2">
                <div className={clsx("w-2 h-2 rounded-full", isGenerating ? "bg-amber-500 animate-pulse" : "bg-green-500")} />
                <span>{isGenerating ? "BUFFERING" : "STABLE"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Activity Feed */}
        <div className="w-80 border-l border-neutral-800 bg-neutral-950 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-neutral-800 flex items-center gap-2 font-bold text-xs uppercase tracking-widest text-neutral-500">
            <MessageSquare className="w-4 h-4" />
            <span>Activity Log</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.map(msg => (
              <div key={msg.id} className="space-y-1">
                <div className="flex justify-between items-center text-[10px]">
                  <span className={clsx("font-bold uppercase", msg.sender === 'system' ? "text-indigo-400" : "text-emerald-400")}>
                    {msg.sender}
                  </span>
                  <span className="text-neutral-600">{msg.timestamp}</span>
                </div>
                <p className="text-xs text-neutral-400 leading-relaxed bg-neutral-900/50 p-3 rounded-lg border border-neutral-800">
                  {msg.text}
                </p>
              </div>
            ))}
            {isGenerating && (
              <div className="space-y-2 animate-pulse">
                <div className="h-2 w-20 bg-neutral-800 rounded" />
                <div className="h-16 w-full bg-neutral-800 rounded" />
              </div>
            )}
          </div>
          <div className="p-4 bg-neutral-900/30 border-t border-neutral-800">
            <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-bold uppercase mb-2">
              <Mic2 className="w-3 h-3" />
              <span>Voice Profiles</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {Object.keys(CHARACTER_VOICES).slice(0, 8).map(v => (
                <div key={v} className="aspect-square rounded bg-neutral-800 border border-neutral-700 flex items-center justify-center group cursor-help relative" title={v}>
                  <span className="text-[10px] text-neutral-500 group-hover:text-indigo-400">{v[0]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}