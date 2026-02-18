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
}

interface ChatMessage {
  sender: 'user' | 'system';
  text: string;
  timestamp: Date;
}

// Character voice mappings - different voices for different characters
const CHARACTER_VOICES: Record<string, string> = {
  'Narrator': 'af_sarah',
  'Visionary': 'af_adam',
  'Team Lead': 'af_jenny',
  'Innovator': 'af_nicole',
  'Hero': 'af_josh',
  'Guide': 'af_amy',
  'Challenger': 'af_eric',
  'Sage': 'af_brian',
  'Spark': 'af_joanna',
  'Echo': 'af_matthew',
  'Default': 'af_alloy'
};

// Story arc template for 10+ nodes
const STORY_ARC_TEMPLATE = {
  setup: [
    { characterName: 'Narrator', dialogue: 'In a world where challenges seem insurmountable...', narration: 'Every great story begins with a single step into the unknown. This is the tale of transformation.' },
    { characterName: 'Visionary', dialogue: 'I see a different future. One where we rise together.', narration: 'The Visionary speaks of possibilities that others cannot yet see.' }
  ],
  conflict: [
    { characterName: 'Challenger', dialogue: 'Why should we believe? We have been disappointed before.', narration: 'Doubt casts long shadows, but it also reveals the true strength of conviction.' },
    { characterName: 'Guide', dialogue: 'The path is difficult, but not impossible. Trust the process.', narration: 'Experience speaks through the Guide, offering wisdom earned through trials.' },
    { characterName: 'Hero', dialogue: 'I will be the first to try. Watch me.', narration: 'Courage is not the absence of fear, but the decision that something else matters more.' }
  ],
  climax: [
    { characterName: 'Spark', dialogue: 'Together we are stronger! Let us unite!', narration: 'The moment when individual sparks become a blazing fire of collective determination.' },
    { characterName: 'Echo', dialogue: 'I hear your call and I answer. We are many, now.', narration: 'One voice becomes many, echoing across the boundaries that once divided.' }
  ],
  resolution: [
    { characterName: 'Narrator', dialogue: 'And so the journey transformed not just them, but everyone they touched.', narration: 'The circle of influence expanded beyond imagination.' },
    { characterName: 'Visionary', dialogue: 'This was always possible. You just needed to believe.', narration: 'The dream that seemed impossible now stands as testament to human potential.' },
    { characterName: 'Sage', dialogue: 'Remember this moment. It will guide your tomorrow.', narration: 'Every ending is a new beginning waiting to unfold.' }
  ]
};

// Helper function to generate image prompts
const generateImagePrompt = (characterName: string, sceneIndex: number, theme: string): string => {
  const backgrounds = [
    'serene mountain landscape at dawn, soft golden light',
    'modern office space with floor-to-ceiling windows',
    'cozy library filled with ancient books',
    'bustling city square with people collaborating',
    'peaceful forest with rays of sunlight breaking through',
    'futuristic technology hub with holographic displays',
    'coastal sunset with waves gently rolling',
    'mountain peak above the clouds',
    'intimate campfire gathering under starlit sky',
    'sprawling garden in full bloom'
  ];
  
  const styles = [
    'cinematic, photorealistic, 8k quality',
    'artistic, painterly style, vibrant colors',
    'digital art, fantasy aesthetic',
    'minimalist, clean composition',
    'dramatic lighting, emotional atmosphere'
  ];

  return `Portrait of ${characterName}, ${backgrounds[sceneIndex % backgrounds.length]}, ${styles[sceneIndex % styles.length]}, consistent theme across all scenes`;
};

// Helper function to build story arc - defined outside component
const buildStoryArcHelper = (userPrompt: string): Scene[] => {
  const storyScenes: Scene[] = [];
  const promptKeywords = userPrompt.toLowerCase().split(' ').slice(0, 5).join(' ');
  
  // Combine all story arc sections
  const allSections = [
    ...STORY_ARC_TEMPLATE.setup,
    ...STORY_ARC_TEMPLATE.conflict,
    ...STORY_ARC_TEMPLATE.climax,
    ...STORY_ARC_TEMPLATE.resolution
  ];

  allSections.forEach((item, index) => {
    const voiceId = CHARACTER_VOICES[item.characterName] || CHARACTER_VOICES['Default'];
    
    storyScenes.push({
      id: `scene-${index}`,
      characterName: item.characterName,
      dialogue: item.dialogue.replace('I see a different future', `I see a different ${promptKeywords}`),
      narration: item.narration,
      imagePrompt: generateImagePrompt(item.characterName, index, promptKeywords),
      voiceId
    });
  });

  return storyScenes;
};

