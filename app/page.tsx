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

        if (!ttsRes.ok) throw new Error('TTS generation failed');
        
        const ttsData = await ttsRes.arrayBuffer();
        const audioBlob = new Blob([ttsData], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        updateScene(i, { audioUrl });

        // 2. Generate Image
        const imgRes = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: newScenes[i].imagePrompt,
            width: 1024,
            height: 576
          }),
          signal
        });

        if (!imgRes.ok) throw new Error('Image generation failed');
        
        const imgData = await imgRes.json();
        updateScene(i, { imageUrl: imgData.imageUrl, isGenerating: false, isReady: true });

      } catch (error) {
        console.error(`Error generating scene ${i}:`, error);
        // In a real app, we'd show an error message
        updateScene(i, { isGenerating: false });
      }
    }

    setIsGenerating(false);
  };

  const handleReset = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    
    setIsPlaying(false);
    setCurrentSceneIndex(-1);
    setScenes([]);
    setPrompt("A journey of innovation and unity");
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Video className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Prompt to Video</h1>
          </div>
          
          <button 
            onClick={handleReset}
            disabled={isGenerating || scenes.length === 0}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              isGenerating || scenes.length === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 shadow-sm'
            }`}
          >
            <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>Reset</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Prompt Input Section */}
        <section className="mb-10">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Story Prompt</h2>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isGenerating}
              placeholder="Describe your story idea..."
              className={`w-full h-32 p-4 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${
                isGenerating 
                  ? 'bg-gray-100 border-gray-300 cursor-not-allowed' 
                  : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
              }`}
            />
            
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium text-white transition-all ${
                  isGenerating || !prompt.trim()
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg transform hover:-translate-y-0.5'
                }`}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    <span>Generate Story</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Video Player Section */}
        {scenes.length > 0 && (
          <section className="mb-10">
            <div className="bg-black rounded-xl overflow-hidden shadow-lg aspect-video relative flex items-center justify-center">
              {/* Scene Display */}
              <AnimatePresence mode="wait">
                {currentSceneIndex >= 0 && currentSceneIndex < scenes.length && (
                  <motion.div
                    key={currentSceneIndex}
                    initial={{ opacity: 0, scale: 1.05 }}
                    animate={{ 
                      opacity: 1, 
                      scale: 1,
                      transition: {
                        duration: 0.5,
                        ease: "easeOut"
                      }
                    }}
                    exit={{ 
                      opacity: 0,
                      transition: { duration: 0.3 }
                    }}
                    className="w-full h-full relative"
                  >
                    {/* Image */}
                    <img
                      src={scenes[currentSceneIndex].imageUrl || ''}
                      alt={`Scene ${currentSceneIndex + 1}`}
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Overlay Content */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent p-6 sm:p-12 flex flex-col justify-end">
                      <motion.div
                        key={currentSceneIndex}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ 
                          opacity: 1, 
                          y: 0,
                          transition: { delay: 0.3 }
                        }}
                        className="text-white"
                      >
                        <h3 className="text-xl sm:text-2xl font-bold mb-2">
                          {scenes[currentSceneIndex].characterName}
                        </h3>
                        <p className="text-lg sm:text-xl italic mb-4">
                          "{scenes[currentSceneIndex].dialogue}"
                        </p>
                        <p className="text-gray-300 text-sm hidden sm:block">
                          {scenes[currentSceneIndex].narration}
                        </p>
                      </motion.div>
                    </div>

                    {/* Audio Element */}
                    <audio ref={audioRef} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Loading State */}
              {isGenerating && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                  <div className="flex flex-col items-center space-y-4">
                    <Loader2 className="h-16 w-16 text-indigo-400 animate-spin" />
                    <p className="text-white font-medium">Generating video scenes...</p>
                  </div>
                </div>
              )}

              {/* Controls */}
              <div className="absolute bottom-4 left-0 right-0 flex justify-center space-x-6">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  disabled={currentSceneIndex === -1}
                  className={`p-3 rounded-full transition-all ${
                    currentSceneIndex === -1 
                      ? 'bg-gray-700/50 text-gray-400 cursor-not-allowed'
                      : isPlaying 
                        ? 'bg-white text-black hover:bg-gray-200' 
                        : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg'
                  }`}
                >
                  {isPlaying ? (
                    <Pause className="h-8 w-8" />
                  ) : (
                    <Play className="h-8 w-8 ml-1" />
                  )}
                </button>
                
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  disabled={currentSceneIndex === -1}
                  className={`p-3 rounded-full transition-all ${
                    currentSceneIndex === -1 
                      ? 'bg-gray-700/50 text-gray-400 cursor-not-allowed'
                      : isMuted
                        ? 'bg-white/20 text-white hover:bg-white/30'
                        : 'bg-white/80 text-black hover:bg-white'
                  }`}
                >
                  {isMuted ? (
                    <VolumeX className="h-6 w-6" />
                  ) : (
                    <Volume2 className="h-6 w-6" />
                  )}
                </button>
              </div>
            </div>

            {/* Scene Progress */}
            <div className="mt-6">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-500">Scenes</span>
                <span className="text-sm font-medium text-indigo-600">
                  {currentSceneIndex >= 0 ? currentSceneIndex + 1 : 0} / {scenes.length}
                </span>
              </div>
              
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-indigo-600"
                  initial={{ width: "0%" }}
                  animate={{
                    width: `${(currentSceneIndex + 1) / scenes.length * 100}%`
                  }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          </section>
        )}

        {/* Scene List */}
        {scenes.length > 0 && (
          <section className="mb-12">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Story Scenes</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {scenes.map((scene, index) => (
                <div 
                  key={scene.id}
                  onClick={() => {
                    setCurrentSceneIndex(index);
                    if (!isPlaying) setIsPlaying(true);
                  }}
                  className={`scene-card relative group rounded-xl overflow-hidden border transition-all ${
                    currentSceneIndex === index
                      ? 'ring-2 ring-indigo-500 shadow-lg'
                      : 'hover:shadow-md border-gray-200'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="aspect-video bg-gray-100 relative">
                    {scene.imageUrl ? (
                      <img 
                        src={scene.imageUrl} 
                        alt={`Scene ${index + 1}`} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center w-full h-full text-gray-400">
                        {scene.isGenerating ? (
                          <Loader2 className="h-8 w-8 animate-spin" />
                        ) : (
                          <Video className="h-8 w-8 opacity-50" />
                        )}
                      </div>
                    )}
                    
                    {/* Status Overlay */}
                    <div className="absolute top-2 right-2">
                      {scene.isReady ? (
                        <CheckCircle2 className="h-6 w-6 text-green-500 bg-white/90 rounded-full p-1" />
                      ) : scene.isGenerating ? (
                        <Loader2 className="h-6 w-6 text-indigo-500 bg-white/90 rounded-full p-1 animate-spin" />
                      ) : (
                        <div className="h-6 w-6 bg-gray-300 rounded-full flex items-center justify-center">
                          <span className="text-xs font-bold text-white">?</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Scene Details */}
                  <div className="p-4 bg-white">
                    <h4 className="font-medium text-indigo-600">{scene.characterName}</h4>
                    <p className="mt-1 text-sm text-gray-700 line-clamp-2">
                      {scene.dialogue}
                    </p>
                    
                    {/* Scene Controls */}
                    <div className="mt-3 flex items-center justify-between">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        scene.isReady ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {scene.isReady ? 'Ready' : scene.isGenerating ? 'Generating...' : 'Pending'}
                      </span>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (scene.audioUrl && !isPlaying) {
                            setCurrentSceneIndex(index);
                            setIsPlaying(true);
                          }
                        }}
                        disabled={!scene.audioUrl || isPlaying}
                        className={`p-1.5 rounded-full transition-colors ${
                          scene.audioUrl
                            ? 'text-indigo-600 hover:bg-indigo-50'
                            : 'text-gray-300 cursor-not-allowed'
                        }`}
                      >
                        <Play className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Chat / Status Panel */}
        {chatMessages.length > 0 && (
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Status</h3>
            
            <div className="space-y-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {chatMessages.map((message) => (
                <div 
                  key={message.id}
                  className={`flex items-start space-x-3 ${
                    message.sender === 'user' ? 'flex-row-reverse' : ''
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    message.sender === 'user' 
                      ? 'bg-indigo-100 text-indigo-600'
                      : 'bg-green-100 text-green-600'
                  }`}>
                    {message.sender === 'user' ? <MessageSquare className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  </div>
                  
                  <div className={`max-w-[85%] p-3 rounded-lg ${
                    message.sender === 'user'
                      ? 'bg-indigo-50 text-gray-900 rounded-tr-none'
                      : 'bg-gray-50 text-gray-700 rounded-tl-none'
                  }`}>
                    <p className="text-sm">{message.text}</p>
                    <span className="text-xs text-gray-400 mt-1 block">
                      {message.timestamp}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Audio Element for Playback */}
      <audio ref={audioRef} />
    </div>
  );
}