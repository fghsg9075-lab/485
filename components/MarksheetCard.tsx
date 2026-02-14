import React, { useState, useEffect } from 'react';
// Sync check
import { MCQResult, User, SystemSettings } from '../types';
import { X, Share2, ChevronLeft, ChevronRight, Download, FileSearch, Grid, CheckCircle, XCircle, Clock, Award, BrainCircuit, Play, StopCircle, BookOpen, Target, Zap, BarChart3, ListChecks, FileText, LayoutTemplate, TrendingUp, Lightbulb, ExternalLink } from 'lucide-react';
import html2canvas from 'html2canvas';
import { generateUltraAnalysis } from '../services/groq';
import { saveUniversalAnalysis, saveUserToLive, saveAiInteraction, getChapterData } from '../firebase';
import ReactMarkdown from 'react-markdown';
import { speakText, stopSpeech, getCategorizedVoices, stripHtml } from '../utils/textToSpeech';
import { CustomConfirm } from './CustomDialogs'; // Import CustomConfirm
import { SpeakButton } from './SpeakButton';
import { renderMathInHtml } from '../utils/mathUtils';

interface Props {
  result: MCQResult;
  user: User;
  settings?: SystemSettings;
  onClose: () => void;
  onViewAnalysis?: (cost: number) => void;
  onPublish?: () => void;
  questions?: any[]; 
  onUpdateUser?: (user: User) => void;
  initialView?: 'ANALYSIS' | 'RECOMMEND';
  onLaunchContent?: (content: any) => void;
}