export default function PromptToVideoApp() {
  // State
  const [prompt, setPrompt] = useState<string>("Create an inspiring video about leadership and teamwork with multiple characters");
  const [isGenerating, setIsGenerating] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentSceneIndex, setCurrentSceneIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { sender: 'system', text: "Welcome to Prompt-to-Video. Enter a concept and we'll generate an immersive story with dynamic scenes and unique character voices.", timestamp: new Date() }
  ]);
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferedScenes, setBufferedScenes] = useState<Set<string>>(new Set());
  const [isMuted, setIsMuted] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  
  // Refs
  const videoRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const promptRef = useRef(prompt);
  const isGeneratingRef = useRef(false);

  // Keep prompt ref in sync
  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  // Keep isGenerating ref in sync to avoid stale closures
  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
      // Cancel any speech synthesis
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        handleNextScene();
      } else if (e.key === 'ArrowLeft') {
        handlePrevScene();
      } else if (e.key === ' ') {
        e.preventDefault();
        handlePlayPause();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSceneIndex, scenes.length, isPlaying]);

  // Auto-play audio when scene changes
  useEffect(() => {
    if (isPlaying && currentSceneIndex >= 0 && scenes[currentSceneIndex]?.audioUrl) {
      if (audioRef.current) {
        audioRef.current.src = scenes[currentSceneIndex].audioUrl!;
        audioRef.current.play().catch(console.error);
      }
    }
  }, [currentSceneIndex, isPlaying, scenes]);

  // Handle audio mute
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const handleGenerate = useCallback(async () => {
    console.log('[handleGenerate] Starting generation with prompt:', promptRef.current);
    
    // Cancel any ongoing generation
    if (abortControllerRef.current) {
      console.log('[handleGenerate] Aborting previous generation');
      abortControllerRef.current.abort();
    }
    
    // Cancel any ongoing speech synthesis
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    setIsGenerating(true);
    setGenerationError(null);
    setScenes([]);
    setCurrentSceneIndex(-1);
    setIsPlaying(false);
    setBufferedScenes(new Set());
    setIsBuffering(true);

    try {
      // Build story arc with 10+ scenes
      const storyScenes = buildStoryArcHelper(promptRef.current);
      console.log('[handleGenerate] Built story arc with', storyScenes.length, 'scenes');
      
      // Initialize scenes state
      setScenes(storyScenes);

      // Create a local mutable copy for sequential updates
      const mutableScenes = [...storyScenes];

      // Generate images and audio for each scene sequentially with buffering
      for (let i = 0; i < mutableScenes.length; i++) {
        if (signal.aborted) {
          console.log('[handleGenerate] Generation aborted at scene', i);
          break;
        }
        
        const currentScene = mutableScenes[i];
        console.log('[handleGenerate] Processing scene', i, ':', currentScene.characterName, 'with voice:', currentScene.voiceId);
        
        // Generate image - make the actual API call
        try {
          console.log('[handleGenerate] Calling /api/generate-image for scene', i);
          
          const imgRes = await fetch('/api/generate-image', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({ prompt: currentScene.imagePrompt }),
            signal
          });
          
          console.log('[handleGenerate] Response status for scene', i, ':', imgRes.status);
          
          if (imgRes.ok) {
            const data = await imgRes.json();
            console.log('[handleGenerate] Got image URL for scene', i, ':', data.url);
            mutableScenes[i] = { ...mutableScenes[i], imageUrl: data.url };
          } else {
            const errorText = await imgRes.text();
            console.error('[handleGenerate] API error for scene', i, ':', errorText);
            throw new Error(`API returned ${imgRes.status}: ${errorText}`);
          }
        } catch (err) {
          console.error('[handleGenerate] Image generation failed for scene', i, err);
          // Use bright placeholder - avoid dark images
          mutableScenes[i] = { 
            ...mutableScenes[i], 
            imageUrl: `https://placehold.co/1280x720/4F46E5/FFFFFF?text=${encodeURIComponent(currentScene.characterName)}`
          };
        }

        // Generate audio using text-to-speech API
        // The API returns an audio/wav blob, not JSON
        try {
          console.log('[handleGenerate] Calling /api/text-to-speech for scene', i, 'with voice:', currentScene.voiceId);
          
          const ttsRes = await fetch('/api/text-to-speech', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              text: currentScene.dialogue,
              voiceId: currentScene.voiceId || 'af_sarah'
            }),
            signal
          });
          
          console.log('[handleGenerate] TTS Response status for scene', i, ':', ttsRes.status);
          
          if (ttsRes.ok) {
            // The API returns an audio/wav blob
            const audioBlob = await ttsRes.blob();
            console.log('[handleGenerate] Got audio blob for scene', i, 'size:', audioBlob.size);
            
            if (audioBlob.size > 0) {
              // Create a blob URL for the audio
              const audioUrl = URL.createObjectURL(audioBlob);
              console.log('[handleGenerate] Created audio URL for scene', i, ':', audioUrl);
              mutableScenes[i] = { ...mutableScenes[i], audioUrl };
            }
          } else {
            console.error('[handleGenerate] TTS API error for scene', i, ':', ttsRes.status);
          }
        } catch (err) {
          console.error('[handleGenerate] TTS generation failed for scene', i, err);
        }

        // Update the scenes state with the current scene's generated content
        setScenes([...mutableScenes]);
        setBufferedScenes(prev => new Set(prev).add(currentScene.id));
      }

      console.log('[handleGenerate] Generation complete');
      setIsBuffering(false);
      
      // Add system message about completion
      setChatMessages(prev => [...prev, {
        sender: 'system',
        text: `Your story "${promptRef.current}" has been generated with ${storyScenes.length} scenes!`,
        timestamp: new Date()
      }]);

    } catch (err) {
      console.error('[handleGenerate] Generation failed:', err);
      if (!signal.aborted) {
        setGenerationError(err instanceof Error ? err.message : 'Generation failed');
        setIsBuffering(false);
      }
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        setIsGenerating(false);
      }
    }
  }, []);

  const handlePlayPause = useCallback(() => {
    if (scenes.length === 0) return;
    
    setIsPlaying(prev => {
      const newIsPlaying = !prev;
      if (newIsPlaying && currentSceneIndex < 0) {
        setCurrentSceneIndex(0);
      }
      return newIsPlaying;
    });
  }, [scenes.length, currentSceneIndex]);

  const handleNextScene = useCallback(() => {
    if (currentSceneIndex < scenes.length - 1) {
      setCurrentSceneIndex(prev => prev + 1);
    }
  }, [currentSceneIndex, scenes.length]);

  const handlePrevScene = useCallback(() => {
    if (currentSceneIndex > 0) {
      setCurrentSceneIndex(prev => prev - 1);
    }
  }, [currentSceneIndex]);

  const handleSceneClick = useCallback((index: number) => {
    setCurrentSceneIndex(index);
    if (!isPlaying) {
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleMuteToggle = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
  };

  // Determine if we should show empty state
  const showEmptyState = scenes.length === 0 && !isGenerating;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Hidden audio element for playback */}
      <audio ref={audioRef} preload="auto" />

      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Video className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-bold text-white">Prompt-to-Video</h1>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Mute/Unmute Button - needs title attribute */}
              <button
                onClick={handleMuteToggle}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <VolumeX className="w-5 h-5 text-white" />
                ) : (
                  <Volume2 className="w-5 h-5 text-white" />
                )}
              </button>
              
              <button className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                <RefreshCw className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Panel - Prompt Input */}
          <div className="lg:col-span-1 space-y-6">
            {/* Ready to Create heading - shows when no content generated */}
            {showEmptyState && (
              <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                <h2 className="text-2xl font-bold text-white mb-2">Ready to Create</h2>
                <p className="text-gray-400 text-sm">
                  Enter a concept below and watch it transform into an immersive video story with dynamic scenes and unique character voices.
                </p>
              </div>
            )}

            {/* Prompt Input Card */}
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Your Concept
              </label>
              <textarea
                value={prompt}
                onChange={handlePromptChange}
                placeholder="Describe your story concept..."
                className="w-full h-32 bg-black/30 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
              
              {/* Generate Button - must be disabled when generating */}
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className={`mt-4 w-full py-3 px-6 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${
                  isGenerating
                    ? 'bg-gray-600 cursor-not-allowed opacity-50'
                    : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg hover:shadow-purple-500/25'
                }`}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate
                  </>
                )}
              </button>
            </div>

            {/* Story Assistant Section */}
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <div className="flex items-center gap-3 mb-4">
                <MessageSquare className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-semibold text-white">Story Assistant</h3>
              </div>
              
              {/* Chat messages */}
              <div className="space-y-4 max-h-64 overflow-y-auto">
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg ${
                      msg.sender === 'system'
                        ? 'bg-purple-500/20 text-purple-200'
                        : 'bg-white/10 text-gray-200'
                    }`}
                  >
                    <p className="text-sm">{msg.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats / Info */}
            {scenes.length > 0 && (
              <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-white/5 rounded-lg">
                    <p className="text-2xl font-bold text-white">{scenes.length}</p>
                    <p className="text-xs text-gray-400">Scenes</p>
                  </div>
                  <div className="text-center p-3 bg-white/5 rounded-lg">
                    <p className="text-2xl font-bold text-white">
                      {Math.round(scenes.reduce((acc, s) => acc + (s.dialogue?.length || 0), 0) / 60)}s
                    </p>
                    <p className="text-xs text-gray-400">Est. Duration</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Video Preview */}
          <div className="lg:col-span-2">
            <div 
              ref={videoRef}
              className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
            >
              {/* Show placeholder when no scenes */}
              {showEmptyState ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                  <Video className="w-16 h-16 text-gray-600 mb-4" />
                  <p className="text-gray-500 text-lg">Your generated video will appear here</p>
                </div>
              ) : (
                <>
                  {/* Scene Image */}
                  {currentSceneIndex >= 0 && scenes[currentSceneIndex]?.imageUrl && (
                    <motion.img
                      key={scenes[currentSceneIndex].id}
                      src={scenes[currentSceneIndex].imageUrl}
                      alt={`Scene ${currentSceneIndex + 1}`}
                      className="w-full h-full object-cover"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    />
                  )}

                  {/* Scene Info Overlay */}
                  {currentSceneIndex >= 0 && scenes[currentSceneIndex] && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-6">
                      <motion.div
                        key={`info-${scenes[currentSceneIndex].id}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2 py-1 bg-purple-500/30 rounded text-purple-300 text-xs font-medium">
                            Scene {currentSceneIndex + 1} of {scenes.length}
                          </span>
                          {scenes[currentSceneIndex].audioUrl && (
                            <span className="px-2 py-1 bg-green-500/30 rounded text-green-300 text-xs font-medium flex items-center gap-1">
                              <Mic2 className="w-3 h-3" /> Audio Ready
                            </span>
                          )}
                        </div>
                        <h3 className="text-xl font-bold text-white mb-1">
                          {scenes[currentSceneIndex].characterName}
                        </h3>
                        <p className="text-gray-300 text-sm mb-2">
                          "{scenes[currentSceneIndex].dialogue}"
                        </p>
                        <p className="text-gray-400 text-xs italic">
                          {scenes[currentSceneIndex].narration}
                        </p>
                      </motion.div>
                    </div>
                  )}

                  {/* Buffering Overlay */}
                  {isBuffering && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <div className="text-center">
                        <Loader2 className="w-12 h-12 text-purple-500 animate-spin mx-auto mb-4" />
                        <p className="text-white text-lg">Generating your story...</p>
                        <p className="text-gray-400 text-sm mt-2">
                          Creating {scenes.length} scenes with images and audio
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Error Overlay */}
                  {generationError && (
                    <div className="absolute inset-0 bg-red-900/60 flex items-center justify-center">
                      <div className="text-center p-6">
                        <p className="text-white text-lg mb-2">Generation Error</p>
                        <p className="text-gray-300 text-sm">{generationError}</p>
                        <button
                          onClick={() => setGenerationError(null)}
                          className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Playback Controls */}
            {scenes.length > 0 && (
              <div className="mt-6 bg-white/5 rounded-2xl p-4 border border-white/10">
                <div className="flex items-center justify-between">
                  {/* Play/Pause Button */}
                  <button
                    onClick={handlePlayPause}
                    className="w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center transition-colors"
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5 text-white" />
                    ) : (
                      <Play className="w-5 h-5 text-white ml-0.5" />
                    )}
                  </button>

                  {/* Scene Navigation */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrevScene}
                      disabled={currentSceneIndex <= 0}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ArrowRight className="w-4 h-4 text-white rotate-180" />
                    </button>

                    {/* Scene Indicators */}
                    <div className="flex items-center gap-1 max-w-xs overflow-x-auto py-2">
                      {scenes.map((scene, idx) => (
                        <button
                          key={scene.id}
                          onClick={() => handleSceneClick(idx)}
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                            idx === currentSceneIndex
                              ? 'bg-purple-600 text-white scale-110'
                              : bufferedScenes.has(scene.id)
                                ? 'bg-green-600/30 text-green-300'
                                : 'bg-white/10 text-gray-400 hover:bg-white/20'
                          }`}
                        >
                          {idx + 1}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={handleNextScene}
                      disabled={currentSceneIndex >= scenes.length - 1}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ArrowRight className="w-4 h-4 text-white" />
                    </button>
                  </div>

                  {/* Scene Counter */}
                  <div className="text-sm text-gray-400">
                    {currentSceneIndex >= 0 ? (
                      <span>{currentSceneIndex + 1} / {scenes.length}</span>
                    ) : (
                      <span>0 / {scenes.length}</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}