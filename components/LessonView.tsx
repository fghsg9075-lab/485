
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { LessonContent, Subject, ClassLevel, Chapter, MCQItem, ContentType, User, SystemSettings } from '../types';
import { ArrowLeft, Clock, AlertTriangle, ExternalLink, CheckCircle, XCircle, Trophy, BookOpen, Play, Lock, ChevronRight, ChevronLeft, Save, X, Maximize, Volume2, Square, Zap, StopCircle, Globe, Lightbulb, FileText, BrainCircuit, Grip, CheckSquare } from 'lucide-react';
import { CustomConfirm, CustomAlert } from './CustomDialogs';
import { CustomPlayer } from './CustomPlayer';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { decodeHtml } from '../utils/htmlDecoder';
import { storage } from '../utils/storage';
import { getChapterData } from '../firebase';
import { SpeakButton } from './SpeakButton';
import { renderMathInHtml } from '../utils/mathUtils';

interface Props {
  content: LessonContent | null;
  subject: Subject;
  classLevel: ClassLevel;
  chapter: Chapter;
  loading: boolean;
  onBack: () => void;
  onMCQComplete?: (count: number, answers: Record<number, number>, usedData: MCQItem[], timeTaken: number, questionTimes?: Record<number, number>) => void;
  user?: User; // Optional for non-MCQ views
  onUpdateUser?: (user: User) => void;
  settings?: SystemSettings; // New Prop for Pricing
  isStreaming?: boolean; // Support for streaming content
  onLaunchContent?: (content: any) => void;
}

