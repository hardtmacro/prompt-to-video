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
  const [hasHydrated, setHasHydrated] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scenesRef = useRef<Scene[]>([]);
  
  // Web Speech API ref for pre-generation announcements
  const speechSynthesisRef = useRef<SpeechSynthesis | null>(null);

  // Hydration fix - set to true initially to render UI immediately
  useEffect(() => {
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

    // Note: Character voice lines are handled by /api/text-to-speech below

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

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-indigo-500/30 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-600 rounded-lg">
            <Video className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Cine<span className="text-indigo-400">Story</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Panel - Story Editor */}
        <div className="w-1/2 border-r border-neutral-800 flex flex-col">
          {/* Prompt Input */}
          <div className="p-6 border-b border-neutral-800">
            <label className="block text-sm font-medium text-neutral-400 mb-2">
              Story Prompt
            </label>
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isGenerating}
                className="w-full h-24 bg-neutral-900 border border-neutral-700 rounded-xl p-4 pr-12 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 resize-none disabled:opacity-50"
                placeholder="Describe your story concept..."
              />
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className={clsx(
                  "absolute right-3 bottom-3 p-2.5 rounded-lg transition-all",
                  isGenerating 
                    ? "bg-neutral-700 cursor-not-allowed" 
                    : "bg-indigo-600 hover:bg-indigo-500"
                )}
              >
                {isGenerating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Sparkles className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* Scene Timeline */}
          <div className="flex-1 overflow-y-auto p-6">
            <h2 className="text-sm font-medium text-neutral-400 mb-4">Story Arc</h2>
            <div className="space-y-3">
              {scenes.map((scene, index) => (
                <motion.div
                  key={scene.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={clsx(
                    "p-4 rounded-xl border transition-all cursor-pointer",
                    currentSceneIndex === index 
                      ? "bg-indigo-500/10 border-indigo-500/50" 
                      : "bg-neutral-900/50 border-neutral-800 hover:border-neutral-700"
                  )}
                  onClick={() => {
                    setCurrentSceneIndex(index);
                    if (scene.audioUrl) setIsPlaying(true);
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={clsx(
                        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                        currentSceneIndex === index ? "bg-indigo-500 text-white" : "bg-neutral-800 text-neutral-400"
                      )}>
                        {index + 1}
                      </span>
                      <span className="font-medium text-neutral-200">{scene.characterName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {scene.isGenerating && <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />}
                      {scene.imageUrl && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                      {scene.audioUrl && <Volume2 className="w-4 h-4 text-blue-400" />}
                    </div>
                  </div>
                  <p className="text-sm text-neutral-400 mb-2">"{scene.dialogue}"</p>
                  <p className="text-xs text-neutral-500 italic">{scene.narration}</p>
                </motion.div>
              ))}
              {scenes.length === 0 && (
                <div className="text-center py-12 text-neutral-500">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Enter a prompt and click generate to create your story</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Preview */}
        <div className="w-1/2 flex flex-col bg-neutral-950">
          {/* Main Preview Area */}
          <div className="flex-1 relative flex items-center justify-center p-8">
            <AnimatePresence mode="wait">
              {scenes.length > 0 && currentSceneIndex >= 0 ? (
                <motion.div
                  key={currentSceneIndex}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  transition={{ duration: 0.3 }}
                  className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-2xl"
                >
                  {scenes[currentSceneIndex]?.imageUrl ? (
                    <img 
                      src={scenes[currentSceneIndex].imageUrl!} 
                      alt={`Scene ${currentSceneIndex + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-neutral-900 flex items-center justify-center">
                      <Loader2 className="w-12 h-12 animate-spin text-indigo-500" />
                    </div>
                  )}
                  
                  {/* Scene Info Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-6 pt-20">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-3 py-1 bg-indigo-600/80 rounded-full text-sm font-medium">
                        {scenes[currentSceneIndex]?.characterName}
                      </span>
                      <span className="text-neutral-400 text-sm">Scene {currentSceneIndex + 1} of {scenes.length}</span>
                    </div>
                    <p className="text-neutral-200 text-lg mb-2">"{scenes[currentSceneIndex]?.dialogue}"</p>
                    <p className="text-neutral-500 text-sm">{scenes[currentSceneIndex]?.narration}</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center"
                >
                  <div className="w-32 h-32 mx-auto mb-6 rounded-2xl bg-neutral-900 flex items-center justify-center">
                    <Video className="w-16 h-16 text-neutral-700" />
                  </div>
                  <h3 className="text-xl font-medium text-neutral-300 mb-2">Ready to Create</h3>
                  <p className="text-neutral-500 max-w-md">
                    Enter your story prompt and click the generate button to bring your vision to life
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Playback Controls */}
          <div className="h-24 border-t border-neutral-800 flex items-center justify-center gap-4 px-6">
            <button
              onClick={() => {
                setCurrentSceneIndex(Math.max(0, currentSceneIndex - 1));
              }}
              disabled={currentSceneIndex <= 0}
              className="p-3 rounded-full bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronDown className="w-5 h-5 rotate-90" />
            </button>
            
            <button
              onClick={togglePlay}
              disabled={scenes.length === 0}
              className={clsx(
                "p-4 rounded-full transition-all",
                isPlaying 
                  ? "bg-amber-500 hover:bg-amber-400" 
                  : "bg-indigo-600 hover:bg-indigo-500",
                scenes.length === 0 && "opacity-50 cursor-not-allowed"
              )}
            >
              {isPlaying ? (
                <Pause className="w-8 h-8 text-white" />
              ) : (
                <Play className="w-8 h-8 text-white ml-1" />
              )}
            </button>
            
            <button
              onClick={() => {
                setCurrentSceneIndex(Math.min(scenes.length - 1, currentSceneIndex + 1));
              }}
              disabled={currentSceneIndex >= scenes.length - 1}
              className="p-3 rounded-full bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronDown className="w-5 h-5 -rotate-90" />
            </button>

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="ml-8 px-6 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={clsx("w-5 h-5", isGenerating && "animate-spin")} />
              <span>Regenerate</span>
            </button>
          </div>
        </div>
      </main>

      {/* Chat Panel (Optional - bottom right) */}
      {chatMessages.length > 0 && (
        <div className="fixed bottom-6 right-6 w-80 bg-neutral-900/95 backdrop-blur-md border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-indigo-400" />
            <h3 className="font-medium">Story Assistant</h3>
          </div>
          <div className="max-h-64 overflow-y-auto p-4 space-y-3">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={clsx(
                  "text-sm",
                  msg.sender === 'system' ? "text-neutral-400" : "text-neutral-200"
                )}
              >
                {msg.sender === 'system' && (
                  <span className="text-xs text-indigo-400 block mb-1">Assistant • {msg.timestamp}</span>
                )}
                {msg.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}