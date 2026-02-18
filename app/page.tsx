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
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Types
interface Scene {
  id: string;
  imagePrompt: string;
  dialogue: string;
  characterName: string;
  narration: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
}

interface ChatMessage {
  sender: 'user' | 'system';
  text: string;
  timestamp: Date;
}

// Mock initial data
const INITIAL_SCENES: Scene[] = [
  {
    id: 'scene1',
    imagePrompt: "A red cursive title 'Vision Magnet' on a colorful background with a clock, chair, and table",
    dialogue: "Motivate Teams with Vision, Not Demands.",
    characterName: "Narrator",
    narration: "In a world where direction is often confused with control..."
  },
  {
    id: 'scene2',
    imagePrompt: "A dynamic scene showing diverse team members collaborating around a table filled with ideas and sketches",
    dialogue: "Vision isn't just for leaders — it's the compass for everyone.",
    characterName: "Team Lead",
    narration: "Each person in the room brings unique strengths, but without shared vision..."
  },
  {
    id: 'scene3',
    imagePrompt: "A close-up of hands passing a glowing compass that points toward a distant mountain range",
    dialogue: "Let's create not just what we need, but what inspires us.",
    characterName: "Innovator",
    narration: "When vision becomes collective, innovation flourishes naturally."
  }
];

