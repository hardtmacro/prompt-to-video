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
  VolumeX
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
        console.log('[handleGenerate] Processing scene', i, ':', currentScene.characterName);
        
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
        try {
          console.log('[handleGenerate] Calling /api/text-to-speech for scene', i);
          
          const ttsRes = await fetch('/api/text-to-speech', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({ 
              text: currentScene.dialogue,
              voiceId: currentScene.voiceId || 'af_sarah'
            }),
            signal
          });
          
          console.log('[handleGenerate] TTS Response status for scene', i, ':', ttsRes.status);
          
          if (ttsRes.ok) {
            const ttsData = await ttsRes.json();
            console.log('[handleGenerate] Got audio URL for scene', i, ':', ttsData.audioUrl);
            mutableScenes[i] = { ...mutableScenes[i], audioUrl: ttsData.audioUrl };
          } else {
            const errorText = await ttsRes.text();
            console.error('[handleGenerate] TTS API error for scene', i, ':', errorText);
            throw new Error(`TTS API returned ${ttsRes.status}: ${errorText}`);
          }
        } catch (err) {
          console.error('[handleGenerate] TTS generation failed for scene', i, err);
          // Use empty audio URL - will be handled gracefully
          mutableScenes[i] = { ...mutableScenes[i], audioUrl: undefined };
        }

        // Update state with current scene progress
        setScenes([...mutableScenes]);
        setBufferedScenes(prev => new Set(prev).add(currentScene.id));
        
        // If first scene has content, stop buffering and show it
        if (i === 0 && mutableScenes[0].imageUrl) {
          setIsBuffering(false);
          setCurrentSceneIndex(0);
        }
      }

      console.log('[handleGenerate] Generation complete');
      setIsBuffering(false);
      
      // Add system message
      setChatMessages(prev => [...prev, {
        sender: 'system',
        text: `Generated ${mutableScenes.length} scenes with images and audio. Press play to watch!`,
        timestamp: new Date()
      }]);
      
    } catch (err) {
      console.error('[handleGenerate] Generation failed:', err);
      setGenerationError(err instanceof Error ? err.message : 'Generation failed');
      setIsBuffering(false);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const handlePlayPause = useCallback(() => {
    if (scenes.length === 0) return;
    
    setIsPlaying(prev => {
      const newPlaying = !prev;
      if (newPlaying && currentSceneIndex === -1) {
        setCurrentSceneIndex(0);
      }
      return newPlaying;
    });
  }, [scenes.length, currentSceneIndex]);

  const handleNextScene = useCallback(() => {
    if (currentSceneIndex < scenes.length - 1) {
      const nextIndex = currentSceneIndex + 1;
      setCurrentSceneIndex(nextIndex);
      
      // Auto-play audio for next scene if playing
      if (isPlaying && scenes[nextIndex]?.audioUrl) {
        if (audioRef.current) {
          audioRef.current.src = scenes[nextIndex].audioUrl!;
          audioRef.current.play().catch(console.error);
        }
      }
    }
  }, [currentSceneIndex, scenes, isPlaying]);

  const handlePrevScene = useCallback(() => {
    if (currentSceneIndex > 0) {
      const prevIndex = currentSceneIndex - 1;
      setCurrentSceneIndex(prevIndex);
      
      // Auto-play audio for previous scene if playing
      if (isPlaying && scenes[prevIndex]?.audioUrl) {
        if (audioRef.current) {
          audioRef.current.src = scenes[prevIndex].audioUrl!;
          audioRef.current.play().catch(console.error);
        }
      }
    }
  }, [currentSceneIndex, scenes, isPlaying]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900 text-white">
      {/* Hidden audio element */}
      <audio ref={audioRef} preload="auto" />
      
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-2 rounded-lg">
                <Video className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                Prompt-to-Video
              </h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={toggleMute}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Prompt Input Section */}
        <section className="mb-8">
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
            <label htmlFor="prompt-input" className="block text-sm font-medium text-gray-300 mb-2">
              Describe your story idea
            </label>
            <div className="relative">
              <textarea
                id="prompt-input"
                value={prompt}
                onChange={handlePromptChange}
                placeholder="Describe your story idea..."
                disabled={isGenerating}
                rows={3}
                className="w-full bg-black/30 border border-white/20 rounded-xl px-4 py-3 pr-12 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              />
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="absolute right-3 bottom-3 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 disabled:from-gray-500 disabled:to-gray-600 text-white p-2 rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
                aria-label={isGenerating ? 'Generating...' : 'Generate Story'}
              >
                {isGenerating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Sparkles className="w-5 h-5" />
                )}
              </button>
            </div>
            {generationError && (
              <p className="mt-2 text-red-400 text-sm">{generationError}</p>
            )}
          </div>
        </section>

        {/* Video Preview Section */}
        <section className="mb-8">
          <div 
            ref={videoRef}
            className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-white/10"
          >
            {isBuffering || (isGenerating && currentSceneIndex === -1) ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
                <Loader2 className="w-16 h-16 text-indigo-400 animate-spin mb-4" />
                <p className="text-gray-300 text-lg">Generating your story...</p>
                <p className="text-gray-500 text-sm mt-2">This may take a few moments</p>
              </div>
            ) : currentSceneIndex >= 0 && scenes[currentSceneIndex]?.imageUrl ? (
              <>
                <img
                  src={scenes[currentSceneIndex].imageUrl!}
                  alt={`Scene ${currentSceneIndex + 1}: ${scenes[currentSceneIndex].characterName}`}
                  className="w-full h-full object-contain bg-black"
                />
                {/* Character overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-indigo-400 font-medium text-sm uppercase tracking-wide">
                        {scenes[currentSceneIndex].characterName}
                      </p>
                      <p className="text-white text-xl font-bold mt-1">
                        {scenes[currentSceneIndex].dialogue}
                      </p>
                      <p className="text-gray-400 text-sm mt-2 italic">
                        {scenes[currentSceneIndex].narration}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Video className="w-24 h-24 text-gray-700 mb-4" />
                <p className="text-gray-500 text-lg">Enter a prompt and generate to start</p>
              </div>
            )}

            {/* Playback Controls */}
            {scenes.length > 0 && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-4 bg-black/60 backdrop-blur-sm rounded-full px-6 py-3">
                <button
                  onClick={handlePrevScene}
                  disabled={currentSceneIndex <= 0}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Previous scene"
                >
                  <ChevronDown className="w-5 h-5 rotate-90" />
                </button>
                
                <button
                  onClick={handlePlayPause}
                  className="p-3 rounded-full bg-indigo-500 hover:bg-indigo-600 transition-colors"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6" />
                  ) : (
                    <Play className="w-6 h-6" />
                  )}
                </button>
                
                <button
                  onClick={handleNextScene}
                  disabled={currentSceneIndex >= scenes.length - 1}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Next scene"
                >
                  <ChevronDown className="w-5 h-5 -rotate-90" />
                </button>
                
                <div className="text-sm text-gray-400 ml-2">
                  {currentSceneIndex + 1} / {scenes.length}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Scene Timeline */}
        {scenes.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center">
              <FileText className="w-5 h-5 mr-2" />
              Story Scenes
            </h2>
            <div className="flex space-x-3 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-white/20">
              <AnimatePresence>
                {scenes.map((scene, index) => (
                  <motion.button
                    key={scene.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    onClick={() => setCurrentSceneIndex(index)}
                    className={`flex-shrink-0 w-48 rounded-xl overflow-hidden border-2 transition-all ${
                      currentSceneIndex === index 
                        ? 'border-indigo-500 ring-2 ring-indigo-500/50' 
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <div className="aspect-video bg-black relative">
                      {scene.imageUrl ? (
                        <img 
                          src={scene.imageUrl} 
                          alt={scene.characterName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Loader2 className="w-8 h-8 text-gray-600 animate-spin" />
                        </div>
                      )}
                      {index === currentSceneIndex && (
                        <div className="absolute top-2 right-2">
                          <Play className="w-4 h-4 text-white" fill="white" />
                        </div>
                      )}
                    </div>
                    <div className="p-3 bg-white/5">
                      <p className="text-indigo-400 text-xs font-medium uppercase">{scene.characterName}</p>
                      <p className="text-gray-300 text-sm truncate mt-1">{scene.dialogue}</p>
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </section>
        )}

        {/* Chat Section */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <Mic2 className="w-5 h-5 mr-2" />
            Story Chat
          </h2>
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 max-h-80 overflow-y-auto">
            <div className="space-y-4">
              {chatMessages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                      msg.sender === 'user'
                        ? 'bg-indigo-500 text-white'
                        : 'bg-white/10 text-gray-200'
                    }`}
                  >
                    <p className="text-sm">{msg.text}</p>
                    <p className="text-xs opacity-60 mt-1">
                      {msg.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black/20 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-gray-500 text-sm">
            Prompt-to-Video Generator • Press arrow keys to navigate, space to play/pause
          </p>
        </div>
      </footer>
    </div>
  );
}