export const LessonView: React.FC<Props> = ({ 
  content, 
  subject, 
  classLevel, 
  chapter,
  loading, 
  onBack,
  onMCQComplete,
  user,
  onUpdateUser,
  settings,
  isStreaming = false,
  onLaunchContent
}) => {
  const [mcqState, setMcqState] = useState<Record<number, number | null>>({});
  const [timeSpentPerQuestion, setTimeSpentPerQuestion] = useState<Record<number, number>>({});
  const [showResults, setShowResults] = useState(false); // Used to trigger Analysis Mode
  const [localMcqData, setLocalMcqData] = useState<MCQItem[]>([]);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [analysisUnlocked, setAnalysisUnlocked] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [language, setLanguage] = useState<Language>('English');
  const [universalNotes, setUniversalNotes] = useState<any[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [viewingNote, setViewingNote] = useState<any>(null); // New state for HTML Note Modal

  const [showQuestionDrawer, setShowQuestionDrawer] = useState(false);
  const [batchIndex, setBatchIndex] = useState(0);
  const [autoReadEnabled, setAutoReadEnabled] = useState(true);
  const BATCH_SIZE = 1;

  // LANGUAGE AUTO-SELECT
  useEffect(() => {
    if (user?.board === 'BSEB') {
        setLanguage('Hindi');
    } else if (user?.board === 'CBSE') {
        setLanguage('English');
    }
  }, [user?.board]);

  // LOAD UNIVERSAL NOTES FOR ANALYSIS
  useEffect(() => {
      if (content?.type === 'MCQ_ANALYSIS' && universalNotes.length === 0) {
          setRecLoading(true);
          getChapterData('nst_universal_notes').then(data => {
              if (data && data.notesPlaylist) {
                  setUniversalNotes(data.notesPlaylist);
              }
              setRecLoading(false);
          });
      }
  }, [content?.type]);

  // Full Screen Ref
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleFullScreen = () => {
      if (!document.fullscreenElement) {
          containerRef.current?.requestFullscreen().catch(e => console.error(e));
      } else {
          document.exitFullscreen();
      }
  };

  // TIMER STATE
  const [sessionTime, setSessionTime] = useState(0); // Total seconds
  
      // TIMER EFFECT (UPDATED: Track Per Question)
  useEffect(() => {
      let interval: any;
          if (!showResults && !showSubmitModal && !showResumePrompt && content?.mcqData) {
          interval = setInterval(() => {
              setSessionTime(prev => prev + 1);

                  // Track time for current question (only if viewing 1 question at a time or first in batch)
                  // Assuming batchIndex corresponds to question index if BATCH_SIZE is 1
                  if (true) { // BATCH_SIZE is confirmed 1 in render logic
                      setTimeSpentPerQuestion(prev => ({
                          ...prev,
                          [batchIndex]: (prev[batchIndex] || 0) + 1
                      }));
                  }
          }, 1000);
      }
      return () => clearInterval(interval);
      }, [showResults, showSubmitModal, showResumePrompt, batchIndex, content]);

  // AUTO READ MCQ
  useEffect(() => {
      if (
          !showResults &&
          !showSubmitModal &&
          !showResumePrompt &&
          content?.mcqData &&
          autoReadEnabled &&
          batchIndex < (localMcqData.length || (content.mcqData || []).length)
      ) {
          const displayData = localMcqData.length > 0 ? localMcqData : (content.mcqData || []);
          const q = displayData[batchIndex];
          if (q) {
              // Wait a bit for transition
              setTimeout(() => {
                  const text = `${q.question}. Options: ${q.options.join(', ')}`;
                  startSpeaking(text);
              }, 500);
          }
      } else {
          window.speechSynthesis.cancel();
      }
  }, [batchIndex, showResults, showSubmitModal, showResumePrompt, autoReadEnabled]);

  // ANTI-CHEAT (Exam Mode)
  useEffect(() => {
      if (content?.subtitle?.includes('Premium Test') && !showResults && !showSubmitModal) {
          const handleVisibilityChange = () => {
              if (document.hidden) {
                  setAlertConfig({isOpen: true, message: "⚠️ Exam Mode Violation! Test Submitted Automatically."});
                  handleConfirmSubmit();
              }
          };
          document.addEventListener("visibilitychange", handleVisibilityChange);
          return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
  }, [content, showResults, showSubmitModal, mcqState]); // Added mcqState to ensure handleConfirmSubmit has latest data

  // Custom Dialog State
  const [alertConfig, setAlertConfig] = useState<{isOpen: boolean, message: string}>({isOpen: false, message: ''});
  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({isOpen: false, title: '', message: '', onConfirm: () => {}});

  // TTS STATE
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechRate, setSpeechRate] = useState(1.0);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const currentTextRef = useRef<string | null>(null);
  
  // CHUNKING STATE
  const chunksRef = useRef<string[]>([]);
  const chunkIndexRef = useRef(0);

  useEffect(() => {
    return () => {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
    };
  }, [content]);

  const speakChunk = () => {
      if (chunkIndexRef.current >= chunksRef.current.length) {
          setIsSpeaking(false);
          return;
      }

      const text = chunksRef.current[chunkIndexRef.current];
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = speechRate;

      // Auto-detect Hindi PER CHUNK
      const isHindi = /[\u0900-\u097F]/.test(text);
      if (isHindi) {
          utterance.lang = 'hi-IN';
          const voices = window.speechSynthesis.getVoices();
          const hindiVoice = voices.find(v => v.lang.includes('hi') || v.name.includes('Hindi') || v.lang === 'hi-IN');
          if (hindiVoice) utterance.voice = hindiVoice;
      }

      utterance.onend = () => {
          chunkIndexRef.current++;
          speakChunk();
      };
      utterance.onerror = (e) => {
          console.error("TTS Error", e);
          setIsSpeaking(false);
      };
      
      speechRef.current = utterance;
      window.speechSynthesis.speak(utterance);
  };

  const handleSpeak = (text: string) => {
      if (isSpeaking && currentTextRef.current === text) {
          window.speechSynthesis.cancel();
          setIsSpeaking(false);
          currentTextRef.current = null;
          return;
      }

      // FREE TTS - No Cost Deduction
      startSpeaking(text);
  };

  const startSpeaking = (text: string) => {
      window.speechSynthesis.cancel();
      currentTextRef.current = text;
      
      // Clean text
      let textToRead = text.replace(/<[^>]*>?/gm, ' '); // Replace HTML tags with space
      textToRead = textToRead.replace(/&nbsp;/g, ' ');
      textToRead = textToRead.replace(/[#*\-]/g, ''); // Remove markdown chars
      textToRead = textToRead.replace(/\s+/g, ' ').trim();
      
      // Split into chunks (Sentences)
      // More robust splitting for large texts (10k-20k words)
      const rawChunks = textToRead.match(/[^.!?\n]+[.!?\n]*/g) || [textToRead];
      
      const processedChunks: string[] = [];
      const MAX_CHUNK_LENGTH = 200;

      rawChunks.forEach(chunk => {
          let currentChunk = chunk.trim();
          if (currentChunk.length === 0) return;

          if (currentChunk.length > MAX_CHUNK_LENGTH) {
              const subChunks = currentChunk.match(new RegExp(`.{1,${MAX_CHUNK_LENGTH}}(\\s|$)`, 'g')) || [currentChunk];
              subChunks.forEach(sub => processedChunks.push(sub.trim()));
          } else {
              processedChunks.push(currentChunk);
          }
      });

      chunksRef.current = processedChunks;
      chunkIndexRef.current = 0;

      if (chunksRef.current.length === 0) return;

      setIsSpeaking(true);

      // Ensure voices are loaded
      if (window.speechSynthesis.getVoices().length === 0) {
          const handleVoicesChanged = () => {
              speakChunk();
              window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
          };
          window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
      } else {
          speakChunk();
      }
  };

  const toggleSpeed = () => {
      const rates = [0.75, 1.0, 1.25, 1.5, 2.0];
      const nextIdx = (rates.indexOf(speechRate) + 1) % rates.length;
      const newRate = rates[nextIdx];
      setSpeechRate(newRate);
      
      if (isSpeaking) {
          window.speechSynthesis.cancel();
          setTimeout(() => {
              speakChunk();
          }, 50);
      }
  };

  if (loading) {
      return (
          <div className="h-[70vh] flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4"></div>
              <h3 className="text-xl font-bold text-slate-800 animate-pulse">Loading Content...</h3>
              <p className="text-slate-500 text-sm">Please wait while we fetch the data.</p>
          </div>
      );
  }

  if (!content) return null;

  // 1. AI IMAGE/HTML NOTES
  const activeContentValue = (language === 'Hindi' && content.schoolPremiumNotesHtml_HI) 
      ? content.schoolPremiumNotesHtml_HI 
      : (content.content || content.pdfUrl || content.videoUrl || '');

  const contentValue = activeContentValue;
  const isImage = contentValue && (contentValue.startsWith('data:image') || contentValue.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i));
  const isHtml = content.aiHtmlContent || (contentValue && !contentValue.startsWith('http') && contentValue.includes('<'));

  // SCHOOL MODE FREE NOTES FIX
  const isFree = content.type === 'PDF_FREE' || content.type === 'NOTES_HTML_FREE' || (content.type === 'VIDEO_LECTURE' && content.videoPlaylist?.some(v => v.access === 'FREE'));
  
  // FREE HTML NOTE MODAL
  if (viewingNote) {
      return (
          <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-in fade-in">
              {/* Header */}
              <header className="bg-white border-b border-slate-200 p-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
                  <div className="flex items-center gap-3">
                      {settings?.appLogo && <img src={settings.appLogo} className="w-8 h-8 object-contain" />}
                      <div>
                          <h2 className="font-black text-slate-800 uppercase text-sm">{settings?.appName || 'Free Notes'}</h2>
                          <p className="text-[10px] text-orange-600 font-bold uppercase tracking-widest">Recommended Reading</p>
                      </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <SpeakButton text={viewingNote.content} className="p-2 bg-orange-50 text-orange-600 hover:bg-orange-100" />
                    <button onClick={() => setViewingNote(null)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X size={20}/></button>
                  </div>
              </header>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50">
                  <div className="max-w-3xl mx-auto bg-white p-6 rounded-3xl shadow-sm border border-slate-100 min-h-[50vh]">
                      <h1 className="text-2xl font-black text-slate-900 mb-6 border-b pb-4">{viewingNote.title}</h1>
                      <div
                          className="prose prose-slate max-w-none prose-p:text-slate-700 prose-headings:font-black"
                          dangerouslySetInnerHTML={{ __html: decodeHtml(viewingNote.content) }}
                      />
                  </div>
              </div>

              {/* Footer */}
              <div className="bg-white border-t border-slate-200 p-4 text-center">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Developed by Nadim Anwar</p>
              </div>
          </div>
      );
  }

  if (content.type === 'NOTES_IMAGE_AI' || isImage || isHtml) {
      const preventMenu = (e: React.MouseEvent | React.TouchEvent) => e.preventDefault();
      
      if (isHtml) {
          const htmlToRender = content.aiHtmlContent || content.content;
          const decodedContent = decodeHtml(htmlToRender);
          return (
              <div className="fixed inset-0 z-50 bg-white flex flex-col animate-in fade-in">
                  <header className="bg-white/95 backdrop-blur-md text-slate-800 p-4 absolute top-0 left-0 right-0 z-10 flex items-center justify-between border-b border-slate-100 shadow-sm">
                      <div className="flex items-center gap-3">
                          <button onClick={onBack} className="p-2 bg-slate-100 rounded-full"><ArrowLeft size={20} /></button>
                          <div>
                              <h2 className="text-sm font-bold">{content.title}</h2>
                              <p className="text-[10px] text-teal-600 font-bold uppercase tracking-widest">Digital Notes</p>
                          </div>
                      </div>
                      <div className="flex items-center gap-1">
                          <button 
                              onClick={() => setLanguage(l => l === 'English' ? 'Hindi' : 'English')}
                              className="px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 border border-slate-200 mr-1 flex items-center gap-1 transition-all"
                          >
                              <Globe size={14} /> {language === 'English' ? 'Hindi (हिंदी)' : 'English'}
                          </button>
                      <button onClick={() => handleSpeak(decodedContent)} className={`p-2 rounded-full transition-all ${isSpeaking ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} title="Listen (FREE)">
                              {isSpeaking ? <Square size={18} fill="currentColor" /> : <Volume2 size={18} />}
                      </button>
                      {/* DOWNLOAD BUTTON */}
                      <button title="Download Audio" onClick={() => alert("Downloading Audio...")} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 transition-colors">
                          <Save size={18} />
                          </button>
                          <button onClick={toggleSpeed} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 flex items-center gap-0.5">
                              <Zap size={14} /><span className="text-[10px] font-bold">{speechRate}x</span>
                          </button>
                          <button onClick={onBack} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors"><X size={20} /></button>
                      </div>
                  </header>
                  <div className="flex-1 overflow-y-auto w-full pt-16 pb-20 px-4 md:px-8 bg-white">
                      <div 
                          className="prose prose-slate max-w-none prose-p:leading-relaxed prose-p:text-slate-700 prose-headings:font-black font-sans"
                          dangerouslySetInnerHTML={{ __html: decodedContent }}
                      />
                      {isStreaming && (
                        <div className="flex items-center gap-2 text-slate-500 mt-4 px-4 md:px-8 animate-pulse pb-4">
                            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                            <span className="text-xs font-bold">AI writing...</span>
                        </div>
                      )}
                  </div>
              </div>
          );
      }
      
      if (isImage) {
          return (
              <div className="fixed inset-0 z-50 bg-[#111] flex flex-col animate-in fade-in">
                  <header className="bg-black/90 backdrop-blur-md text-white p-4 absolute top-0 left-0 right-0 z-10 flex items-center justify-between border-b border-white/10">
                      <div className="flex items-center gap-3">
                          <button onClick={onBack} className="p-2 bg-white/10 rounded-full"><ArrowLeft size={20} /></button>
                          <div>
                              <h2 className="text-sm font-bold text-white/90">{content.title}</h2>
                              <p className="text-[10px] text-teal-400 font-bold uppercase tracking-widest">Image Notes</p>
                          </div>
                      </div>
                      <button onClick={onBack} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors backdrop-blur-md"><X size={20} /></button>
                  </header>
                  <div className="flex-1 overflow-y-auto pt-16 flex items-start justify-center" onContextMenu={preventMenu}>
                      <img src={content.content} alt="Notes" className="w-full h-auto object-contain" draggable={false} />
                  </div>
              </div>
          );
      }
  }

  // 2. URL LINK / PDF NOTES (Strict HTTP check)
  const isUrl = contentValue && (contentValue.startsWith('http://') || contentValue.startsWith('https://'));
  if (['PDF_FREE', 'PDF_PREMIUM', 'PDF_ULTRA', 'PDF_VIEWER'].includes(content.type) || isUrl) {
      const isGoogleDriveAudio = contentValue.includes('drive.google.com') && (content.title.toLowerCase().includes('audio') || content.title.toLowerCase().includes('podcast') || content.type.includes('AUDIO'));

      if (isGoogleDriveAudio) {
          return (
              <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col animate-in fade-in">
                  <header className="bg-slate-900/90 backdrop-blur-md text-white p-4 flex items-center justify-between border-b border-white/10 z-20">
                      <div className="flex items-center gap-3">
                          <button onClick={onBack} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"><ArrowLeft size={20} /></button>
                          <div>
                            <h2 className="font-bold text-white leading-tight">{content.title}</h2>
                            <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest">Premium Audio Experience</p>
                          </div>
                      </div>
                      <button onClick={onBack} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"><X size={20} /></button>
                  </header>
                  <div className="flex-1 flex items-center justify-center p-4 bg-slate-950 relative overflow-hidden">
                      {/* Animated Background Gradients */}
                      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-600/10 rounded-full blur-[100px] animate-pulse"></div>
                      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-600/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }}></div>
                      
                      <div className="w-full max-w-2xl aspect-video relative z-10 rounded-2xl overflow-hidden shadow-2xl border border-white/5">
                          <CustomPlayer videoUrl={contentValue} />
                      </div>
                  </div>
              </div>
          );
      }

      return (
          <div className="fixed inset-0 z-50 bg-white flex flex-col animate-in fade-in">
              <header className="bg-white border-b p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                      <button onClick={onBack} className="p-2 bg-slate-100 rounded-full"><ArrowLeft size={20} /></button>
                      <h2 className="font-bold truncate">{content.title}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                      <a href={contentValue} target="_blank" rel="noopener noreferrer" className="p-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors">
                          <ExternalLink size={20} />
                      </a>
                      <button onClick={onBack} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors"><X size={20} /></button>
                  </div>
              </header>
              <div className="flex-1 bg-slate-100 relative">
                  <iframe 
                      src={contentValue} 
                      className="absolute inset-0 w-full h-full border-none"
                      title={content.title}
                      allowFullScreen
                  />
              </div>
          </div>
      );
  }

  // 3. MANUAL TEXT / MARKDOWN NOTES (Fallback)
  if (content.content || isStreaming) {
      return (
          <div className="flex flex-col h-full bg-white animate-in fade-in">
              <header className="bg-white border-b p-4 flex items-center justify-between sticky top-0 z-10">
                  <div className="flex items-center gap-3">
                      <button onClick={onBack} className="p-2 bg-slate-100 rounded-full"><ArrowLeft size={20} /></button>
                      <h2 className="font-bold">{content.title}</h2>
                  </div>
                  <div className="flex items-center gap-1">
                      <button 
                          onClick={() => setLanguage(l => l === 'English' ? 'Hindi' : 'English')}
                          className="px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 border border-slate-200 mr-1 flex items-center gap-1 transition-all"
                      >
                          <Globe size={14} /> {language === 'English' ? 'Hindi (हिंदी)' : 'English'}
                      </button>
                      <button onClick={() => handleSpeak(content.content)} className={`p-2 rounded-full transition-all ${isSpeaking ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} title="Listen (FREE)">
                          {isSpeaking ? <Square size={18} fill="currentColor" /> : <Volume2 size={18} />}
                      </button>
                      {/* DOWNLOAD BUTTON */}
                      <button title="Download Audio" onClick={() => alert("Downloading Audio...")} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 transition-colors">
                          <Save size={18} />
                      </button>
                      <button onClick={toggleSpeed} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 flex items-center gap-0.5">
                          <Zap size={14} /><span className="text-[10px] font-bold">{speechRate}x</span>
                      </button>
                      <button onClick={onBack} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors"><X size={20} /></button>
                  </div>
              </header>
              <div className="flex-1 overflow-y-auto p-6 bg-white">
                  <div className="prose prose-slate max-w-none prose-p:leading-relaxed prose-p:text-slate-700 prose-headings:font-black font-sans">
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                          {content.content}
                      </ReactMarkdown>
                      {isStreaming && (
                        <div className="flex items-center gap-2 text-slate-500 mt-4 animate-pulse">
                            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                            <span className="text-xs font-bold">AI writing...</span>
                        </div>
                      )}
                  </div>
              </div>
          </div>
      );
  }

  if (content.isComingSoon) {
      return (
          <div className="h-[70vh] flex flex-col items-center justify-center text-center p-8 bg-slate-50 rounded-2xl m-4 border-2 border-dashed border-slate-200">
              <Clock size={64} className="text-orange-400 mb-4 opacity-80" />
              <h2 className="text-2xl font-black text-slate-800 mb-2">Coming Soon</h2>
              <p className="text-slate-600 max-w-xs mx-auto mb-6">
                  This content is currently being prepared by the Admin.
              </p>
              <button onClick={onBack} className="mt-8 text-slate-400 font-bold hover:text-slate-600">
                  Go Back
              </button>
          </div>
      );
  }

  // --- MCQ RENDERER ---
  if ((content.type === 'MCQ_ANALYSIS' || content.type === 'MCQ_SIMPLE') && content.mcqData) {
      // --- INITIALIZATION & RESUME LOGIC ---
      useEffect(() => {
          if (!content.mcqData) return;
          
          const sourceData = (language === 'Hindi' && content.manualMcqData_HI && content.manualMcqData_HI.length > 0)
              ? content.manualMcqData_HI
              : content.mcqData;

          if (content.userAnswers) {
              setMcqState(content.userAnswers);
              setShowResults(true);
              setAnalysisUnlocked(true);
              setLocalMcqData(sourceData);
              return;
          }

          const key = `nst_mcq_progress_${chapter.id}`;
          storage.getItem(key).then(saved => {
              if (saved) {
                  setShowResumePrompt(true);
                  setLocalMcqData(sourceData);
              } else {
                  setLocalMcqData(sourceData);
              }
          });
      }, [content.mcqData, content.manualMcqData_HI, chapter.id, content.userAnswers, language]);

      // --- SAVE PROGRESS LOGIC ---
      useEffect(() => {
          if (!showResults && Object.keys(mcqState).length > 0) {
              const key = `nst_mcq_progress_${chapter.id}`;
              storage.setItem(key, {
                  mcqState,
                  batchIndex,
                  localMcqData
              });
          }
      }, [mcqState, batchIndex, chapter.id, localMcqData, showResults]);

      const handleResume = () => {
          const key = `nst_mcq_progress_${chapter.id}`;
          storage.getItem(key).then(saved => {
              if (saved) {
                  const parsed = saved;
                  setMcqState(parsed.mcqState || {});
                  setBatchIndex(parsed.batchIndex || 0);
                  if (parsed.localMcqData) setLocalMcqData(parsed.localMcqData);
              }
              setShowResumePrompt(false);
          });
      };

      const handleRestart = () => {
          const key = `nst_mcq_progress_${chapter.id}`;
          storage.removeItem(key);
          setMcqState({});
          setBatchIndex(0);
          setLocalMcqData([...(content.mcqData || [])].sort(() => Math.random() - 0.5));
          setShowResumePrompt(false);
          setAnalysisUnlocked(false);
          setShowResults(false);
      };

      const handleRecreate = () => {
          setConfirmConfig({
              isOpen: true,
              title: "Restart Quiz?",
              message: "This will shuffle questions and reset your current progress.",
              onConfirm: () => {
                  const shuffled = [...(content.mcqData || [])].sort(() => Math.random() - 0.5);
                  setLocalMcqData(shuffled);
                  setMcqState({});
                  setBatchIndex(0);
                  setShowResults(false);
                  setAnalysisUnlocked(false);
                  const key = `nst_mcq_progress_${chapter.id}`;
                  storage.removeItem(key);
                  setConfirmConfig(prev => ({...prev, isOpen: false}));
              }
          });
      };

      const displayData = localMcqData.length > 0 ? localMcqData : (content.mcqData || []);
      const currentBatchData = displayData.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
      const hasMore = (batchIndex + 1) * BATCH_SIZE < displayData.length;

      const score = Object.keys(mcqState).reduce((acc, key) => {
          const qIdx = parseInt(key);
          return acc + (mcqState[qIdx] === displayData[qIdx].correctAnswer ? 1 : 0);
      }, 0);

      const currentCorrect = score;
      const currentWrong = Object.keys(mcqState).length - currentCorrect;
      const attemptedCount = Object.keys(mcqState).length;
      const minRequired = Math.min(30, displayData.length);
      const canSubmit = attemptedCount >= minRequired;

      const currentBatchAttemptedCount = currentBatchData.reduce((acc, _, localIdx) => {
          const idx = (batchIndex * BATCH_SIZE) + localIdx;
          return acc + (mcqState[idx] !== undefined && mcqState[idx] !== null ? 1 : 0);
      }, 0);
      const canGoNext = currentBatchAttemptedCount >= Math.min(BATCH_SIZE, currentBatchData.length);

      const handleOptionSelect = (qIdx: number, oIdx: number) => {
          setMcqState(prev => ({ ...prev, [qIdx]: oIdx }));

          // Auto-Next Logic
          if (!showResults && (batchIndex + 1) * BATCH_SIZE < displayData.length) {
              setTimeout(() => {
                  setBatchIndex(prev => prev + 1);
                  const container = document.querySelector('.mcq-container');
                  if(container) container.scrollTop = 0;
              }, 400); // 400ms delay for user feedback
          }
      };

      const handleSubmitRequest = () => {
          setShowSubmitModal(true);
      };

    const handleConfirmSubmit = () => {
        setShowSubmitModal(false);
        const key = `nst_mcq_progress_${chapter.id}`;
        storage.removeItem(key);
        
        // Don't show results or unlock analysis immediately
        // This allows the MarksheetCard in McqView to handle the flow
        setShowResults(false);
        setAnalysisUnlocked(false);
        
        // CHECK WARNING (Rushed Questions)
        const rushedCount = Object.keys(timeSpentPerQuestion).filter(k => timeSpentPerQuestion[parseInt(k)] < 5).length;
        if (rushedCount > 5) {
            setAlertConfig({
                isOpen: true,
                type: 'ERROR',
                message: "Warning: It seems you finished too fast. Try to read questions carefully next time!"
            });
        }

        if (onMCQComplete) {
            onMCQComplete(score, mcqState as Record<number, number>, displayData, sessionTime, timeSpentPerQuestion);
        }

        // EXTRA SYNC FOR HISTORY (Ensuring it saves even if parent is busy)
        const historyItem = {
            id: `mcq_${chapter.id}_${Date.now()}`,
            type: 'MCQ_RESULT',
            title: `${chapter.title} - Test`,
            date: new Date().toISOString(),
            score,
            totalQuestions: displayData.length,
            timeTaken: sessionTime,
            chapterId: chapter.id,
            subjectId: subject.id,
            classLevel,
            userAnswers: mcqState
        };
        import('../firebase').then(m => {
            if (user?.id) {
                m.saveUserHistory(user.id, historyItem);
                m.saveTestResult(user.id, historyItem);
            }
        });
    };

    const renderAnalysisDashboard = () => {
        const isPremium = content?.analysisType === 'PREMIUM';
        const notes = universalNotes.filter(n => {
            const isTypeMatch = isPremium ? (!n.type || n.type === 'PDF') : (n.type === 'HTML');
            return isTypeMatch && n.chapterId === chapter.id;
        });

        return (
            <div className="space-y-6 mb-8 animate-in slide-in-from-top-4">

                {/* AI REPORT (PREMIUM ONLY) */}
                {isPremium && content?.aiAnalysisText && (
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-purple-100 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-100 rounded-full blur-3xl opacity-50 -mr-10 -mt-10"></div>
                        <div className="flex items-center justify-between mb-4 relative z-10">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-lg shadow-purple-200">
                                    <BrainCircuit size={20} />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-800 text-lg">AI Performance Report</h3>
                                    <p className="text-xs text-purple-600 font-bold">Deep Insights & Strategy</p>
                                </div>
                            </div>
                            <SpeakButton text={content.aiAnalysisText} className="p-2 bg-purple-50 text-purple-600 hover:bg-purple-100" />
                        </div>
                        <div className="prose prose-sm prose-slate max-w-none prose-p:text-slate-600 prose-headings:font-black prose-headings:text-slate-800 bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <ReactMarkdown>{content.aiAnalysisText}</ReactMarkdown>
                        </div>
                    </div>
                )}

                {/* RECOMMENDED NOTES */}
                <div className={`p-6 rounded-3xl shadow-sm border relative overflow-hidden ${isPremium ? 'bg-white border-red-100' : 'bg-white border-orange-100'}`}>
                    <div className="flex items-center gap-3 mb-4 relative z-10">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${isPremium ? 'bg-red-600 text-white shadow-red-200' : 'bg-orange-500 text-white shadow-orange-200'}`}>
                            {isPremium ? <FileText size={20} /> : <Lightbulb size={20} />}
                        </div>
                        <div>
                            <h3 className="font-black text-slate-800 text-lg">{isPremium ? 'Premium Study Notes' : 'Recommended Reading'}</h3>
                            <p className={`text-xs font-bold ${isPremium ? 'text-red-600' : 'text-orange-600'}`}>
                                {isPremium ? 'High-Yield PDFs for Weak Topics' : 'Quick Revision Summaries'}
                            </p>
                        </div>
                    </div>

                    {recLoading ? (
                        <div className="text-center py-8 text-slate-400 font-bold animate-pulse">Finding best notes...</div>
                    ) : notes.length === 0 ? (
                        <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            <p className="text-slate-400 font-bold text-sm">No specific notes found for this chapter.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {notes.map((note, idx) => (
                                <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200 hover:border-blue-300 transition-colors group">
                                    <h4 className="font-bold text-slate-800 text-sm mb-1 group-hover:text-blue-700">{note.title}</h4>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-3 bg-white px-2 py-0.5 rounded w-fit border">{note.topic || 'General'}</p>

                                    {isPremium ? (
                                        <a
                                            href={note.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block w-full py-2 bg-red-600 text-white text-center rounded-lg text-xs font-bold hover:bg-red-700 shadow-md transition-all"
                                        >
                                            Open PDF Note
                                        </a>
                                    ) : (
                                        <button
                                            onClick={() => setViewingNote(note)}
                                            className="block w-full py-2 bg-orange-500 text-white text-center rounded-lg text-xs font-bold hover:bg-orange-600 shadow-md transition-all"
                                        >
                                            Read Summary
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    };

      const handleNextPage = () => {
          setBatchIndex(prev => prev + 1);
          const container = document.querySelector('.mcq-container');
          if(container) container.scrollTop = 0;
      };

      const handlePrevPage = () => {
          if (batchIndex > 0) {
              setBatchIndex(prev => prev - 1);
              const container = document.querySelector('.mcq-container');
              if(container) container.scrollTop = 0;
          }
      };

      return (
          <div className="flex flex-col h-full bg-slate-50 animate-in fade-in relative mcq-container overflow-y-auto">
               <CustomAlert 
                   isOpen={alertConfig.isOpen} 
                   message={alertConfig.message} 
                   type="ERROR"
                   onClose={() => setAlertConfig({...alertConfig, isOpen: false})} 
               />
               <CustomConfirm
                   isOpen={confirmConfig.isOpen}
                   title={confirmConfig.title}
                   message={confirmConfig.message}
                   onConfirm={confirmConfig.onConfirm}
                   onCancel={() => setConfirmConfig({...confirmConfig, isOpen: false})}
               />

               {showResumePrompt && !showResults && (
                   <div className="absolute inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
                       <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl">
                           <h3 className="text-xl font-black text-slate-800 mb-2">Resume Session?</h3>
                           <p className="text-slate-500 text-sm mb-6">You have a saved session for this chapter.</p>
                           <div className="flex gap-3">
                               <button onClick={handleRestart} className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl">Restart</button>
                               <button onClick={handleResume} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg">Resume</button>
                           </div>
                       </div>
                   </div>
               )}

               {showSubmitModal && (
                   <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
                       <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl animate-in zoom-in duration-200">
                           <Trophy size={48} className="mx-auto text-yellow-400 mb-4" />
                           <h3 className="text-xl font-black text-slate-800 mb-2">Submit Test?</h3>
                           <p className="text-slate-500 text-sm mb-6">
                               You have answered {Object.keys(mcqState).length} out of {displayData.length} questions.
                           </p>
                           <div className="flex gap-3">
                               <button onClick={() => setShowSubmitModal(false)} className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl active:scale-95 transition-all">Cancel</button>
                               <button onClick={handleConfirmSubmit} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 active:scale-95 transition-all">Yes, Submit</button>
                           </div>
                       </div>
                   </div>
               )}

               {/* Question Drawer Overlay */}
               {showQuestionDrawer && (
                   <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex justify-end" onClick={() => setShowQuestionDrawer(false)}>
                        <div className="w-80 bg-white h-full shadow-2xl animate-in slide-in-from-right duration-200 flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="p-4 border-b flex items-center justify-between bg-slate-50">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Grip size={18}/> Question Palette</h3>
                                <button onClick={() => setShowQuestionDrawer(false)} className="p-2 hover:bg-slate-200 rounded-full"><X size={18}/></button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4">
                                <div className="grid grid-cols-5 gap-3">
                                    {displayData.map((_, idx) => {
                                        const isAnswered = mcqState[idx] !== undefined && mcqState[idx] !== null;
                                        const isCurrent = idx === batchIndex;
                                        // "Skipped" logic: Not answered and we have moved past it OR viewed it (simplification: if idx < batchIndex and not answered)
                                        // For now, simpler color coding: Green (Answered), Blue (Current), Gray (Unattempted)

                                        let btnClass = "aspect-square rounded-lg text-xs font-bold flex items-center justify-center transition-all border ";
                                        if (isCurrent) {
                                            btnClass += "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200 scale-110 ring-2 ring-blue-100";
                                        } else if (isAnswered) {
                                            btnClass += "bg-green-100 text-green-700 border-green-200 hover:bg-green-200";
                                        } else {
                                            btnClass += "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100";
                                        }

                                        return (
                                            <button
                                                key={idx}
                                                onClick={() => {
                                                    setBatchIndex(idx);
                                                    setShowQuestionDrawer(false);
                                                }}
                                                className={btnClass}
                                            >
                                                {idx + 1}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="p-4 border-t bg-slate-50 text-xs text-slate-500 space-y-2">
                                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-green-100 border border-green-200"></div> Answered</div>
                                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-blue-600"></div> Current</div>
                                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-slate-50 border border-slate-200"></div> Not Attempted</div>
                            </div>
                        </div>
                   </div>
               )}

               <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                   <div className="flex gap-2">
                       <button onClick={onBack} className="flex items-center gap-2 text-slate-600 font-bold text-sm bg-slate-100 px-3 py-2 rounded-lg hover:bg-slate-200 transition-colors">
                           <ArrowLeft size={16} /> Exit
                       </button>
                       {(content.manualMcqData_HI && content.manualMcqData_HI.length > 0) && (
                           <button 
                               onClick={() => setLanguage(l => l === 'English' ? 'Hindi' : 'English')}
                               className="flex items-center gap-2 text-slate-600 font-bold text-xs bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-200 transition-colors"
                           >
                               <Globe size={14} /> {language === 'English' ? 'English' : 'हिंदी'}
                           </button>
                       )}
                       {!showResults && (
                           <button onClick={handleRecreate} className="flex items-center gap-2 text-purple-600 font-bold text-xs bg-purple-50 border border-purple-100 px-3 py-2 rounded-lg hover:bg-purple-100 transition-colors">
                               Re-create MCQ
                           </button>
                       )}
                   </div>
                   <div className="flex items-center gap-3">
                       {/* Auto Read Toggle */}
                       <button
                           onClick={() => {
                               const newState = !autoReadEnabled;
                               setAutoReadEnabled(newState);
                               if (!newState) window.speechSynthesis.cancel();
                           }}
                           className={`p-2 rounded-lg transition-all ${autoReadEnabled ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}
                       >
                           {autoReadEnabled ? <Volume2 size={18} /> : <Volume2 size={18} className="opacity-50" />}
                       </button>

                       {/* Timer Display - Prominent */}
                       <div className="flex items-center gap-2 bg-slate-900 text-white px-3 py-1.5 rounded-lg font-mono font-bold text-sm shadow-md">
                           <Clock size={14} className="text-green-400 animate-pulse" />
                           {Math.floor(sessionTime / 60)}:{String(sessionTime % 60).padStart(2, '0')}
                       </div>

                       <button
                           onClick={() => setShowQuestionDrawer(true)}
                           className="flex items-center gap-2 text-slate-600 font-bold text-xs bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-200 transition-colors"
                       >
                           <Grip size={16} /> <span className="hidden sm:inline">All Questions</span>
                           <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px] ml-1">
                               {attemptedCount}/{displayData.length}
                           </span>
                       </button>
                   </div>
               </div>
               
               <div className="flex-1 overflow-y-auto p-4 space-y-6 max-w-3xl mx-auto w-full pb-32 mcq-container">
                   {showResults && content.type === 'MCQ_ANALYSIS' && renderAnalysisDashboard()}

                   {currentBatchData.map((q, localIdx) => {
                       const idx = (batchIndex * BATCH_SIZE) + localIdx;
                       const userAnswer = mcqState[idx];
                       const isAnswered = userAnswer !== undefined && userAnswer !== null;
                       
                       const fullQuestionText = `${q.question}. Options are: ${q.options.map((opt, i) => `Option ${i+1}: ${opt}`).join('. ')}`;

                       return (
                           <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
                               <div className="flex justify-between items-start mb-4 gap-3">
                                   <div className="font-bold text-slate-800 flex gap-3 leading-relaxed flex-1">
                                       <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 font-bold mt-0.5">{idx + 1}</span>
                                       <div dangerouslySetInnerHTML={{ __html: renderMathInHtml(q.question) }} className="prose prose-sm max-w-none" />
                                   </div>
                                   <SpeakButton text={fullQuestionText} className="shrink-0" />
                               </div>
                               <div className="space-y-2">
                                   {q.options.map((opt, oIdx) => {
                                       let btnClass = "w-full text-left p-3 rounded-xl border transition-all text-sm font-medium relative overflow-hidden ";
                                       
                                       if (showResults && analysisUnlocked) {
                                           if (oIdx === q.correctAnswer) {
                                               btnClass += "bg-green-100 border-green-300 text-green-800";
                                           } else if (userAnswer === oIdx) {
                                               btnClass += "bg-red-100 border-red-300 text-red-800";
                                           } else {
                                               btnClass += "bg-slate-50 border-slate-100 opacity-60";
                                           }
                                       } 
                                       else if (isAnswered) {
                                            if (userAnswer === oIdx) {
                                                 btnClass += "bg-blue-100 border-blue-300 text-blue-800";
                                            } else {
                                                 btnClass += "bg-slate-50 border-slate-100 opacity-60";
                                            }
                                       } else {
                                           btnClass += "bg-white border-slate-200 hover:bg-slate-50 hover:border-blue-200";
                                       }

                                       return (
                                           <button 
                                               key={oIdx}
                                               disabled={isAnswered || showResults} 
                                               onClick={() => handleOptionSelect(idx, oIdx)}
                                               className={btnClass}
                                           >
                                               <span className="relative z-10 flex justify-between items-center w-full gap-2">
                                                   <div dangerouslySetInnerHTML={{ __html: renderMathInHtml(opt) }} className="flex-1" />
                                                   <div className="flex items-center gap-2 shrink-0">
                                                      {/* Removed Option SpeakButton */}
                                                      {showResults && analysisUnlocked && oIdx === q.correctAnswer && <CheckCircle size={16} className="text-green-600" />}
                                                      {showResults && analysisUnlocked && userAnswer === oIdx && userAnswer !== q.correctAnswer && <XCircle size={16} className="text-red-500" />}
                                                   </div>
                                               </span>
                                           </button>
                                       );
                                   })}
                               </div>
                               
                               {showResults && analysisUnlocked && q.explanation && (
                                   <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-xl animate-in fade-in slide-in-from-top-2">
                                       <div className="flex items-center justify-between mb-1">
                                           <div className="flex items-center gap-2 text-blue-700 font-bold text-xs">
                                               <BookOpen size={14} /> Explanation
                                           </div>
                                           <SpeakButton text={q.explanation} className="p-1 text-blue-400 hover:bg-blue-100" iconSize={14} />
                                       </div>
                                       <div
                                           className="text-slate-600 text-sm leading-relaxed prose prose-sm max-w-none"
                                           dangerouslySetInnerHTML={{ __html: renderMathInHtml(q.explanation) }}
                                       />
                                   </div>
                               )}
                           </div>
                       );
                   })}
               </div>

               <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 flex gap-3 z-[9999] shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                   {batchIndex > 0 && (
                       <button onClick={handlePrevPage} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl flex items-center justify-center gap-2">
                           <ChevronLeft size={20} /> Back
                       </button>
                   )}

                   {/* Logic for Single Question Navigation */}
                   {!showResults && (
                       <>
                           {hasMore ? (
                                <button
                                   onClick={handleNextPage}
                                   className="flex-[2] py-3 bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-100"
                               >
                                   Next <ChevronRight size={20} />
                               </button>
                           ) : (
                               <div className="flex-[2]"></div> // Spacer if no next button on last page
                           )}

                           {/* Submit Button - Always visible if condition met, or on last page */}
                           {(canSubmit || !hasMore) && (
                               <button
                                   onClick={handleSubmitRequest}
                                   disabled={!canSubmit}
                                   className={`flex-[2] py-3 font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg ${canSubmit ? 'bg-green-600 text-white shadow-green-100' : 'bg-slate-200 text-slate-400'}`}
                               >
                                   Submit <Trophy size={20} />
                               </button>
                           )}
                       </>
                   )}

                   {showResults && !hasMore && (
                       <button 
                           onClick={onBack}
                           className="flex-[2] py-3 bg-slate-800 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg"
                       >
                           Finish Review <ArrowLeft size={20} />
                       </button>
                   )}
               </div>
          </div>
      );
  }

  return (
      <div className="h-[70vh] flex flex-col items-center justify-center text-center p-8 bg-slate-50 rounded-2xl m-4 border-2 border-dashed border-slate-200">
          <BookOpen size={64} className="text-slate-300 mb-4" />
          <h2 className="text-2xl font-black text-slate-800 mb-2">No Content</h2>
          <p className="text-slate-600 max-w-xs mx-auto mb-6">
              There is no content available for this lesson.
          </p>
          <button onClick={onBack} className="mt-8 text-slate-400 font-bold hover:text-slate-600">
              Go Back
          </button>
      </div>
  );
};