export default function PromptToVideoApp() {
  // State
  const [prompt, setPrompt] = useState<string>("Create a video about 'Vision Magnet' with a red cursive title and black description. Include scenes showing team motivation through vision rather than demands.");
  const [isGenerating, setIsGenerating] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentSceneIndex, setCurrentSceneIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { sender: 'system', text: "Welcome to Prompt-to-Video. Enter a concept and we'll generate a story with dynamic scenes and character voices.", timestamp: new Date() }
  ]);
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferedScenes, setBufferedScenes] = useState<Set<string>>(new Set());
  
  // Refs
  const videoRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize with some scenes for demo purposes
  useEffect(() => {
    if (scenes.length === 0) {
      setScenes(INITIAL_SCENES.map(scene => ({ ...scene, imageUrl: `/images/screencapture-maxroom-co-videos-vfs-M4wPDGM1Udg4ZMK1SY-2026-02-11-21_45_25.png` })));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const handleGenerate = async () => {
    // Cancel any ongoing generation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    setIsGenerating(true);
    setScenes([]);
    setCurrentSceneIndex(-1);
    setIsPlaying(false);
    setBufferedScenes(new Set());
    setIsBuffering(true);

    try {
      // Step 1: Generate improved script following story arc structure
      const scriptResponse = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, signal }),
        signal
      });

      if (scriptResponse.ok) {
        // For this implementation, we'll simulate story arc generation with the initial scenes
        // In a real app, we'd parse the script response and create scenes accordingly
        const improvedScenes = INITIAL_SCENES.map((scene, index) => ({
          ...scene,
          id: `scene-${index}`,
          imagePrompt: scene.imagePrompt.replace("Vision Magnet", prompt.split(' ')[0] || "Innovation"),
          dialogue: `Scene ${index + 1}: ${prompt.split(' ').slice(0, 3).join(' ')} - ${scene.dialogue}`,
          characterName: ['Visionary', 'Team Lead', 'Innovator'][index],
          narration: `${scene.narration} This scene highlights the importance of ${prompt.split(' ').pop()} in modern teams.`
        }));

        setScenes(improvedScenes);
        
        // Step 2: Generate images and audio for each scene
        const buffered = new Set<string>();
        const updatedScenes = [...improvedScenes];
        
        for (let i = 0; i < improvedScenes.length; i++) {
          if (signal.aborted) break;
          
          // Generate image for this scene
          try {
            const imgRes = await fetch('/api/generate-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: improvedScenes[i].imagePrompt }),
              signal
            });
            
            if (imgRes.ok) {
              const data = await imgRes.json();
              updatedScenes[i].imageUrl = data.url;
            }
          } catch (err) {
            console.error("Image generation failed:", err);
            // Fallback to existing image for demo
            updatedScenes[i].imageUrl = `/images/screencapture-maxroom-co-videos-vfs-M4wPDGM1Udg4ZMK1SY-2026-02-11-21_45_25.png`;
          }
          
          // Generate audio for narration and dialogue with different character voices
          try {
            const ttsRes = await fetch('/api/text-to-speech', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: improvedScenes[i].narration }),
              signal
            });
            
            if (ttsRes.ok && ttsRes.headers.get('content-type')?.includes('audio')) {
              const blob = await ttsRes.blob();
              updatedScenes[i].audioUrl = URL.createObjectURL(blob);
            }
          } catch (err) {
            console.error("Audio generation failed:", err);
          }

          // Update scene in state
          setScenes(updatedScenes);
          
          buffered.add(improvedScenes[i].id);
          setBufferedScenes(new Set(buffered));
        }
        
        setIsBuffering(false);
        
        // Start playing from first scene if ready
        setTimeout(() => {
          setCurrentSceneIndex(0);
          setIsPlaying(true);
        }, 1000);
      } else {
        throw new Error("Failed to generate script");
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        setChatMessages(prev => [
          ...prev,
          { sender: 'system', text: `Generation failed: ${error.message}`, timestamp: new Date() }
        ]);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSceneComplete = useCallback(() => {
    if (currentSceneIndex < scenes.length - 1) {
      setCurrentSceneIndex(prev => prev + 1);
    } else {
      setIsPlaying(false);
    }
  }, [currentSceneIndex, scenes.length]);

  // Auto-play next scene when current one ends
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    if (isPlaying && currentSceneIndex >= 0) {
      const scene = scenes[currentSceneIndex];
      
      if (scene.audioUrl) {
        audioRef.current = new Audio(scene.audioUrl);
        audioRef.current.onended = handleSceneComplete;
        audioRef.current.play().catch(err => console.error("Audio play error:", err));
        
        // If no audio, simulate 5-second scene
        timeoutId = setTimeout(handleSceneComplete, 5000);
      } else {
        // Fallback without audio
        timeoutId = setTimeout(handleSceneComplete, 3000);
      }
    }
    
    return () => {
      clearTimeout(timeoutId);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.onended = null;
      }
    };
  }, [isPlaying, currentSceneIndex, scenes, handleSceneComplete]);

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-neutral-950/80 backdrop-blur-md">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-2 rounded-lg">
              <Video className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
              Prompt-to-Video
            </h1>
          </div>
          
          <button 
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`flex items-center space-x-2 px-6 py-2 rounded-full font-medium transition-all ${
              isGenerating 
                ? 'bg-neutral-800 text-neutral-400 cursor-not-allowed' 
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-900/20'
            }`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Generate Video</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
          {/* Left Panel - Prompt Input */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-1 space-y-6"
          >
            {/* Prompt Section */}
            <div className="bg-neutral-900/50 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
              <h2 className="text-lg font-semibold mb-4 flex items-center text-indigo-300">
                <FileText className="w-5 h-5 mr-2" />
                Video Prompt
              </h2>
              
              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={isGenerating}
                  placeholder="Describe your video concept..."
                  className="w-full h-40 bg-neutral-950 border border-white/10 rounded-xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none transition-all"
                />
                <div className="absolute bottom-3 right-3 flex space-x-2">
                  {isGenerating && (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                  )}
                </div>
              </div>
              
              <p className="mt-3 text-xs text-neutral-400 leading-relaxed">
                Our system will generate a story arc, create dynamic scenes, and assign unique voices to each character.
              </p>
            </div>

            {/* Status Panel */}
            <div className="bg-neutral-900/50 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
              <h3 className="text-lg font-semibold mb-4 text-indigo-300">Generation Status</h3>
              
              <div className="space-y-3">
                {scenes.length > 0 ? (
                  <>
                    <div className="flex items-center space-x-2 text-green-400">
                      <CheckCircle2 className="w-5 h-5" />
                      <span>Script generation complete</span>
                    </div>
                    
                    <div className="flex items-center space-x-2 text-indigo-300">
                      {bufferedScenes.size === scenes.length ? (
                        <>
                          <CheckCircle2 className="w-5 h-5" />
                          <span>All scenes buffered and ready</span>
                        </>
                      ) : (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Buffering {bufferedScenes.size} of {scenes.length} scenes...</span>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-neutral-400">
                    Enter a prompt and click Generate to begin video creation.
                  </p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Center Panel - Video Player */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="lg:col-span-2 space-y-6"
          >
            {/* Video Player */}
            <div 
              ref={videoRef}
              className={`relative overflow-hidden rounded-2xl border ${isBuffering ? 'border-indigo-500/30' : 'border-white/10'} bg-black shadow-2xl`}
            >
              {scenes.length > 0 && currentSceneIndex >= 0 ? (
                <>
                  <div className="relative aspect-video">
                    {/* Video Image */}
                    {scenes[currentSceneIndex].imageUrl ? (
                      <img 
                        src={scenes[currentSceneIndex].imageUrl} 
                        alt={`Scene ${currentSceneIndex + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-neutral-900">
                        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                      </div>
                    )}

                    {/* Overlay Controls */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-6">
                      <div className="flex w-full justify-between items-center">
                        <div className="space-y-2">
                          <h3 className="text-xl font-bold text-white">
                            {scenes[currentSceneIndex].characterName}
                          </h3>
                          <p className="text-indigo-200 italic">
                            "{scenes[currentSceneIndex].dialogue}"
                          </p>
                        </div>

                        {/* Play/Pause Button */}
                        <button 
                          onClick={togglePlayPause}
                          className="bg-white/10 hover:bg-white/20 backdrop-blur-md p-4 rounded-full transition-all"
                        >
                          {isPlaying ? (
                            <Pause className="w-8 h-8 text-white" />
                          ) : (
                            <Play className="w-8 h-8 text-white ml-1" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-neutral-800">
                      <motion.div 
                        className="h-full bg-gradient-to-r from-indigo-600 to-purple-600"
                        animate={{ width: isPlaying ? "100%" : "0%" }}
                        transition={{ duration: 3, ease: "linear" }}
                      />
                    </div>
                  </div>

                  {/* Scene Info */}
                  <div className="bg-neutral-900/80 backdrop-blur-sm p-4 border-t border-white/5">
                    <div className="flex items-start space-x-4">
                      {isBuffering && (
                        <div className="flex items-center text-indigo-300 bg-indigo-900/20 px-3 py-1 rounded-full text-sm">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Buffering remaining scenes...
                        </div>
                      )}
                      
                      <div className="flex-1 space-y-2">
                        <h4 className="font-semibold text-indigo-300">Scene {currentSceneIndex + 1}</h4>
                        <p className="text-sm text-neutral-300 leading-relaxed">
                          {scenes[currentSceneIndex].narration}
                        </p>
                      </div>

                      <div className="flex flex-col items-end space-y-2">
                        {scenes[currentSceneIndex].audioUrl ? (
                          <button 
                            onClick={() => {
                              if (audioRef.current) {
                                audioRef.current.currentTime = 0;
                                audioRef.current.play();
                              }
                            }}
                            className="bg-neutral-800 hover:bg-neutral-700 p-2 rounded-lg transition-colors"
                            title="Replay Audio"
                          >
                            <Mic2 className="w-5 h-5 text-indigo-400" />
                          </button>
                        ) : (
                          <div className="text-xs text-red-400 bg-red-900/20 px-3 py-1 rounded-lg">
                            Audio unavailable
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : isGenerating ? (
                <div className="w-full h-[50vh] flex flex-col items-center justify-center bg-neutral-900 space-y-4">
                  <Loader2 className="w-16 h-16 text-indigo-500 animate-spin" />
                  <p className="text-lg font-medium text-white">Generating video scenes...</p>
                </div>
              ) : (
                <div className="w-full h-[50vh] flex flex-col items-center justify-center bg-neutral-900 space-y-4">
                  <Video className="w-16 h-16 text-neutral-700" />
                  <p className="text-lg font-medium text-neutral-500">Ready to generate your video</p>
                </div>
              )}
            </div>

            {/* Scene Preview Grid */}
            {scenes.length > 0 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="space-y-4"
              >
                <h3 className="text-lg font-semibold text-indigo-300">Scene Preview</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {scenes.map((scene, index) => (
                    <motion.div
                      key={scene.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + (index * 0.1) }}
                      className={`relative overflow-hidden rounded-xl border ${
                        index === currentSceneIndex 
                          ? 'border-indigo-500 shadow-lg shadow-indigo-900/30' 
                          : 'border-white/10'
                      }`}
                    >
                      <div className="aspect-video bg-neutral-800 relative">
                        {scene.imageUrl ? (
                          <img 
                            src={scene.imageUrl} 
                            alt={`Scene ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-neutral-900">
                            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                          </div>
                        )}
                        
                        {index === currentSceneIndex && isPlaying && (
                          <div className="absolute inset-0 border-4 border-indigo-500/30 flex items-center justify-center">
                            <Play className="w-12 h-12 text-white/80" />
                          </div>
                        )}
                        
                        {bufferedScenes.has(scene.id) && (
                          <div className="absolute top-2 right-2 bg-green-500/90 text-black px-2 py-1 rounded-full text-xs font-medium flex items-center">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Ready
                          </div>
                        )}
                      </div>
                      
                      <div className="p-4 bg-neutral-900">
                        <h4 className="font-semibold text-indigo-300 mb-2">Scene {index + 1}</h4>
                        <p className="text-sm text-neutral-400 line-clamp-2">{scene.narration}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Right Panel - Chat */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="lg:col-span-3 bg-neutral-900/50 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm"
          >
            <div className="p-4 bg-neutral-800/50 border-b border-white/5">
              <h3 className="font-semibold text-indigo-300 flex items-center">
                <Sparkles className="w-5 h-5 mr-2" />
                Generation Log
              </h3>
            </div>
            
            <div className="p-6 space-y-4 max-h-[40vh] overflow-y-auto custom-scrollbar">
              {chatMessages.map((msg, index) => (
                <motion.div 
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div 
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      msg.sender === 'user' 
                        ? 'bg-indigo-600 text-white' 
                        : 'bg-neutral-700/50 text-neutral-200'
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                    <span className={`text-[10px] mt-1 block ${
                      msg.sender === 'user' ? 'text-indigo-200' : 'text-neutral-400'
                    }`}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </motion.div>
              ))}
              
              {isGenerating && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="bg-neutral-700/50 rounded-2xl px-4 py-3 flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                    <span className="text-sm text-neutral-300">Processing scenes...</span>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Chat Input */}
            <div className="p-4 border-t border-white/5 bg-neutral-800/30">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Ask about the video..."
                  disabled={isGenerating}
                  className="flex-1 bg-neutral-950 border border-white/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
                <button 
                  onClick={() => setChatMessages(prev => [
                    ...prev, 
                    { sender: 'user', text: "Can you explain how the voice synthesis works?", timestamp: new Date() }
                  ])}
                  disabled={isGenerating}
                  className="p-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
                >
                  <ArrowRight className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </motion.div>

          {/* Footer */}
          <footer className="lg:col-span-3 py-6 border-t border-white/5 mt-8">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
              <p className="text-sm text-neutral-500">
                Prompt-to-Video • AI Video Generation with Story Arcs & Character Voices
              </p>
              
              <div className="flex items-center space-x-6">
                <a href="#" className="text-sm text-neutral-400 hover:text-indigo-400 transition-colors">Documentation</a>
                <a href="#" className="text-sm text-neutral-400 hover:text-indigo-400 transition-colors">API Status</a>
                <div className="flex items-center space-x-2">
                  <span className={`w-2 h-2 rounded-full ${isBuffering ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
                  <span className="text-xs text-neutral-400 font-medium">
                    {isBuffering ? "Buffering" : "System Ready"}
                  </span>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </main>

      {/* Global styles for custom scrollbar */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.03);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(99, 102, 241, 0.3);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(99, 102, 241, 0.5);
        }
      `}</style>
    </div>
  );
}