export const MarksheetCard: React.FC<Props> = ({ result, user, settings, onClose, onViewAnalysis, onPublish, questions, onUpdateUser, initialView, onLaunchContent }) => {
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'OFFICIAL_MARKSHEET' | 'SOLUTION' | 'OMR' | 'PREMIUM_ANALYSIS' | 'RECOMMEND'>('OFFICIAL_MARKSHEET');
  
  // ULTRA ANALYSIS STATE
  const [ultraAnalysisResult, setUltraAnalysisResult] = useState('');
  const [isLoadingUltra, setIsLoadingUltra] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [viewingNote, setViewingNote] = useState<any>(null); // New state for HTML Note Modal
  const [showAnalysisSelection, setShowAnalysisSelection] = useState(false); // Modal for Free vs Premium

  const generateLocalAnalysis = () => {
      // Calculate weak/strong based on topicStats
      const topics = Object.keys(topicStats).map(t => {
          const s = topicStats[t];
          let status = 'AVERAGE';
          if (s.percent >= 80) status = 'STRONG';
          else if (s.percent < 50) status = 'WEAK';

          return {
              name: t,
              status,
              actionPlan: status === 'WEAK' ? 'Focus on basic concepts and practice more questions from this topic.' : 'Good job! Keep revising to maintain speed.',
              studyMode: status === 'WEAK' ? 'DEEP_STUDY' : 'QUICK_REVISION'
          };
      });

      const weakTopics = topics.filter(t => t.status === 'WEAK').map(t => t.name);

      return JSON.stringify({
          motivation: percentage > 80 ? "Excellent Performance! You are on track." : "Keep working hard. You can improve!",
          topics: topics,
          // Removed nextSteps and weakToStrongPath as per previous request
      });
  };
  
  // TTS State
  const [voices, setVoices] = useState<{hindi: SpeechSynthesisVoice[], indianEnglish: SpeechSynthesisVoice[], others: SpeechSynthesisVoice[]}>({hindi: [], indianEnglish: [], others: []});
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speechRate, setSpeechRate] = useState(1.0);
  
  // TTS Playlist State
  const [playlist, setPlaylist] = useState<string[]>([]);
  const [currentTrack, setCurrentTrack] = useState(0);
  const [isPlayingAll, setIsPlayingAll] = useState(false);

  const stopPlaylist = () => {
      setIsPlayingAll(false);
      setCurrentTrack(0);
      stopSpeech();
  };

  useEffect(() => {
    if (isPlayingAll && currentTrack < playlist.length) {
        speakText(
            playlist[currentTrack],
            selectedVoice,
            speechRate,
            'hi-IN',
            undefined, // onStart
            () => { // onEnd
                if (isPlayingAll) {
                    setCurrentTrack(prev => prev + 1);
                }
            }
        ).catch(() => setIsPlayingAll(false));
    } else if (currentTrack >= playlist.length && isPlayingAll) {
        setIsPlayingAll(false);
        setCurrentTrack(0);
    }
  }, [currentTrack, isPlayingAll, playlist, selectedVoice, speechRate]);

  // Stop Playlist on Tab Change
  useEffect(() => {
      stopPlaylist();
  }, [activeTab]);

  // Dialog State
  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({isOpen: false, title: '', message: '', onConfirm: () => {}});

  // RECOMMENDATION STATE
  // const [showRecModal, setShowRecModal] = useState(false); // REMOVED as per user request
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [topicStats, setTopicStats] = useState<Record<string, {total: number, correct: number, percent: number}>>({});

  useEffect(() => {
      if (questions) {
          const stats: Record<string, {total: number, correct: number, percent: number}> = {};
          questions.forEach((q, idx) => {
              const topic = q.topic || 'General';
              if (!stats[topic]) stats[topic] = { total: 0, correct: 0, percent: 0 };
              stats[topic].total++;

              const omr = result.omrData?.find(d => d.qIndex === idx);
              if (omr && omr.selected === q.correctAnswer) {
                  stats[topic].correct++;
              }
          });

          Object.keys(stats).forEach(t => {
              stats[t].percent = Math.round((stats[t].correct / stats[t].total) * 100);
          });
          setTopicStats(stats);
      }
  }, [questions]);

  // Handle Initial View Logic
  useEffect(() => {
      if (initialView === 'RECOMMEND' && questions && questions.length > 0) {
          // Allow state to settle, then open
          setTimeout(() => {
              handleRecommend();
          }, 500);
      }
  }, [initialView, questions]);

  // Auto-Load Recommendations on Tab Change
  useEffect(() => {
      // Only fetch if data is missing. Do NOT open modal automatically.
      if ((activeTab === 'RECOMMEND' || activeTab === 'PREMIUM_ANALYSIS') && questions && questions.length > 0 && recommendations.length === 0) {
          handleRecommend(false); // Pass false to suppress modal
      }
  }, [activeTab, questions]);

  const handleRecommend = async (openModal: boolean = false) => {
      setRecLoading(true);
      // if(openModal) setShowRecModal(true); // REMOVED as per user request

      // Identify weak topics (Percent < 70)
      const weakTopics = Object.keys(topicStats).filter(t => topicStats[t].percent < 70);

      const streamKey = (result.classLevel === '11' || result.classLevel === '12') && user.stream ? `-${user.stream}` : '';
      const key = `nst_content_${user.board || 'CBSE'}_${result.classLevel || '10'}${streamKey}_${result.subjectName}_${result.chapterId}`;

      // 1. Fetch Chapter Content (For Free/Premium Notes)
      let chapterData: any = {};
      try {
          chapterData = await getChapterData(key);
      } catch (e) { console.error(e); }

      // 2. Fetch Universal Notes (Recommended List)
      let universalData: any = {};
      try {
          universalData = await getChapterData('nst_universal_notes');
      } catch (e) { console.error(e); }

      const recs: any[] = [];

      // A) Free Recommendations (From Chapter HTML)
      const freeHtml = chapterData?.freeNotesHtml || chapterData?.schoolFreeNotesHtml;
      const extractedTopics: string[] = [];
      if (freeHtml) {
           try {
               const doc = new DOMParser().parseFromString(freeHtml, 'text/html');
               const headers = doc.querySelectorAll('h1, h2, h3, h4');
               headers.forEach(h => {
                   if(h.textContent && h.textContent.length > 3) extractedTopics.push(h.textContent.trim());
               });
           } catch(e) {}
      }

      // Iterate Weak Topics to find matches for EACH
      weakTopics.forEach(wt => {
          const wtLower = wt.trim().toLowerCase();

          // 1. Check Free Notes HTML Headers
          if (extractedTopics.length > 0) {
              const matchedHeader = extractedTopics.find(et =>
                  et.toLowerCase().includes(wtLower) || wtLower.includes(et.toLowerCase())
              );
              if (matchedHeader) {
                  recs.push({
                       title: matchedHeader,
                       topic: wt, // Map strictly to Weak Topic Name
                       type: 'FREE_NOTES_LINK',
                       isPremium: false,
                       url: 'FREE_CHAPTER_NOTES',
                       access: 'FREE'
                  });
              }
          }

          // 2. Check Universal Notes
          if (universalData && universalData.notesPlaylist) {
              const matches = universalData.notesPlaylist.filter((n: any) =>
                  n.title.toLowerCase().includes(wtLower) ||
                  (n.topic && n.topic.toLowerCase().includes(wtLower)) ||
                  wtLower.includes(n.topic?.toLowerCase() || '')
              );
              recs.push(...matches.map((n: any) => ({
                  ...n,
                  topic: wt, // Map strictly
                  type: 'UNIVERSAL_NOTE',
                  isPremium: n.access === 'PREMIUM' || n.type === 'PDF'
              })));
          }

          // 3. Check Chapter Topic Notes
          if (chapterData && chapterData.topicNotes) {
              const matches = chapterData.topicNotes.filter((n: any) =>
                  (n.topic && n.topic.toLowerCase().trim() === wtLower) ||
                  (n.topic && n.topic.toLowerCase().includes(wtLower)) ||
                  (n.topic && wtLower.includes(n.topic.toLowerCase()))
              );
              recs.push(...matches.map((n: any) => ({
                  ...n,
                  topic: wt, // Map strictly
                  type: 'TOPIC_NOTE',
                  access: n.isPremium ? 'PREMIUM' : 'FREE',
                  isPremium: n.isPremium
              })));
          }
      });

      // Deduplicate by title
      const uniqueRecs = recs.filter((v,i,a)=>a.findIndex(v2=>(v2.title===v.title && v2.topic === v.topic))===i);

      setRecommendations(uniqueRecs);
      setRecLoading(false);
  };

  const ITEMS_PER_PAGE = 50;

  const percentage = Math.round((result.score / result.totalQuestions) * 100);
  
  const omrData = result.omrData || [];
  const hasOMR = omrData.length > 0;
  const totalPages = Math.ceil(omrData.length / ITEMS_PER_PAGE);
  const currentData = omrData.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const devName = settings?.footerText || 'Nadim Anwar'; // Configurable via Admin

  useEffect(() => {
    if (initialView === 'ANALYSIS' || result.ultraAnalysisReport) {
        if (result.ultraAnalysisReport) {
             setUltraAnalysisResult(result.ultraAnalysisReport);
             // AUTO TTS
             if (localStorage.getItem('nst_auto_tts') !== 'false') {
                 setTimeout(() => {
                     const text = getAnalysisTextForSpeech();
                     if (text) toggleSpeech(text);
                 }, 1000);
             }
        }
    }
  }, [initialView, result.ultraAnalysisReport]);

  useEffect(() => {
      getCategorizedVoices().then(v => {
          setVoices(v);
          const preferred = v.hindi[0] || v.indianEnglish[0] || v.others[0];
          if (preferred) setSelectedVoice(preferred);
      });
  }, []);

  const handleDownload = async () => {
      let elementId = 'marksheet-content'; 
      if (activeTab === 'OFFICIAL_MARKSHEET') elementId = 'marksheet-style-1';
      
      const element = document.getElementById(elementId);
      if (!element) return;
      try {
          const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
          const link = document.createElement('a');
          link.download = `Marksheet_${user.name}_${new Date().getTime()}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
      } catch (e) {
          console.error('Download failed', e);
      }
  };

  const handleDownloadAll = async () => {
      setIsDownloadingAll(true);
      setTimeout(async () => {
          const element = document.getElementById('full-analysis-report');
          if (element) {
              try {
                  const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
                  const link = document.createElement('a');
                  link.download = `Full_Analysis_${user.name}_${new Date().getTime()}.png`;
                  link.href = canvas.toDataURL('image/png');
                  link.click();
              } catch (e) {
                  console.error('Full Download Failed', e);
              }
          }
          setIsDownloadingAll(false);
      }, 1000);
  };

  const handleShare = async () => {
      const appLink = settings?.officialAppUrl || "https://play.google.com/store/apps/details?id=com.nsta.app"; 
      const text = `*${settings?.appName || 'IDEAL INSPIRATION CLASSES'} RESULT*\n\nName: ${user.name}\nScore: ${result.score}/${result.totalQuestions}\nAccuracy: ${percentage}%\nCorrect: ${result.correctCount}\nWrong: ${result.wrongCount}\nTime: ${formatTime(result.totalTimeSeconds)}\nDate: ${new Date(result.date).toLocaleDateString()}\n\nदेखिये मेरा NSTA रिजल्ट! आप भी टेस्ट दें...\nDownload App: ${appLink}`;
      if (navigator.share) {
          try { await navigator.share({ title: 'Result', text }); } catch(e) {}
      } else {
          window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      }
  };

  const handleUltraAnalysis = async (skipCost: boolean = false) => {
      if (result.ultraAnalysisReport) {
          setUltraAnalysisResult(result.ultraAnalysisReport);
          return;
      }

      if (!questions || questions.length === 0) {
          return;
      }

      const cost = settings?.mcqAnalysisCostUltra ?? 20;

      if (!skipCost) {
          if (user.credits < cost) {
              alert(`Insufficient Credits! You need ${cost} coins for Analysis Ultra.`);
              return;
          }

          if (!confirm(`Unlock AI Analysis Ultra for ${cost} Coins?\n\nThis will identify your weak topics and suggest a study plan.`)) {
              return;
          }
      }

      setIsLoadingUltra(true);
      
      try {
          const userAnswers: Record<number, number> = {};
          if (result.omrData) {
              result.omrData.forEach(d => {
                  userAnswers[d.qIndex] = d.selected;
              });
          }

          await new Promise(resolve => setTimeout(resolve, 1500));
          const analysisText = generateLocalAnalysis();
          setUltraAnalysisResult(analysisText);

          const updatedResult = { ...result, ultraAnalysisReport: analysisText };
          
          const updatedHistory = (user.mcqHistory || []).map(r => r.id === result.id ? updatedResult : r);
          
          const updatedUser = { 
              ...user, 
              credits: skipCost ? user.credits : user.credits - cost,
              mcqHistory: updatedHistory
          };

          localStorage.setItem('nst_current_user', JSON.stringify(updatedUser));
          await saveUserToLive(updatedUser);
          if (onUpdateUser) onUpdateUser(updatedUser);

          await saveUniversalAnalysis({
              id: `analysis-${Date.now()}`,
              userId: user.id,
              userName: user.name,
              date: new Date().toISOString(),
              subject: result.subjectName,
              chapter: result.chapterTitle,
              score: result.score,
              totalQuestions: result.totalQuestions,
              userPrompt: `Analysis for ${result.totalQuestions} Questions. Score: ${result.score}`, 
              aiResponse: analysisText,
              cost: skipCost ? 0 : cost
          });
          
          await saveAiInteraction({
              id: `ai-ultra-${Date.now()}`,
              userId: user.id,
              userName: user.name,
              type: 'ULTRA_ANALYSIS',
              query: `Ultra Analysis for ${result.chapterTitle}`,
              response: analysisText,
              timestamp: new Date().toISOString()
          });

      } catch (error: any) {
          console.error("Ultra Analysis Error:", error);
          setUltraAnalysisResult(JSON.stringify({ error: "Failed to generate analysis. Please try again or contact support." }));
      } finally {
          setIsLoadingUltra(false);
      }
  };

  const renderOMRRow = (qIndex: number, selected: number, correct: number) => {
      const options = [0, 1, 2, 3];
      return (
          <div key={qIndex} className="flex items-center gap-3 mb-2">
              <span className="w-6 text-[10px] font-bold text-slate-500 text-right">{qIndex + 1}</span>
              <div className="flex gap-1.5">
                  {options.map((opt) => {
                      let bgClass = "bg-white border border-slate-300 text-slate-400";
                      
                      const isSelected = selected === opt;
                      const isCorrect = correct === opt;
                      
                      if (isSelected) {
                          if (isCorrect) bgClass = "bg-green-600 border-green-600 text-white shadow-sm";
                          else bgClass = "bg-red-500 border-red-500 text-white shadow-sm";
                      } else if (isCorrect && selected !== -1) {
                          bgClass = "bg-green-600 border-green-600 text-white opacity-80"; 
                      } else if (isCorrect && selected === -1) {
                          bgClass = "border-green-500 text-green-600 bg-green-50";
                      }

                      return (
                          <div key={opt} className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold transition-all ${bgClass}`}>
                              {String.fromCharCode(65 + opt)}
                          </div>
                      );
                  })}
              </div>
          </div>
      );
  };

  const toggleSpeech = (text: string) => {
      if (isSpeaking) {
          stopSpeech();
          setIsSpeaking(false);
      } else {
          // COIN CHECK
          const COST = 20;
          if (user.credits < COST) {
              alert(`Insufficient Coins! Voice costs ${COST} Coins.`);
              return;
          }
          if (!user.isAutoDeductEnabled) {
              setConfirmConfig({
                  isOpen: true,
                  title: "Listen to Analysis?",
                  message: `This will cost ${COST} Coins.`,
                  onConfirm: () => {
                      if(onUpdateUser) onUpdateUser({...user, credits: user.credits - COST});
                      setConfirmConfig(prev => ({...prev, isOpen: false}));
                      startSpeaking(text);
                  }
              });
              return;
          }
          
          if(onUpdateUser) onUpdateUser({...user, credits: user.credits - COST});
          startSpeaking(text);
      }
  };

  const startSpeaking = (text: string) => {
      speakText(text, selectedVoice, speechRate);
      setIsSpeaking(true);
  };

  const generateQuestionText = (q: any, includeExplanation: boolean, index: number) => {
      let text = `Question ${index + 1}. ${stripHtml(q.question)}. `;

      if (q.options && q.options.length > 0) {
          text += "Options: ";
          q.options.forEach((opt: string, i: number) => {
              text += `${String.fromCharCode(65 + i)}. ${stripHtml(opt)}. `;
          });
      }

      if (includeExplanation && q.explanation) {
          text += `Correct Answer: Option ${String.fromCharCode(65 + q.correctAnswer)}. `;
          text += `Explanation: ${stripHtml(q.explanation)}.`;
      }

      return text;
  };

  const handlePlayAll = (questionsToPlay: any[], includeExplanation: boolean, customPlaylist?: string[]) => {
      if (isPlayingAll) {
          stopPlaylist();
          return;
      }

      const newPlaylist = customPlaylist || questionsToPlay.map((q, i) => generateQuestionText(q, includeExplanation, i));
      setPlaylist(newPlaylist);
      setCurrentTrack(0);
      setIsPlayingAll(true);
  };

  // --- SECTION RENDERERS ---

  // NEW: Recommended Notes Section (Premium Style)
  const renderRecommendationsSection = () => {
      // Group recommendations by Topic
      const groupedRecs: Record<string, any[]> = {};
      recommendations.forEach(rec => {
          const topic = rec.topic || 'General';
          if(!groupedRecs[topic]) groupedRecs[topic] = [];
          groupedRecs[topic].push(rec);
      });

      // Filter for Weak Topics based on topicStats (< 70%)
      const displayTopics = Object.keys(topicStats).filter(t => topicStats[t].percent < 70);

      return (
          <div className="bg-slate-50 min-h-full">
              {/* Branding Header */}
              <div className="bg-white p-6 rounded-b-3xl shadow-sm border-b border-slate-200 mb-6 text-center">
                  {settings?.appLogo && <img src={settings.appLogo} className="w-12 h-12 mx-auto mb-2 object-contain" />}
                  <h2 className="font-black text-slate-800 text-lg uppercase tracking-widest">{settings?.appName || 'INSTITUTE'}</h2>
                  <p className="text-xs font-bold text-slate-400">Personalized Study Plan for <span className="text-slate-900">{user.name}</span></p>
              </div>

              <div className="px-4 space-y-8 pb-20">
                  {displayTopics.length === 0 ? (
                      <div className="text-center py-10 opacity-60">
                          <CheckCircle className="mx-auto mb-2 text-green-500" size={32} />
                          <p className="font-black text-slate-800">No Weak Topics!</p>
                          <p className="text-xs font-bold text-slate-400">Keep up the great work.</p>
                      </div>
                  ) : displayTopics.map((topicName, idx) => {
                      const relevantRecs = groupedRecs[topicName] || [];

                      // Also check case-insensitive match if direct match fails
                      if (relevantRecs.length === 0) {
                          const key = Object.keys(groupedRecs).find(k => k.toLowerCase() === topicName.toLowerCase());
                          if (key) relevantRecs.push(...groupedRecs[key]);
                      }

                      // Find WRONG questions for this topic
                      const topicWrongQs = questions?.filter(q => {
                           const isTopicMatch = (q.topic && q.topic.toLowerCase().trim() === topicName.toLowerCase().trim()) ||
                                                (q.topic && topicName.toLowerCase().includes(q.topic.toLowerCase())) ||
                                                (q.topic && q.topic.toLowerCase().includes(topicName.toLowerCase()));

                           if (!isTopicMatch) return false;

                           // Check if it was answered wrong
                           const omr = result.omrData?.find((d: any) => questions && d.qIndex === questions.indexOf(q));
                           // Strict: Attempted AND Wrong
                           return omr && omr.selected !== -1 && omr.selected !== q.correctAnswer;
                      }) || [];

                      // If no notes AND no wrong questions, skip
                      if (relevantRecs.length === 0 && topicWrongQs.length === 0) return null;

                      const stats = topicStats[topicName];

                      return (
                          <div key={idx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                  <div className="flex items-center gap-2">
                                      <div>
                                          <div className="flex items-center gap-2">
                                              <h3 className="font-black text-slate-800 text-sm uppercase">{topicName}</h3>
                                              <SpeakButton text={`${topicName}. ${stats ? `${stats.total - stats.correct} Wrong, ${stats.correct} Correct` : ''}`} className="p-1 hover:bg-slate-200" iconSize={14} />
                                          </div>
                                          {stats && (
                                              <div className="flex gap-2 mt-1">
                                                  <span className="text-[10px] font-bold text-slate-500">{stats.total} Total</span>
                                                  <span className="text-[10px] font-bold text-red-500">{stats.total - stats.correct} Wrong</span>
                                                  <span className="text-[10px] font-bold text-green-600">{stats.correct} Correct</span>
                                              </div>
                                          )}
                                      </div>
                                  </div>
                                  <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-[10px] font-bold">FOCUS</span>
                              </div>

                              <div className="p-4 space-y-4">
                                  {/* 2. RECOMMENDED NOTES */}
                                  {relevantRecs.length > 0 && (
                                      <div className="space-y-2">
                                          <p className="text-[10px] font-black text-blue-500 uppercase flex items-center gap-1">
                                              <BookOpen size={12} /> Suggested Material
                                          </p>
                                          {relevantRecs.map((rec, rIdx) => (
                                              <div key={rIdx} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-colors">
                                                  <div className="flex items-center gap-3">
                                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${rec.isPremium ? 'bg-purple-100 text-purple-600' : 'bg-orange-100 text-orange-600'}`}>
                                                          {rec.isPremium ? <FileText size={14} /> : <Lightbulb size={14} />}
                                                      </div>
                                                      <div className="flex-1 min-w-0">
                                                          <div className="flex items-center gap-1">
                                                              <p className="font-bold text-slate-700 text-xs line-clamp-1">{rec.title}</p>
                                                              {/* Updated: Read Content if available */}
                                                              <SpeakButton text={`${rec.title}. ${stripHtml(rec.content || rec.html || '')}`} className="p-1 shrink-0" iconSize={12} />
                                                          </div>
                                                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${rec.isPremium ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                                                              {rec.isPremium ? 'PREMIUM PDF' : 'FREE NOTE'}
                                                          </span>
                                                      </div>
                                                  </div>

                                                  <button
                                                      onClick={() => {
                                                          if (rec.isPremium) {
                                                              if (onLaunchContent) {
                                                                  onLaunchContent({
                                                                      id: `REC_PREM_${idx}_${rIdx}`,
                                                                      title: rec.title,
                                                                      type: 'PDF',
                                                                      directResource: { url: rec.url, access: rec.access }
                                                                  });
                                                              } else {
                                                                  window.open(rec.url, '_blank');
                                                              }
                                                          } else {
                                                              if (rec.content) {
                                                                  setViewingNote(rec);
                                                              } else if (onLaunchContent) {
                                                                  onLaunchContent({
                                                                      id: `REC_FREE_${idx}_${rIdx}`,
                                                                      title: rec.title,
                                                                      type: 'PDF',
                                                                      directResource: { url: rec.url, access: rec.access }
                                                                  });
                                                              }
                                                          }
                                                      }}
                                                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold text-white shadow-sm ${rec.isPremium ? 'bg-slate-900 hover:bg-slate-800' : 'bg-blue-600 hover:bg-blue-700'}`}
                                                  >
                                                      {rec.isPremium ? 'View PDF' : 'Read'}
                                                  </button>
                                              </div>
                                          ))}
                                      </div>
                                  )}
                              </div>
                          </div>
                      );
                  })}
              </div>

              {/* Developer Footer */}
              <div className="text-center py-6 text-slate-400 border-t border-slate-200">
                  <p className="text-[10px] font-black uppercase tracking-widest">Developed by {devName}</p>
              </div>
          </div>
      );
  };

  const renderTopicBreakdown = () => {
      const topics = Object.keys(topicStats);
      if (topics.length === 0) return null;

      return (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mb-6">
              <h3 className="font-black text-slate-800 text-lg mb-4 flex items-center gap-2">
                  <BarChart3 size={18} /> Topic Breakdown
              </h3>
              <div className="space-y-4">
                  {topics.map((topic, i) => {
                      const stats = topicStats[topic];
                      const percent = stats.percent;

                      // Color Logic matching the screenshot
                      let colorClass = "bg-red-500";
                      if (percent >= 80) colorClass = "bg-green-500";
                      else if (percent >= 40) colorClass = "bg-yellow-500";

                      return (
                          <div key={i}>
                              <div className="flex justify-between items-end mb-1">
                                  <span className="font-bold text-slate-700 text-xs uppercase">{topic}</span>
                                  <span className={`text-xs font-black ${percent >= 80 ? 'text-green-600' : percent >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                                      {stats.correct}/{stats.total} ({percent}%)
                                  </span>
                              </div>
                              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                      className={`h-full ${colorClass} transition-all duration-1000 ease-out`}
                                      style={{ width: `${percent}%` }}
                                  ></div>
                              </div>
                          </div>
                      );
                  })}
              </div>
          </div>
      );
  };

  const renderOMRSection = () => (
        <>
        {renderTopicBreakdown()}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h3 className="font-black text-slate-800 text-lg mb-4 flex items-center gap-2">
                <Grid size={18} /> OMR Response Sheet
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                {currentData.map((data) => renderOMRRow(data.qIndex, data.selected, data.correct))}
            </div>
            {hasOMR && totalPages > 1 && !isDownloadingAll && (
                <div className="flex justify-center items-center gap-4 mt-4 pt-3 border-t border-slate-100">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 bg-slate-100 rounded-lg disabled:opacity-30"><ChevronLeft size={16}/></button>
                    <span className="text-xs font-bold text-slate-500">{page} / {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 bg-slate-100 rounded-lg disabled:opacity-30"><ChevronRight size={16}/></button>
                </div>
            )}
        </div>
        </>
  );

  const renderSolutionSection = () => (
        <>
        <div className="flex items-center justify-between mb-3 px-2">
            <div className="flex items-center gap-2">
                <FileSearch className="text-blue-600" size={20} />
                <h3 className="font-black text-slate-800 text-lg">Detailed Analysis</h3>
            </div>
            <button
                onClick={() => handlePlayAll(questions || [], true)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-xs transition-colors ${isPlayingAll ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-blue-600 text-white shadow-lg shadow-blue-200 hover:bg-blue-700'}`}
            >
                {isPlayingAll ? <StopCircle size={16} /> : <Play size={16} />}
                {isPlayingAll ? 'Stop Listening' : 'Listen All'}
            </button>
        </div>
        {questions && questions.length > 0 ? (
            <div className="space-y-6">
                {questions.map((q, idx) => {
                    const fullText = generateQuestionText(q, true, idx);
                    const omrEntry = result.omrData?.find(d => d.qIndex === idx);
                    const userSelected = omrEntry ? omrEntry.selected : -1;
                    const correctAnswerIndex = q.correctAnswer;
                    const timeSpent = omrEntry?.timeSpent || 0;
                    const isRushed = timeSpent < 5; // Less than 5s is considered rushed

                    const isCorrect = userSelected === correctAnswerIndex;
                    const isSkipped = userSelected === -1;

                    return (
                        <div key={idx} className={`bg-white rounded-2xl border ${isCorrect ? 'border-green-200' : isSkipped ? 'border-slate-200' : 'border-red-200'} shadow-sm overflow-hidden`}>
                            {/* Question Header */}
                            <div className={`p-4 ${isCorrect ? 'bg-green-50' : isSkipped ? 'bg-slate-50' : 'bg-red-50'} border-b ${isCorrect ? 'border-green-100' : isSkipped ? 'border-slate-100' : 'border-red-100'} flex gap-3`}>
                                <span className={`w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${isCorrect ? 'bg-green-100 text-green-700' : isSkipped ? 'bg-slate-200 text-slate-600' : 'bg-red-100 text-red-600'}`}>
                                    {idx + 1}
                                </span>
                                <div className="flex-1">
                                    <div className="flex justify-between items-start gap-2">
                                        <div
                                            className="text-sm font-bold text-slate-800 leading-snug prose prose-sm max-w-none"
                                            dangerouslySetInnerHTML={{ __html: renderMathInHtml(q.question) }}
                                        />
                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                            <SpeakButton text={fullText} />
                                            {/* Time Badge */}
                                            {omrEntry && (
                                                <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${isRushed ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                                                    <Clock size={10} />
                                                    {timeSpent}s
                                                    {isRushed && <span className="text-[8px] bg-orange-200 px-1 rounded ml-1">⚡</span>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Options List */}
                            {q.options && (
                                <div className="p-4 space-y-2">
                                    {q.options.map((opt: string, optIdx: number) => {
                                        const isSelectedByUser = userSelected === optIdx;
                                        const isTheCorrectAnswer = correctAnswerIndex === optIdx;

                                        let optionClass = "border-slate-100 bg-white text-slate-600";
                                        let icon = null;

                                        if (isTheCorrectAnswer) {
                                            optionClass = "border-green-300 bg-green-50 text-green-800 font-bold";
                                            icon = <CheckCircle size={16} className="text-green-600" />;
                                        } else if (isSelectedByUser) {
                                            optionClass = "border-red-300 bg-red-50 text-red-800 font-bold";
                                            icon = <XCircle size={16} className="text-red-500" />;
                                        }

                                        return (
                                            <div key={optIdx} className={`p-3 rounded-xl border flex items-center gap-3 text-xs transition-colors ${optionClass}`}>
                                                <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] border ${isTheCorrectAnswer ? 'border-green-400 bg-green-100 text-green-700' : isSelectedByUser ? 'border-red-400 bg-red-100 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
                                                    {String.fromCharCode(65 + optIdx)}
                                                </div>
                                                <div className="flex-1 flex items-center justify-between gap-2">
                                                    <div dangerouslySetInnerHTML={{ __html: renderMathInHtml(opt) }} />
                                                </div>
                                                {icon}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Explanation Box */}
                            {(q.explanation) && (
                                <div className="p-4 bg-blue-50 border-t border-blue-100">
                                    <div className="flex justify-between items-center mb-1">
                                        <p className="text-[10px] font-bold text-blue-500 uppercase flex items-center gap-1">
                                            <Lightbulb size={12} /> Explanation
                                        </p>
                                    </div>
                                    <div
                                        className="text-xs text-slate-700 leading-relaxed font-medium prose prose-sm max-w-none"
                                        dangerouslySetInnerHTML={{ __html: renderMathInHtml(q.explanation) }}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        ) : (
            <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-200">
                <p className="text-slate-500 font-bold">No questions found.</p>
            </div>
        )}
        </>
      );

  const renderStatsSection = () => (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-slate-100 rounded-full -translate-y-1/2 translate-x-1/2 opacity-50"></div>
            <div className="flex flex-col items-center text-center relative z-10">
                <h2 className="text-2xl font-black text-slate-800 capitalize mb-1">{user.name}</h2>
                <p className="text-xs font-bold text-slate-400 font-mono tracking-wider mb-6">UID: {user.displayId || user.id}</p>
                
                <div className="relative w-40 h-40 mb-6">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle cx="80" cy="80" r="70" fill="none" stroke="#f1f5f9" strokeWidth="12" />
                        <circle
                            cx="80"
                            cy="80"
                            r="70"
                            fill="none"
                            stroke={percentage >= 80 ? "#22c55e" : percentage >= 50 ? "#3b82f6" : "#ef4444"}
                            strokeWidth="12"
                            strokeLinecap="round"
                            strokeDasharray={`${(percentage / 100) * 440} 440`}
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-4xl font-black text-slate-800">{result.score}</span>
                        <span className="text-sm font-bold text-slate-400">/{result.totalQuestions}</span>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4 w-full">
                    <div className="bg-green-50 p-3 rounded-2xl border border-green-100">
                        <p className="text-xl font-black text-green-700">{result.correctCount}</p>
                        <p className="text-[10px] font-bold text-green-600 uppercase">Correct</p>
                    </div>
                    <div className="bg-red-50 p-3 rounded-2xl border border-red-100">
                        <p className="text-xl font-black text-red-700">{result.wrongCount}</p>
                        <p className="text-[10px] font-bold text-red-600 uppercase">Wrong</p>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-2xl border border-blue-100 relative overflow-hidden">
                        <p className="text-xl font-black text-blue-700">{Math.round((result.totalTimeSeconds || 0) / 60)}m</p>
                        <p className="text-[10px] font-bold text-blue-600 uppercase">Time</p>
                        {(result.averageTimePerQuestion < 5 && result.totalQuestions > 5) && (
                             <div className="absolute top-0 right-0 bg-orange-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-bl-lg animate-pulse">
                                 RUSHED
                             </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
  );

  // Render Analysis Content
  const renderAnalysisContent = () => {
    if (!ultraAnalysisResult) return null;

    let data: any = {};
    let isJson = false;
    try {
        data = JSON.parse(ultraAnalysisResult);
        isJson = true;
    } catch (e) {
        // Not JSON
    }

    if (!isJson) {
        return (
             <div className="prose prose-slate max-w-none prose-p:text-slate-600 prose-headings:font-black prose-headings:text-slate-800 prose-strong:text-indigo-700">
                <ReactMarkdown>{ultraAnalysisResult}</ReactMarkdown>
            </div>
        );
    }

    // Prepare Chart Data
    const topicStats = (data.topics || []).reduce((acc: any, t: any) => {
        if (t.status === 'STRONG') acc.strong++;
        else if (t.status === 'WEAK') acc.weak++;
        else acc.avg++;
        return acc;
    }, { strong: 0, weak: 0, avg: 0 });
    
    const totalTopics = (data.topics || []).length;

    // Professional Box Layout
    // Gather Mixed Playlist (Questions + Notes) for Premium View
    const mixedPlaylist: string[] = [];

    if (questions && data.topics) {
        data.topics.forEach((topic: any) => {
             const topicQs = questions.filter((q: any) =>
                (q.topic && q.topic.toLowerCase().trim() === topic.name.toLowerCase().trim()) ||
                (q.topic && topic.name.toLowerCase().includes(q.topic.toLowerCase())) ||
                (q.topic && q.topic.toLowerCase().includes(topic.name.toLowerCase()))
            );

            // Add Questions Text
            topicQs.forEach((q: any) => {
                const qIndex = questions.indexOf(q);
                mixedPlaylist.push(generateQuestionText(q, true, qIndex)); // Include Explanation in Playlist
            });

            // Add Notes Text
            const topicNotes = recommendations.filter(rec =>
                rec.topic && topic.name &&
                (rec.topic.toLowerCase().trim() === topic.name.toLowerCase().trim() ||
                 rec.topic.toLowerCase().includes(topic.name.toLowerCase()))
            );

            topicNotes.forEach(note => {
                const content = note.content || note.html || note.description;
                if(content) mixedPlaylist.push(`Note for ${topic.name}. ${note.title}. ${stripHtml(content)}`);
            });
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <button
                    onClick={() => handlePlayAll([], false, mixedPlaylist)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-xs transition-colors ${isPlayingAll ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-900 text-white shadow-lg hover:bg-slate-800'}`}
                >
                    {isPlayingAll ? <StopCircle size={16} /> : <Play size={16} />}
                    {isPlayingAll ? 'Stop Listening' : 'Listen All'}
                </button>
            </div>
            
            {/* PERFORMANCE OVERVIEW (From Stats) */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-slate-100 rounded-full -translate-y-1/2 translate-x-1/2 opacity-50"></div>
                <div className="flex flex-col items-center text-center relative z-10">
                    <h2 className="text-2xl font-black text-slate-800 capitalize mb-1">{user.name}</h2>
                    <p className="text-xs font-bold text-slate-400 font-mono tracking-wider mb-6">UID: {user.displayId || user.id}</p>

                    <div className="relative w-40 h-40 mb-6">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="80" cy="80" r="70" fill="none" stroke="#f1f5f9" strokeWidth="12" />
                            <circle
                                cx="80"
                                cy="80"
                                r="70"
                                fill="none"
                                stroke={percentage >= 80 ? "#22c55e" : percentage >= 50 ? "#3b82f6" : "#ef4444"}
                                strokeWidth="12"
                                strokeLinecap="round"
                                strokeDasharray={`${(percentage / 100) * 440} 440`}
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-4xl font-black text-slate-800">{result.score}</span>
                            <span className="text-sm font-bold text-slate-400">/{result.totalQuestions}</span>
                        </div>
                    </div>
                </div>
            </div>


            {/* TOPIC PERFORMANCE DISTRIBUTION GRAPH */}
            {totalTopics > 0 && (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Topic Strength Distribution</h3>

                    {/* Progress Bar */}
                    <div className="h-4 w-full bg-slate-200 rounded-full overflow-hidden flex">
                        {topicStats.strong > 0 && (
                            <div style={{ width: `${(topicStats.strong / totalTopics) * 100}%` }} className="h-full bg-green-500"></div>
                        )}
                        {topicStats.avg > 0 && (
                            <div style={{ width: `${(topicStats.avg / totalTopics) * 100}%` }} className="h-full bg-blue-500"></div>
                        )}
                        {topicStats.weak > 0 && (
                            <div style={{ width: `${(topicStats.weak / totalTopics) * 100}%` }} className="h-full bg-red-500"></div>
                        )}
                    </div>

                    {/* Legend */}
                    <div className="flex justify-between mt-3 text-[10px] font-bold uppercase">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-slate-600">Strong ({topicStats.strong})</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                            <span className="text-slate-600">Average ({topicStats.avg})</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            <span className="text-slate-600">Weak ({topicStats.weak})</span>
                        </div>
                    </div>
                </div>
            )}

            {data.motivation && (
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-4 rounded-xl text-white shadow-lg text-center italic font-medium">
                    "{data.motivation}"
                </div>
            )}

            {data.topics && data.topics.map((topic: any, idx: number) => {
                let borderColor = "border-slate-200";
                let bgColor = "bg-white";
                let titleColor = "text-slate-800";
                
                if (topic.status === 'WEAK') {
                    borderColor = "border-red-500";
                    bgColor = "bg-red-50";
                    titleColor = "text-red-700";
                } else if (topic.status === 'STRONG') {
                    borderColor = "border-green-500";
                    bgColor = "bg-green-50";
                    titleColor = "text-green-700";
                } else {
                    borderColor = "border-blue-500";
                    bgColor = "bg-blue-50";
                    titleColor = "text-blue-700";
                }

                return (
                    <div key={idx} className={`rounded-xl border-2 ${borderColor} ${bgColor} overflow-hidden shadow-sm`}>
                        <div className={`p-4 border-b ${borderColor} flex justify-between items-center`}>
                            <h3 className={`font-black text-lg uppercase tracking-wide ${titleColor}`}>{topic.name}</h3>
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full text-white ${topic.status === 'WEAK' ? 'bg-red-500' : topic.status === 'STRONG' ? 'bg-green-500' : 'bg-blue-500'}`}>
                                {topic.status}
                            </span>
                        </div>

                        <div className="p-4 space-y-4">
                            {/* Action Plan & Study Mode Removed as per "Next 2 Days Plan" request */}

                            {/* TOPIC QUESTIONS SUMMARY (Full Cards) */}
                            {questions && questions.length > 0 && (() => {
                                const topicQs = questions.filter((q: any) =>
                                    (q.topic && q.topic.toLowerCase().trim() === topic.name.toLowerCase().trim()) ||
                                    (q.topic && topic.name.toLowerCase().includes(q.topic.toLowerCase())) ||
                                    (q.topic && q.topic.toLowerCase().includes(topic.name.toLowerCase()))
                                );

                                if (topicQs.length === 0) return null;

                                return (
                                    <div className="mt-4 pt-4 border-t border-dashed border-slate-200">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-1">
                                            <ListChecks size={12} /> Topic Questions
                                        </h4>
                                        <div className="space-y-3">
                                            {topicQs.map((q: any, i: number) => {
                                                const qIndex = questions.indexOf(q);
                                                // Updated: Include Explanation in TTS
                                                const fullText = generateQuestionText(q, true, qIndex);
                                                const omr = result.omrData?.find(d => d.qIndex === qIndex);
                                                const selected = omr ? omr.selected : -1;
                                                const isCorrect = omr && omr.selected === q.correctAnswer;

                                                return (
                                                    <div key={i} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                        <div className="flex justify-between items-start gap-2 mb-2">
                                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isCorrect ? 'bg-green-100 text-green-700' : selected === -1 ? 'bg-slate-200 text-slate-600' : 'bg-red-100 text-red-700'}`}>
                                                                Q{qIndex + 1}
                                                            </span>
                                                            <SpeakButton text={fullText} className="p-1" iconSize={14} />
                                                        </div>
                                                        <div className="text-xs font-bold text-slate-700 mb-2" dangerouslySetInnerHTML={{__html: renderMathInHtml(q.question)}} />
                                                        <div className="space-y-1 mb-3">
                                                            {q.options && q.options.map((opt: string, optIdx: number) => {
                                                                const isSelected = selected === optIdx;
                                                                const isTheCorrect = q.correctAnswer === optIdx;
                                                                let bg = "bg-white border-slate-200 text-slate-500";

                                                                if(isTheCorrect) bg = "bg-green-50 border-green-200 text-green-700 font-bold";
                                                                else if(isSelected) bg = "bg-red-50 border-red-200 text-red-700 font-bold";

                                                                return (
                                                                    <div key={optIdx} className={`px-2 py-1.5 rounded-lg border text-[10px] flex items-center gap-2 ${bg}`}>
                                                                        <span className="w-4 h-4 flex items-center justify-center rounded-full bg-black/5 text-[8px] font-bold">{String.fromCharCode(65+optIdx)}</span>
                                                                        <div dangerouslySetInnerHTML={{__html: renderMathInHtml(opt)}} />
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>

                                                        {/* ADDED: Explanation Section */}
                                                        {q.explanation && (
                                                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mt-2">
                                                                <p className="text-[9px] font-bold text-blue-600 uppercase mb-1 flex items-center gap-1"><Lightbulb size={10} /> Explanation</p>
                                                                <div className="text-[10px] text-slate-600 leading-relaxed" dangerouslySetInnerHTML={{__html: renderMathInHtml(q.explanation)}} />
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* ADDED: Topic Notes Section (HTML Only) */}
                                        {(() => {
                                            // Find notes for this topic
                                            const topicNotes = recommendations.filter(rec =>
                                                rec.topic && topic.name &&
                                                (rec.topic.toLowerCase().trim() === topic.name.toLowerCase().trim() ||
                                                 rec.topic.toLowerCase().includes(topic.name.toLowerCase()))
                                            );

                                            if (topicNotes.length === 0) return null;

                                            return (
                                                <div className="mt-4 pt-4 border-t border-dashed border-slate-200">
                                                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-1">
                                                        <BookOpen size={12} /> Topic Notes
                                                    </h4>
                                                    <div className="space-y-4">
                                                        {topicNotes.map((note, nIdx) => {
                                                            // Only render if it has HTML content or description (not just a PDF link)
                                                            const content = note.content || note.html || note.description;
                                                            if (!content) return null;

                                                            return (
                                                                <div key={nIdx} className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded uppercase">Note</span>
                                                                        <h5 className="text-xs font-bold text-slate-800">{note.title}</h5>
                                                                        <SpeakButton text={`${note.title}. ${stripHtml(content)}`} className="p-1" iconSize={14} />
                                                                    </div>
                                                                    <div
                                                                        className="prose prose-sm max-w-none text-[11px] text-slate-700 leading-relaxed"
                                                                        dangerouslySetInnerHTML={{ __html: content }}
                                                                    />
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                );
            })}


        </div>
    );
  };

  const getAnalysisTextForSpeech = () => {
    try {
        const data = JSON.parse(ultraAnalysisResult);
        let text = "";
        if (data.motivation) text += data.motivation + ". ";
        if (data.topics) {
            data.topics.forEach((t: any) => {
                text += `Topic: ${t.name}. Status: ${t.status}. ${t.actionPlan}. `;
            });
        }
        return text;
    } catch {
        return ultraAnalysisResult.replace(/[#*]/g, '');
    }
  };

  // MARKSHET STYLE 1: Centered Logo
  const renderMarksheetStyle1 = () => (
      <div id="marksheet-style-1" className="bg-white p-8 max-w-2xl mx-auto border-4 border-slate-900 rounded-none relative">
          <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-slate-900"></div>
          <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-slate-900"></div>
          <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-slate-900"></div>
          <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-slate-900"></div>
          
          {/* Header */}
          <div className="text-center mb-8">
              {settings?.appLogo && (
                  <img src={settings.appLogo} alt="Logo" className="w-16 h-16 mx-auto mb-2 object-contain" />
              )}
              <h1 className="text-3xl font-black text-slate-900 uppercase tracking-widest">{settings?.appName || 'INSTITUTE NAME'}</h1>
              <p className="text-lg font-bold text-slate-500">{settings?.aiName || 'AI Assessment Center'}</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1">Generated By {settings?.aiName || 'AI'}</p>
          </div>

          {/* User Info */}
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-8 flex justify-between items-center">
              <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">Candidate Name</p>
                  <p className="text-xl font-black text-slate-800">{user.name}</p>
              </div>
              <div className="text-right">
                  <p className="text-xs font-bold text-slate-400 uppercase">UID / Roll No</p>
                  <p className="text-xl font-black font-mono text-slate-800">{user.displayId || user.id}</p>
              </div>
          </div>

          {/* Score Grid */}
          <div className="mb-8">
              <h3 className="text-center font-bold text-slate-900 uppercase mb-4 border-b pb-2">Performance Summary</h3>
              <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="border p-4 bg-slate-50">
                      <p className="text-xs font-bold text-slate-400 uppercase">Total Questions</p>
                      <p className="text-xl font-black">{result.totalQuestions}</p>
                  </div>
                  <div className="border p-4 bg-slate-50">
                      <p className="text-xs font-bold text-slate-400 uppercase">Attempted</p>
                      <p className="text-xl font-black">{result.correctCount + result.wrongCount}</p>
                  </div>
                  <div className="border p-4 bg-green-50 border-green-200">
                      <p className="text-xs font-bold text-green-600 uppercase">Correct</p>
                      <p className="text-xl font-black text-green-700">{result.correctCount}</p>
                  </div>
                  <div className="border p-4 bg-red-50 border-red-200">
                      <p className="text-xs font-bold text-red-600 uppercase">Wrong</p>
                      <p className="text-xl font-black text-red-700">{result.wrongCount}</p>
                  </div>
              </div>
              <div className="mt-4 bg-slate-900 text-white p-6 text-center rounded-xl">
                  <p className="text-sm font-bold opacity-60 uppercase mb-1">Total Score</p>
                  <p className="text-5xl font-black">{result.score} <span className="text-lg opacity-50">/ {result.totalQuestions}</span></p>
                  <p className="text-sm font-bold mt-2 text-yellow-400">{percentage}% Accuracy</p>
              </div>
          </div>

          {/* Footer */}
          <div className="text-center border-t border-slate-200 pt-4 mt-8">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Developed by {devName}</p>
          </div>
      </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 sm:p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in">

        {/* FREE HTML NOTE MODAL */}
        {viewingNote && (
            <div className="fixed inset-0 z-[300] bg-white flex flex-col animate-in fade-in">
                <header className="bg-white border-b border-slate-200 p-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        {settings?.appLogo && <img src={settings.appLogo} className="w-8 h-8 object-contain" />}
                        <div>
                            <h2 className="font-black text-slate-800 uppercase text-sm">{settings?.appName || 'Free Notes'}</h2>
                            <p className="text-[10px] text-orange-600 font-bold uppercase tracking-widest">Recommended Reading</p>
                        </div>
                    </div>
                    <button onClick={() => setViewingNote(null)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X size={20}/></button>
                </header>
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                    <div className="max-w-3xl mx-auto bg-white p-6 rounded-3xl shadow-sm border border-slate-100 min-h-[50vh]">
                        <div className="flex items-center justify-between mb-6 border-b pb-4">
                             <h1 className="text-2xl font-black text-slate-900">{viewingNote.title}</h1>
                             <SpeakButton text={`${viewingNote.title}. ${stripHtml(viewingNote.content || '')}`} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200" iconSize={20} />
                        </div>
                        <div className="prose prose-slate max-w-none prose-headings:font-black" dangerouslySetInnerHTML={{ __html: (viewingNote.content) }} />
                    </div>
                </div>
                <div className="bg-white border-t border-slate-200 p-4 text-center">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Developed by Nadim Anwar</p>
                </div>
            </div>
        )}

        {/* ANALYSIS SELECTION MODAL */}
        {showAnalysisSelection && (
            <div className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in">
                <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl">
                    <div className="p-6 text-center border-b border-slate-100">
                        <h3 className="text-xl font-black text-slate-800 mb-1">Unlock Analysis</h3>
                        <p className="text-sm text-slate-500">Choose your insight level</p>
                    </div>
                    <div className="p-4 space-y-4">
                        {/* FREE OPTION */}
                        <button
                            onClick={() => {
                                setShowAnalysisSelection(false);
                                setActiveTab('SOLUTION');
                            }}
                        className="w-full bg-white hover:bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl flex items-center justify-between transition-all group"
                        >
                            <div className="text-left">
                            <p className="font-black text-slate-800 text-lg group-hover:scale-105 transition-transform">Free Analysis</p>
                            <p className="text-xs text-slate-500 font-bold mt-1">Review Answers</p>
                            </div>
                        <div className="w-8 h-8 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center font-bold">
                                <ChevronRight size={20} />
                            </div>
                        </button>

                        {/* RECOMMENDED NOTES OPTION */}
                        <button
                            onClick={() => {
                                setShowAnalysisSelection(false);
                                setActiveTab('RECOMMEND');
                            }}
                        className="w-full bg-white hover:bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl flex items-center justify-between transition-all group"
                        >
                            <div className="text-left">
                            <p className="font-black text-slate-800 text-lg group-hover:scale-105 transition-transform">Recommended Notes</p>
                            <p className="text-xs text-slate-500 font-bold mt-1">Weak Topic Notes & PDFs</p>
                            </div>
                        <div className="w-8 h-8 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center font-bold">
                                <ChevronRight size={20} />
                            </div>
                        </button>

                        {/* PREMIUM OPTION */}
                        <button
                            onClick={() => {
                                setShowAnalysisSelection(false);
                                handleUltraAnalysis();
                                setActiveTab('PREMIUM_ANALYSIS');
                            }}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white p-4 rounded-2xl flex items-center justify-between transition-all shadow-xl shadow-slate-200 group relative overflow-hidden"
                        >
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="text-left relative z-10">
                                <p className="font-black text-white text-lg group-hover:scale-105 transition-transform flex items-center gap-2">
                                Premium Analysis
                                </p>
                            <p className="text-xs text-slate-400 font-bold mt-1">Unlock AI Analysis</p>
                            </div>
                            <div className="text-right relative z-10">
                                <span className="block text-xl font-black text-yellow-400">{settings?.mcqAnalysisCostUltra ?? 20} CR</span>
                            </div>
                        </button>
                    </div>
                    <button onClick={() => setShowAnalysisSelection(false)} className="w-full py-4 text-slate-400 font-bold text-sm hover:text-slate-600">Close</button>
                </div>
            </div>
        )}

        <CustomConfirm
            isOpen={confirmConfig.isOpen}
            title={confirmConfig.title}
            message={confirmConfig.message}
            onConfirm={confirmConfig.onConfirm}
            onCancel={() => setConfirmConfig({...confirmConfig, isOpen: false})}
        />
        <div className="w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] bg-white sm:rounded-3xl shadow-2xl flex flex-col relative overflow-hidden">
            
            {/* Header - Sticky */}
            <div className="bg-white text-slate-800 px-4 py-3 border-b border-slate-100 flex justify-between items-center z-10 sticky top-0 shrink-0">
                <div className="flex items-center gap-3">
                    {settings?.appLogo && (
                        <img src={settings.appLogo} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-slate-50 border" />
                    )}
                    <div>
                        <h1 className="text-sm font-black uppercase text-slate-900 tracking-wide">
                            {settings?.appName || 'RESULT'}
                        </h1>
                        <p className="text-[10px] font-bold text-slate-400">Official Marksheet</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Separate Recommend Notes Button */}
                    <button
                        onClick={() => setActiveTab('RECOMMEND')}
                        className="flex items-center gap-2 px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-full text-[10px] font-black hover:bg-yellow-200 transition-colors border border-yellow-200 shadow-sm"
                    >
                        <Lightbulb size={14} />
                        <span>Notes</span>
                    </button>

                    <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* TAB HEADER */}
            <div className="px-4 pt-2 pb-0 bg-white border-b border-slate-100 flex gap-2 overflow-x-auto shrink-0 scrollbar-hide items-center">
                <button
                    onClick={() => setActiveTab('OFFICIAL_MARKSHEET')}
                    className={`px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${activeTab === 'OFFICIAL_MARKSHEET' ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
                >
                    <FileText size={14} className="inline mr-1 mb-0.5" /> Official Marksheet
                </button>
                <button
                    onClick={() => setActiveTab('SOLUTION')}
                    className={`px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${activeTab === 'SOLUTION' ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
                >
                    <FileSearch size={14} className="inline mr-1 mb-0.5" /> Analysis
                </button>
                <button 
                    onClick={() => setActiveTab('OMR')}
                    className={`px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${activeTab === 'OMR' ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
                >
                    <Grid size={14} className="inline mr-1 mb-0.5" /> OMR
                </button>
                <button
                    onClick={() => setActiveTab('PREMIUM_ANALYSIS')}
                    className={`px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${activeTab === 'PREMIUM_ANALYSIS' ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
                >
                    <BrainCircuit size={14} className="inline mr-1 mb-0.5" /> Premium Analysis
                </button>
                <button
                    onClick={() => setActiveTab('RECOMMEND')}
                    className={`px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${activeTab === 'RECOMMEND' ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
                >
                    <Lightbulb size={14} className="inline mr-1 mb-0.5" /> Recommend Notes
                </button>
            </div>

            {/* SCROLLABLE CONTENT */}
            <div id="marksheet-content" className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50">
                
                {/* 1. MARKSHEET SECTION */}
                {activeTab === 'OFFICIAL_MARKSHEET' && renderMarksheetStyle1()}

                {/* 2. SOLUTION SECTION (New Analysis) */}
                {activeTab === 'SOLUTION' && (
                    <div className="animate-in slide-in-from-bottom-4">
                        {renderSolutionSection()}
                    </div>
                )}

                {/* 3. OMR SECTION */}
                {activeTab === 'OMR' && (
                    <div className="animate-in slide-in-from-bottom-4">
                         {renderOMRSection()}
                    </div>
                )}

                {/* 4. PREMIUM ANALYSIS SECTION (Old AI) */}
                {activeTab === 'PREMIUM_ANALYSIS' && (
                    <div className="animate-in slide-in-from-bottom-4">
                        <div className="flex justify-between items-center mb-3 px-2">
                            <div className="flex items-center gap-2">
                                <BrainCircuit className="text-violet-600" size={20} />
                                <h3 className="font-black text-slate-800 text-lg">AI Insight & Roadmap</h3>
                            </div>
                            {ultraAnalysisResult && (
                                <div className="flex items-center gap-2">
                                    {/* VOICE SELECTOR */}
                                    <select 
                                        className="text-[10px] p-1.5 border rounded-lg bg-white max-w-[120px] truncate"
                                        value={selectedVoice?.name || ''}
                                        onChange={(e) => {
                                            const v = [...voices.hindi, ...voices.indianEnglish, ...voices.others].find(voice => voice.name === e.target.value);
                                            if(v) setSelectedVoice(v);
                                        }}
                                    >
                                        <optgroup label="Hindi">
                                            {voices.hindi.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                                        </optgroup>
                                        <optgroup label="Indian English">
                                            {voices.indianEnglish.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                                        </optgroup>
                                        <optgroup label="Others">
                                            {voices.others.slice(0, 5).map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                                        </optgroup>
                                    </select>

                                    {/* SPEED SELECTOR */}
                                    <select 
                                        className="text-[10px] p-1.5 border rounded-lg bg-white font-bold"
                                        value={speechRate}
                                        onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                                    >
                                        <option value={0.75}>0.75x</option>
                                        <option value={1.0}>1x</option>
                                        <option value={1.25}>1.25x</option>
                                        <option value={1.5}>1.5x</option>
                                        <option value={2.0}>2x</option>
                                    </select>

                                    <button 
                                        onClick={() => toggleSpeech(getAnalysisTextForSpeech())} 
                                        className={`p-2 rounded-full transition-colors ${isSpeaking ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-white text-slate-600 shadow-sm border'}`}
                                        title="Listen (20 Coins)"
                                    >
                                        {isSpeaking ? <StopCircle size={18} /> : <Play size={18} />}
                                    </button>
                                </div>
                            )}
                        </div>

                        {!ultraAnalysisResult ? (
                            <div className="bg-gradient-to-br from-violet-600 to-indigo-700 rounded-3xl p-6 text-center text-white shadow-lg">
                                <BrainCircuit size={48} className="mx-auto mb-4 opacity-80" />
                                <h4 className="text-xl font-black mb-2">Unlock Premium AI Analysis</h4>
                                <p className="text-indigo-100 text-sm mb-6 max-w-xs mx-auto">
                                    Get deep insights on your weak areas, personalized study plan, and topic-wise performance graph.
                                </p>
                                <button 
                                    onClick={() => handleUltraAnalysis()} 
                                    disabled={isLoadingUltra}
                                    className="bg-white text-indigo-600 px-6 py-3 rounded-xl font-black shadow-xl hover:scale-105 transition-transform flex items-center justify-center gap-2 mx-auto disabled:opacity-80"
                                >
                                    {isLoadingUltra ? <span className="animate-spin">⏳</span> : <UnlockIcon />}
                                    {isLoadingUltra ? 'Analyzing...' : `Unlock Analysis (${settings?.mcqAnalysisCostUltra ?? 20} Coins)`}
                                </button>
                            </div>
                        ) : (
                            renderAnalysisContent()
                        )}
                    </div>
                )}

                {/* 5. RECOMMENDED NOTES PAGE (Premium Style) */}
                {activeTab === 'RECOMMEND' && (
                    <div className="animate-in slide-in-from-bottom-4 h-full">
                        {renderRecommendationsSection()}
                    </div>
                )}

            </div>

            {/* Footer Actions */}
            <div className="bg-white p-4 border-t border-slate-100 flex gap-2 justify-center z-10 shrink-0 flex-col sm:flex-row">
                {onViewAnalysis && (
                    <button onClick={() => setShowAnalysisSelection(true)} className="flex-1 bg-slate-900 text-white px-4 py-3 rounded-xl font-bold text-xs shadow-sm border border-slate-900 hover:bg-slate-800 flex justify-center gap-2">
                        <BrainCircuit size={16} /> Analysis
                    </button>
                )}
                
                <button onClick={handleShare} className="flex-1 bg-green-600 text-white px-4 py-3 rounded-xl font-bold text-xs shadow hover:bg-green-700 flex justify-center gap-2">
                    <Share2 size={16} /> Share Result
                </button>
                
                <div className="flex gap-2 flex-1">
                     <button onClick={() => handleDownload()} className="bg-slate-100 text-slate-600 px-4 py-3 rounded-xl font-bold text-xs hover:bg-slate-200 flex-1 flex justify-center items-center gap-2">
                        <Download size={16} /> {activeTab === 'OFFICIAL_MARKSHEET' ? 'Download Marksheet' : 'Download Page'}
                    </button>
                    {/* DOWNLOAD ALL BUTTON */}
                    {activeTab !== 'OFFICIAL_MARKSHEET' && (
                         <button onClick={handleDownloadAll} className="bg-slate-900 text-white px-4 py-3 rounded-xl font-bold text-xs hover:bg-slate-800 flex-1 flex justify-center items-center gap-2">
                             <Download size={16} /> Download Full Analysis
                         </button>
                    )}
                </div>
            </div>
             
             {/* STRICT BRANDING FOOTER */}
             <div className="text-center py-2 bg-slate-50 border-t border-slate-100">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Developed by Nadim Anwar</p>
             </div>
        </div>

        {/* RECOMMENDATION MODAL REMOVED AS PER USER REQUEST */}

        {/* HIDDEN PRINT CONTAINER FOR DOWNLOAD ALL */}
        {isDownloadingAll && (
            <div id="full-analysis-report" className="absolute top-0 left-0 w-[800px] bg-white z-[-1] p-8 space-y-8 pointer-events-none">
                {/* Header */}
                <div className="text-center border-b-2 border-slate-900 pb-6 mb-6">
                    <h1 className="text-4xl font-black text-slate-900 uppercase">{settings?.appName || 'INSTITUTE'}</h1>
                    <p className="text-lg font-bold text-slate-500">Comprehensive Performance Report</p>
                    <p className="text-sm font-bold text-slate-400 mt-2">{user.name} | {new Date().toLocaleDateString()}</p>
                </div>
                
                {/* 1. STATS */}
                <div>
                    <h2 className="text-2xl font-black text-slate-800 mb-4 border-l-8 border-blue-600 pl-3 uppercase">1. Performance Summary</h2>
                    {renderStatsSection()}
                </div>

                {/* 2. MISTAKES */}
                {result.wrongQuestions && result.wrongQuestions.length > 0 && (
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 mb-4 border-l-8 border-red-600 pl-3 uppercase">2. Mistakes Review</h2>
                        {renderSolutionSection()}
                    </div>
                )}

                {/* 3. AI ANALYSIS */}
                {ultraAnalysisResult && (
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 mb-4 border-l-8 border-violet-600 pl-3 uppercase">3. AI Deep Analysis</h2>
                        {renderAnalysisContent()}
                    </div>
                )}

                {/* 4. OMR */}
                {hasOMR && (
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 mb-4 border-l-8 border-slate-600 pl-3 uppercase">4. OMR Sheet</h2>
                        {renderOMRSection()}
                    </div>
                )}

                {/* Footer */}
                <div className="text-center border-t border-slate-200 pt-4 mt-8">
                    <p className="text-sm font-black uppercase text-slate-400 tracking-widest">Developed by {devName}</p>
                </div>
            </div>
        )}
    </div>
  );
};

const UnlockIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
);
