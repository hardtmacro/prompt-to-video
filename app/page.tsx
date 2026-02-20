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
  const [hasHydrated, setHasHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scenesRef = useRef<Scene[]>([]);
  const isAutoPlayingRef = useRef(false);
  const playNextTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Hydration fix - set to false initially to avoid hydration mismatch, then true after mount
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
    setError(null);
    
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
        const fullText = `${newScenes[i].characterName}: ${newScenes[i].dialogue} ${newScenes[i].narration}`;
        
        const ttsRes = await fetch('/api/text-to-speech', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: fullText }),
          signal
        });

        if (!ttsRes.ok) {
          throw new Error(`TTS failed: ${ttsRes.status} ${ttsRes.statusText}`);
        }

        const ttsBlob = await ttsRes.blob();
        const audioUrl = URL.createObjectURL(ttsBlob);
        updateScene(i, { audioUrl });

        // 2. Generate Image
        const imgRes = await fetch('/api/generate-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prompt: newScenes[i].imagePrompt }),
          signal
        });

        if (!imgRes.ok) {
          throw new Error(`Image generation failed: ${imgRes.status} ${imgRes.statusText}`);
        }

        const imgData = await imgRes.json();
        
        if (!imgData.url) {
          throw new Error('No image URL returned from API');
        }

        updateScene(i, { imageUrl: imgData.url, isGenerating: false });
        
      } catch (err) {
        // Handle abort errors gracefully
        if (err instanceof Error && err.name === 'AbortError') {
          console.log('Generation aborted');
          break;
        }
        
        console.error(`Error generating scene ${i}:`, err);
        updateScene(i, { isGenerating: false });
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
        
        // Continue with other scenes even if one fails
        continue;
      }
    }

    setIsGenerating(false);
    
    // Add system message about completion
    setChatMessages(prev => [...prev, {
      id: `msg-${Date.now()}`,
      sender: 'system',
      text: 'Your visual story is ready! Press play to watch.',
      timestamp: new Date().toLocaleTimeString()
    }]);
  };

  const handlePlayPause = () => {
    if (scenes.length === 0) return;
    
    // If not started yet, start from beginning
    if (currentSceneIndex === -1) {
      const firstReadyScene = scenes.findIndex(s => s.isReady);
      if (firstReadyScene !== -1) {
        setCurrentSceneIndex(firstReadyScene);
        setIsPlaying(true);
      } else {
        setError('Please wait for at least the first scene to be ready');
      }
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const handleReset = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    setIsGenerating(false);
    setIsPlaying(false);
    setCurrentSceneIndex(-1);
    setError(null);
    
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    
    // Clean up audio URLs
    scenes.forEach(scene => {
      if (scene.audioUrl) URL.revokeObjectURL(scene.audioUrl);
    });
    
    setScenes([]);
  };

  const currentScene = scenes[currentSceneIndex] || null;

  // Render loading skeleton during hydration
  if (!hasHydrated) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="animate-pulse text-neutral-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                <Video className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Vision Magnet
                </h1>
                <p className="text-xs text-neutral-400">Prompt to Video Generator</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 rounded-lg hover:bg-neutral-800 transition-colors"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-5 h-5 text-neutral-400" /> : <Volume2 className="w-5 h-5 text-neutral-400" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded-xl text-red-400 text-sm"
            >
              <div className="flex items-center justify-between">
                <span>Error: {error}</span>
                <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
                  ×
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content - Video Display */}
          <div className="lg:col-span-2 space-y-6">
            {/* Video Player Area */}
            <div className="relative aspect-video bg-neutral-900 rounded-2xl overflow-hidden border border-neutral-800">
              {currentScene?.imageUrl ? (
                <motion.div
                  key={currentScene.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentScene.imageUrl}
                    alt={`Scene: ${currentScene.characterName}`}
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Character Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
                    <div className="flex items-end justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{currentScene.characterName}</h3>
                        <p className="text-neutral-300 text-sm">{currentScene.dialogue}</p>
                      </div>
                      {currentScene.isReady && (
                        <CheckCircle2 className="w-6 h-6 text-green-400" />
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500">
                  <Sparkles className="w-16 h-16 mb-4 opacity-50" />
                  <p className="text-lg">Enter a prompt and generate your story</p>
                </div>
              )}

              {/* Loading Overlay */}
              {isGenerating && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center">
                  <Loader2 className="w-12 h-12 text-purple-400 animate-spin mb-4" />
                  <p className="text-neutral-300">Generating your visual story...</p>
                  <p className="text-neutral-500 text-sm mt-2">This may take a few minutes</p>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center space-x-4">
              <button
                onClick={handleReset}
                disabled={isGenerating || scenes.length === 0}
                className={clsx(
                  "p-3 rounded-full transition-all",
                  isGenerating || scenes.length === 0
                    ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                    : "bg-neutral-800 hover:bg-neutral-700 text-white"
                )}
                aria-label="Reset"
              >
                <RefreshCw className="w-5 h-5" />
              </button>

              <button
                onClick={handlePlayPause}
                disabled={isGenerating || scenes.filter(s => s.isReady).length === 0}
                className={clsx(
                  "p-4 rounded-full transition-all",
                  isGenerating || scenes.filter(s => s.isReady).length === 0
                    ? "bg-neutral-700 text-neutral-500 cursor-not-allowed"
                    : isPlaying
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : "bg-purple-500 hover:bg-purple-600 text-white"
                )}
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
              </button>

              <div className="px-4 py-2 bg-neutral-900 rounded-full text-neutral-400 text-sm">
                {currentSceneIndex >= 0 
                  ? `Scene ${currentSceneIndex + 1} of ${scenes.length}`
                  : scenes.length > 0 
                    ? `${scenes.filter(s => s.isReady).length} / ${scenes.length} ready`
                    : 'No scenes generated'
                }
              </div>
            </div>

            {/* Scene Timeline */}
            {scenes.length > 0 && (
              <div className="bg-neutral-900/50 rounded-xl p-4 border border-neutral-800">
                <h4 className="text-sm font-medium text-neutral-400 mb-3">Scene Timeline</h4>
                <div className="flex space-x-2 overflow-x-auto pb-2">
                  {scenes.map((scene, idx) => (
                    <motion.button
                      key={scene.id}
                      onClick={() => {
                        if (scene.isReady) {
                          setCurrentSceneIndex(idx);
                          setIsPlaying(false);
                        }
                      }}
                      disabled={!scene.isReady}
                      className={clsx(
                        "flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden border-2 transition-all",
                        idx === currentSceneIndex
                          ? "border-purple-500"
                          : scene.isReady
                            ? "border-neutral-700 hover:border-neutral-600"
                            : "border-neutral-800 opacity-50 cursor-not-allowed"
                      )}
                      whileHover={scene.isReady ? { scale: 1.05 } : {}}
                      whileTap={scene.isReady ? { scale: 0.95 } : {}}
                    >
                      {scene.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={scene.imageUrl}
                          alt={scene.characterName}
                          className="w-full h-full object-cover"
                        />
                      ) : scene.isGenerating ? (
                        <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                          <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                        </div>
                      ) : (
                        <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-neutral-600" />
                        </div>
                      )}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar - Input & Chat */}
          <div className="space-y-6">
            {/* Prompt Input */}
            <div className="bg-neutral-900 rounded-2xl p-6 border border-neutral-800">
              <label className="block text-sm font-medium text-neutral-300 mb-3">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>Story Prompt</span>
                </div>
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your story concept..."
                className="w-full h-24 bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 resize-none"
                disabled={isGenerating}
              />
              
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className={clsx(
                  "mt-4 w-full py-3 px-4 rounded-xl flex items-center justify-center space-x-2 transition-all",
                  isGenerating || !prompt.trim()
                    ? "bg-neutral-700 text-neutral-500 cursor-not-allowed"
                    : "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/25"
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span>Generate Story</span>
                  </>
                )}
              </button>
            </div>

            {/* Chat / Info Panel */}
            <div className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
              <div className="p-4 border-b border-neutral-800">
                <div className="flex items-center space-x-2">
                  <MessageSquare className="w-4 h-4 text-purple-400" />
                  <h3 className="font-medium text-neutral-200">Story Details</h3>
                </div>
              </div>
              
              <div className="p-4 max-h-64 overflow-y-auto space-y-3">
                {chatMessages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={clsx(
                      "p-3 rounded-xl text-sm",
                      msg.sender === 'system' 
                        ? "bg-purple-900/20 border border-purple-800/50 text-purple-200"
                        : "bg-neutral-800 text-neutral-300"
                    )}
                  >
                    <p>{msg.text}</p>
                    <span className="text-xs text-neutral-500 mt-1 block">{msg.timestamp}</span>
                  </motion.div>
                ))}
                
                {/* Show current scene narration */}
                {currentScene && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700"
                  >
                    <div className="flex items-center space-x-2 mb-2">
                      <FileText className="w-4 h-4 text-blue-400" />
                      <span className="text-xs font-medium text-blue-400 uppercase">Narration</span>
                    </div>
                    <p className="text-sm text-neutral-300 italic">{currentScene.narration}</p>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Voice Info */}
            <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800">
              <div className="flex items-center space-x-2 mb-3">
                <Mic2 className="w-4 h-4 text-pink-400" />
                <h4 className="text-sm font-medium text-neutral-300">Character Voices</h4>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.keys(CHARACTER_VOICES).slice(0, 6).map((char) => (
                  <div key={char} className="text-xs text-neutral-500 bg-neutral-800/50 px-2 py-1 rounded">
                    {char}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}