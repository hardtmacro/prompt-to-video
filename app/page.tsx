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
  isReady?: boolean;
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
    isGenerating: false,
    isReady: false
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
  const isAutoPlayingRef = useRef(false);
  const playNextTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Hydration fix - set to true initially to render UI immediately
  useEffect(() => {
    setHasHydrated(true);
    audioRef.current = new Audio();
    
    setChatMessages([{
      id: 'init',
      sender: 'system',
      text: "Ready to generate your visual story. Enter a prompt to begin.",
      timestamp: new Date().toLocaleTimeString()
    }]);
    
    return () => {
      if (playNextTimeoutRef.current) {
        clearTimeout(playNextTimeoutRef.current);
      }
    };
  }, []);

  // Update scenesRef to keep track of current state in callbacks
  useEffect(() => {
    scenesRef.current = scenes;
  }, [scenes]);

  // Centralized auto-play controller
  // This effect monitors scene readiness and handles auto-play transitions
  useEffect(() => {
    if (!isPlaying || scenes.length === 0) return;
    
    const checkAndPlayNext = () => {
      const currentScene = scenesRef.current[currentSceneIndex];
      
      // If current scene is fully ready (has both audio and image), check if we should advance
      if (currentScene?.isReady && currentScene?.audioUrl && currentScene?.imageUrl) {
        const nextIndex = currentSceneIndex + 1;
        
        // If there's a next scene that's ready, play it
        if (nextIndex < scenesRef.current.length) {
          const nextScene = scenesRef.current[nextIndex];
          
          if (nextScene.isReady && nextScene.audioUrl && nextScene.imageUrl) {
            // Small delay for smooth transition
            playNextTimeoutRef.current = setTimeout(() => {
              setCurrentSceneIndex(nextIndex);
            }, 500);
          } else {
            // Next scene not ready yet - schedule a check
            playNextTimeoutRef.current = setTimeout(checkAndPlayNext, 1000);
          }
        } else {
          // End of story
          setIsPlaying(false);
        }
      } else if (currentSceneIndex === -1 && scenesRef.current[0]?.isReady) {
        // Haven't started yet but scene 0 is ready - start playing
        setCurrentSceneIndex(0);
      } else {
        // Current scene not ready, check again soon
        playNextTimeoutRef.current = setTimeout(checkAndPlayNext, 500);
      }
    };
    
    // Start checking
    const timeoutId = setTimeout(checkAndPlayNext, 500);
    
    return () => {
      if (playNextTimeoutRef.current) {
        clearTimeout(playNextTimeoutRef.current);
      }
      clearTimeout(timeoutId);
    };
  }, [isPlaying, scenes.length]);

  // Audio playback effect - handles scene transitions and playback
  useEffect(() => {
    if (!audioRef.current) return;
    
    const currentScene = scenes[currentSceneIndex];
    
    // Handle audio playback when scene changes
    if (currentScene?.audioUrl && isPlaying) {
      // Only play if src changed or we're not currently playing
      if (audioRef.current.src !== currentScene.audioUrl) {
        audioRef.current.src = currentScene.audioUrl;
        audioRef.current.muted = isMuted;
        
        audioRef.current.play()
          .then(() => {
            console.log("Auto-playing scene", currentSceneIndex);
          })
          .catch(e => {
            console.error("Playback error:", e);
            // Try again with user interaction fallback
          });
      } else if (audioRef.current.paused) {
        audioRef.current.play().catch(console.error);
      }
    }
    
    // Handle pause
    if (!isPlaying && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
    
    // Cleanup on unmount or when stopping
    return () => {
      // Don't clean up audio on every change, just manage playback state
    };
  }, [currentSceneIndex, isPlaying, scenes, isMuted]);

  // Audio ended handler - moves to next scene
  useEffect(() => {
    if (!audioRef.current) return;

    const handleEnded = () => {
      console.log("Audio ended, current scene:", currentSceneIndex);
      
      const nextIndex = currentSceneIndex + 1;
      if (nextIndex < scenesRef.current.length) {
        const nextScene = scenesRef.current[nextIndex];
        
        // If next scene is ready, advance immediately
        if (nextScene.isReady && nextScene.audioUrl) {
          setCurrentSceneIndex(nextIndex);
        } else {
          // Wait for next scene to be ready
          const waitForNext = () => {
            const updatedNext = scenesRef.current[nextIndex];
            if (updatedNext?.isReady && updatedNext?.audioUrl) {
              setCurrentSceneIndex(nextIndex);
            } else {
              setTimeout(waitForNext, 500);
            }
          };
          setTimeout(waitForNext, 500);
        }
      } else {
        // End of video
        setIsPlaying(false);
        console.log("Playback complete");
      }
    };

    audioRef.current.onended = handleEnded;
    
    return () => {
      if (audioRef.current) {
        audioRef.current.onended = null;
      }
    };
  }, [currentSceneIndex, scenes]);

  const updateScene = (index: number, updates: Partial<Scene>) => {
    setScenes(prev => {
      const newScenes = [...prev];
      newScenes[index] = { ...newScenes[index], ...updates };
      
      // Mark as ready if both audio and image are available
      if (updates.audioUrl || updates.imageUrl) {
        const scene = newScenes[index];
        if (scene.audioUrl && scene.imageUrl && !scene.isReady) {
          newScenes[index] = { ...scene, isReady: true };
          console.log(`Scene ${index} is now ready!`);
        }
      }
      
      return newScenes;
    });
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
    
    setIsGenerating(true);
    setIsPlaying(false);
    setCurrentSceneIndex(-1);
    
    // Reset audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Clear previous audio URLs to avoid memory leaks
    scenes.forEach(scene => {
      if (scene.audioUrl) URL.revokeObjectURL(scene.audioUrl);
    });

    const newScenes = buildStoryArcHelper(prompt);
    setScenes(newScenes);

    // Start auto-play flag
    isAutoPlayingRef.current = true;

    // Sequence: For each node, generate audio FIRST, then image.
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
          
          // Auto-start playback when first scene's audio is ready
          if (i === 0) {
            setIsPlaying(true);
            setCurrentSceneIndex(0);
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
      // Find first ready scene
      const firstReady = scenes.findIndex(s => s.isReady);
      if (firstReady >= 0) {
        setCurrentSceneIndex(firstReady);
      } else {
        setCurrentSceneIndex(0);
      }
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
      if (audioRef.current) {
        if (isPlaying) audioRef.current.pause();
        else audioRef.current.play();
      }
    }
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentSceneIndex(-1);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
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
            className="p-2 rounded-lg hover:bg-neutral-800 transition-colors"
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Panel - Input */}
        <div className="w-1/3 border-r border-neutral-800 p-6 flex flex-col gap-6 overflow-y-auto bg-neutral-950">
          {/* Prompt Input */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-neutral-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              Story Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your story..."
              className="w-full h-32 bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 resize-none transition-all"
            />
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className={clsx(
              "w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all",
              isGenerating 
                ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25 hover:shadow-indigo-600/40"
            )}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating Story...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generate Video
              </>
            )}
          </button>

          {/* Playback Controls */}
          {scenes.length > 0 && (
            <div className="bg-neutral-900/50 rounded-xl p-4 space-y-4 border border-neutral-800">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-400">Playback</span>
                <span className="text-xs text-neutral-500">
                  Scene {currentSceneIndex + 1} / {scenes.length}
                </span>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={togglePlay}
                  disabled={scenes.every(s => !s.isReady)}
                  className={clsx(
                    "flex-1 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all",
                    isPlaying 
                      ? "bg-amber-600/20 text-amber-400 border border-amber-600/30 hover:bg-amber-600/30"
                      : "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 hover:bg-emerald-600/30",
                    scenes.every(s => !s.isReady) && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      {currentSceneIndex === -1 ? 'Start' : 'Resume'}
                    </>
                  )}
                </button>
                
                <button
                  onClick={handleStop}
                  className="px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Scene List */}
          {scenes.length > 0 && (
            <div className="space-y-2">
              <span className="text-sm font-medium text-neutral-400">Scenes</span>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                {scenes.map((scene, index) => (
                  <motion.div
                    key={scene.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => {
                      if (scene.isReady) {
                        setCurrentSceneIndex(index);
                        setIsPlaying(true);
                      }
                    }}
                    className={clsx(
                      "p-3 rounded-lg border cursor-pointer transition-all",
                      currentSceneIndex === index 
                        ? "bg-indigo-600/20 border-indigo-500/50" 
                        : scene.isReady 
                          ? "bg-neutral-900 border-neutral-800 hover:border-neutral-700"
                          : "bg-neutral-900/50 border-neutral-800/50 opacity-60",
                      !scene.isReady && "cursor-wait"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{scene.characterName}</p>
                        <p className="text-xs text-neutral-500 truncate">{scene.dialogue}</p>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        {scene.isGenerating ? (
                          <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                        ) : scene.isReady ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <div className="w-3 h-3 rounded-full bg-neutral-700" />
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Chat/Messages */}
          <div className="flex-1 space-y-3 min-h-0">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-400">
              <MessageSquare className="w-4 h-4" />
              Activity Log
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3 max-h-[200px] pr-2">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={clsx(
                    "p-3 rounded-lg text-sm",
                    msg.sender === 'system' 
                      ? "bg-neutral-900 border border-neutral-800" 
                      : "bg-indigo-900/20 border border-indigo-800/30 ml-4"
                  )}
                >
                  <p>{msg.text}</p>
                  <span className="text-xs text-neutral-500">{msg.timestamp}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel - Preview */}
        <div className="flex-1 bg-neutral-900 relative overflow-hidden flex flex-col">
          {/* Video Preview Area */}
          <div className="flex-1 relative">
            <AnimatePresence mode="wait">
              {currentSceneIndex >= 0 && scenes[currentSceneIndex]?.imageUrl ? (
                <motion.div
                  key={scenes[currentSceneIndex].id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0"
                >
                  <img 
                    src={scenes[currentSceneIndex].imageUrl!} 
                    alt={`Scene ${currentSceneIndex + 1}`}
                    className="w-full h-full object-contain bg-black"
                  />
                  
                  {/* Scene Info Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-6">
                    <motion.div
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.2 }}
                    >
                      <p className="text-indigo-400 font-medium mb-1">
                        {scenes[currentSceneIndex].characterName}
                      </p>
                      <p className="text-xl text-white font-semibold mb-2">
                        "{scenes[currentSceneIndex].dialogue}"
                      </p>
                      <p className="text-neutral-400 text-sm italic">
                        {scenes[currentSceneIndex].narration}
                      </p>
                    </motion.div>
                  </div>
                  
                  {/* Playing Indicator */}
                  {isPlaying && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute top-4 right-4 flex items-center gap-2 bg-emerald-600/90 px-3 py-1.5 rounded-full"
                    >
                      <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      <span className="text-xs font-medium text-white">Auto-Playing</span>
                    </motion.div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <div className="text-center space-y-4 max-w-md px-6">
                    <div className="w-20 h-20 mx-auto rounded-2xl bg-neutral-800 flex items-center justify-center">
                      <Video className="w-10 h-10 text-neutral-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-neutral-300">
                        {isGenerating ? 'Generating Your Story...' : 'Ready to Create'}
                      </h3>
                      <p className="text-neutral-500 mt-2">
                        {isGenerating 
                          ? 'This may take a few moments as we create scenes, voiceovers, and images.'
                          : 'Enter a prompt above and click generate to create your video story.'
                        }
                      </p>
                    </div>
                    
                    {/* Progress indicator when generating */}
                    {isGenerating && (
                      <div className="flex items-center justify-center gap-1 pt-2">
                        {scenes.map((scene, i) => (
                          <div 
                            key={scene.id}
                            className={clsx(
                              "w-2 h-2 rounded-full transition-all",
                              scene.isReady 
                                ? "bg-emerald-400" 
                                : scene.isGenerating 
                                  ? "bg-indigo-400 animate-pulse" 
                                  : "bg-neutral-700"
                            )}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          {/* Bottom Controls Bar */}
          {scenes.length > 0 && (
            <div className="h-16 border-t border-neutral-800 bg-neutral-950/80 backdrop-blur-md flex items-center px-6 gap-4">
              {/* Progress Bar */}
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-indigo-500"
                    initial={{ width: 0 }}
                    animate={{ 
                      width: `${((currentSceneIndex + 1) / scenes.length) * 100}%` 
                    }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <span className="text-xs text-neutral-500 whitespace-nowrap">
                  {scenes[currentSceneIndex]?.isReady 
                    ? `${currentSceneIndex + 1}/${scenes.length}` 
                    : `0/${scenes.length}`
                  }
                </span>
              </div>
              
              {/* Quick Scene Navigation */}
              <div className="flex items-center gap-1">
                {scenes.slice(0, 10).map((scene, i) => (
                  <button
                    key={scene.id}
                    onClick={() => {
                      if (scene.isReady) {
                        setCurrentSceneIndex(i);
                        setIsPlaying(false);
                      }
                    }}
                    disabled={!scene.isReady}
                    className={clsx(
                      "w-2 h-2 rounded-full transition-all",
                      currentSceneIndex === i 
                        ? "bg-indigo-400" 
                        : scene.isReady 
                          ? "bg-neutral-600 hover:bg-neutral-500" 
                          : "bg-neutral-800",
                      !scene.isReady && "cursor-not-allowed"
                    )}
                    title={`Scene ${i + 1}: ${scene.characterName}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}