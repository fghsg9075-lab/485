
import React, { useState, useEffect } from 'react';
import { Chapter, User, Subject, SystemSettings, MCQResult, PerformanceTag } from '../types';
import { CheckCircle, Lock, ArrowLeft, Crown, PlayCircle, HelpCircle, Trophy, Clock, BrainCircuit, FileText, X } from 'lucide-react';
import { CustomAlert, CustomConfirm } from './CustomDialogs';
import { getChapterData, saveUserToLive, saveUserHistory, savePublicActivity } from '../firebase';
import { generateLocalAnalysis } from '../utils/analysisUtils';
import { LessonView } from './LessonView'; 
import { MarksheetCard } from './MarksheetCard';
import { AiInterstitial } from './AiInterstitial';

// we might need to invoke that or replicate the logic.
// The user wants "Free Practice" and "Premium Test".

interface Props {
  chapter: Chapter;
  subject: Subject;
  user: User;
  board: string;
  classLevel: string;
  stream: string | null;
  onBack: () => void;
  onUpdateUser: (user: User) => void;
  settings?: SystemSettings; // New Prop
  topicFilter?: string; // NEW: Filter by Topic
}

export const McqView: React.FC<Props> = ({ 
  chapter, subject, user, board, classLevel, stream, onBack, onUpdateUser, settings, topicFilter
}) => {
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'SELECTION' | 'PRACTICE' | 'TEST'>('SELECTION');
  const [lessonContent, setLessonContent] = useState<any>(null); // To pass to LessonView
  const [resultData, setResultData] = useState<MCQResult | null>(null);
  const [completedMcqData, setCompletedMcqData] = useState<any[]>([]); // Store used data for analysis
  
  // Custom Dialog State
  const [alertConfig, setAlertConfig] = useState<{isOpen: boolean, message: string, title?: string}>({isOpen: false, message: ''});
  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({isOpen: false, title: '', message: '', onConfirm: () => {}});
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);

  // Interstitial State
  const [showInterstitial, setShowInterstitial] = useState(false);
  const [pendingStart, setPendingStart] = useState<{mode: 'PRACTICE' | 'TEST', data: any} | null>(null);

  // New: Chapter Data for Notes
  const [chapterData, setChapterData] = useState<any>(null);
  const [activeNote, setActiveNote] = useState<any>(null);

  useEffect(() => {
      const fetchChapterContent = async () => {
          try {
              const streamKey = (classLevel === '11' || classLevel === '12') && stream ? `-${stream}` : '';
              const key = `nst_content_${board}_${classLevel}${streamKey}_${subject.name}_${chapter.id}`;
              let data = await getChapterData(key);
              if (!data) {
                  const stored = localStorage.getItem(key);
                  if (stored) data = JSON.parse(stored);
              }
              setChapterData(data || {});
          } catch (e) {
              console.error("Error fetching notes for MCQ view", e);
          }
      };
      fetchChapterContent();
  }, [chapter.id, board, classLevel, stream, subject.name]);

  const handleStart = async (mode: 'PRACTICE' | 'TEST') => {
      // 1. Fetch Data First (To avoid charging for empty chapters)
      setLoading(true);
      
      // STRICT KEY MATCHING WITH ADMIN
      const streamKey = (classLevel === '11' || classLevel === '12') && stream ? `-${stream}` : '';
      const key = `nst_content_${board}_${classLevel}${streamKey}_${subject.name}_${chapter.id}`;
      
      let data = null;
      try {
          // Race Firebase against a 2.5s timeout to prevent hanging on slow/offline networks
          const fetchWithTimeout = (promise: Promise<any>, ms: number) => 
              Promise.race([
                  promise, 
                  new Promise((_, reject) => setTimeout(() => reject("timeout"), ms))
              ]);
          
          data = await fetchWithTimeout(getChapterData(key), 2500);
      } catch (e) {
          console.warn("Firebase fetch timed out or failed, falling back to local storage.");
      }

      if (!data) {
          const stored = localStorage.getItem(key);
          if (stored) data = JSON.parse(stored);
      }

      // Handle Empty Content
      if (!data || !data.manualMcqData || data.manualMcqData.length === 0) {
          // Show "Coming Soon" screen instead of alert
          const content = {
              id: Date.now().toString(),
              title: chapter.title,
              subtitle: 'Coming Soon',
              content: '', 
              type: 'MCQ_SIMPLE',
              isComingSoon: true, // New Flag
              dateCreated: new Date().toISOString(),
              subjectName: subject.name,
              mcqData: null
          };
          setLessonContent(content);
          setViewMode(mode);
          setLoading(false);
          return;
      }

      // 2. Cost Logic (Only if content exists)
      // DYNAMIC COST: Use settings or fallback to 2
      const cost = mode === 'TEST' ? (settings?.mcqTestCost ?? 0) : 0; 
      
      // 3. Access Check
      if (user.role !== 'ADMIN' && cost > 0) {
          const isSubscribed = user.isPremium && user.subscriptionEndDate && new Date(user.subscriptionEndDate) > new Date();
          const hasAccess = isSubscribed; 
          
          if (!hasAccess && user.credits < cost) {
              setAlertConfig({isOpen: true, title: "Low Balance", message: `Insufficient Credits! You need ${cost} coins.`});
              setLoading(false);
              return;
          }

          if (!hasAccess) {
              setConfirmConfig({
                  isOpen: true,
                  title: "Start Premium Test",
                  message: `Start Premium Test for ${cost} Coins?`,
                  onConfirm: () => {
                      const updatedUser = { ...user, credits: user.credits - cost };
                      localStorage.setItem('nst_current_user', JSON.stringify(updatedUser));
                      saveUserToLive(updatedUser);
                      onUpdateUser(updatedUser);
                      setConfirmConfig(prev => ({...prev, isOpen: false}));
                      
                      // Continue logic - we need to refactor to allow continuation after confirm
                      // Since confirm is async here via state, we can't just 'return'.
                      // We need to move the content loading into the confirm callback or handle it differently.
                      // For simplicity, I'll just call handleStart again with a 'force' flag or set state to trigger.
                      // Actually, let's just proceed with loading inside this callback.
                      triggerMcqStart(mode, data);
                  }
              });
              setLoading(false);
              return;
          }
      }
      
      triggerMcqStart(mode, data);
  };

  const triggerMcqStart = (mode: 'PRACTICE' | 'TEST', data: any) => {
    // 1. Process Questions (Filter, Shuffle & Slice based on Tier)
    let processedQuestions = [...(data.manualMcqData || [])];

    // TOPIC FILTER
    if (topicFilter) {
        processedQuestions = processedQuestions.filter((q: any) => q.topic === topicFilter);
        if (processedQuestions.length === 0) {
            setAlertConfig({isOpen: true, title: "No Questions", message: `No questions found for topic: ${topicFilter}`});
            setLoading(false);
            return;
        }
    }
    
    // Shuffle Questions (Fisher-Yates)
    for (let i = processedQuestions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [processedQuestions[i], processedQuestions[j]] = [processedQuestions[j], processedQuestions[i]];
    }

    // Apply Tier Limits (Per Test Limit)
    // Free: 30, Basic: 50, Ultra: All
    let questionLimit = 30;
    if (user.subscriptionLevel === 'BASIC') questionLimit = 50;
    if (user.subscriptionLevel === 'ULTRA') questionLimit = 999999;

    // Admin Override
    if (user.role === 'ADMIN') questionLimit = 999999;

    processedQuestions = processedQuestions.slice(0, questionLimit);

    // Update data object with processed questions
    const processedData = {
        ...data,
        manualMcqData: processedQuestions
    };

    setPendingStart({mode, data: processedData});
    setShowInterstitial(true);
  };

  const handleInterstitialComplete = () => {
    setShowInterstitial(false);
    if (pendingStart) {
        proceedWithStart(pendingStart.mode, pendingStart.data);
        setPendingStart(null);
    }
  };

  const proceedWithStart = (mode: 'PRACTICE' | 'TEST', data: any) => {

      // SHUFFLE & LIMIT QUESTIONS
      const rawMcqData = data.manualMcqData || [];
      const rawMcqDataHi = data.manualMcqData_HI || [];
      const hasHindi = rawMcqDataHi.length === rawMcqData.length && rawMcqData.length > 0;

      // 1. Create Index Array
      const indices = Array.from({ length: rawMcqData.length }, (_, i) => i);

      // 2. Fisher-Yates Shuffle
      for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
      }

      // 3. Determine Limit based on Tier
      let limit = 30; // Default Free

      if (user.role === 'ADMIN') {
          limit = 9999;
      } else if (user.subscriptionTier && user.subscriptionTier !== 'FREE') {
          if (user.subscriptionLevel === 'ULTRA') limit = 9999;
          else limit = 50; // Basic Limit
      }

      // 4. Slice & Select
      const finalIndices = indices.slice(0, limit);
      const finalMcqData = finalIndices.map(i => rawMcqData[i]);
      const finalMcqDataHi = hasHindi ? finalIndices.map(i => rawMcqDataHi[i]) : undefined;

      // Prepare LessonContent object for the existing LessonView component
      const content = {
          id: Date.now().toString(),
          title: chapter.title,
          subtitle: mode === 'TEST' ? 'Premium Test Mode' : 'Free Practice Mode',
          content: '', // Not used for MCQ
          type: 'MCQ_ANALYSIS', // Always allow analysis flow
          dateCreated: new Date().toISOString(),
          subjectName: subject.name,
          mcqData: finalMcqData,
          manualMcqData_HI: finalMcqDataHi
      };
      
      setLessonContent(content);
      setViewMode(mode);
      setLoading(false);
  };

  const handleMCQComplete = (score: number, answers: Record<number, number>, usedData: any[], timeTaken: number, timePerQuestion?: Record<number, number>) => {
      // 1. FILTER & REMAP DATA (Strict Requirement: Only show attempted questions)
      const answeredIndices = Object.keys(answers).map(Number).sort((a,b) => a - b);
      
      // Create the subset of questions
      const submittedQuestions = answeredIndices.map(idx => usedData[idx]);
      
      // Remap answers to the new indices (0, 1, 2...) AND Time Data
      const remappedAnswers: Record<number, number> = {};
      const remappedTime: Record<number, number> = {};

      answeredIndices.forEach((oldIdx, newIdx) => {
          remappedAnswers[newIdx] = answers[oldIdx];
          if (timePerQuestion && timePerQuestion[oldIdx] !== undefined) {
              remappedTime[newIdx] = timePerQuestion[oldIdx];
          }
      });

      // 2. Calculate Analytics
      const attemptsCount = answeredIndices.length; // Should match Object.keys(answers).length
      const averageTime = attemptsCount > 0 ? timeTaken / attemptsCount : 0;
      let performanceTag: PerformanceTag = 'VERY_BAD';
      if (averageTime <= 15) performanceTag = 'EXCELLENT';
      else if (averageTime <= 30) performanceTag = 'GOOD';
      else if (averageTime <= 45) performanceTag = 'BAD';

      // Build OMR Data (Using remapped indices and submittedQuestions)
      const omrData = submittedQuestions.map((q, idx) => ({
          qIndex: idx,
          selected: remappedAnswers[idx] !== undefined ? remappedAnswers[idx] : -1,
          correct: q.correctAnswer,
          timeSpent: remappedTime[idx] || 0 // Store per-question time
      }));

      // Build Wrong Questions List (Strictly Incorrect Attempts)
      const wrongQuestions = submittedQuestions
        .map((q, idx) => {
            const selected = remappedAnswers[idx] !== undefined ? remappedAnswers[idx] : -1;
            // Filter: Must be attempted (not -1) AND wrong
            if (selected !== -1 && selected !== q.correctAnswer) {
                return {
                    question: q.question,
                    qIndex: idx,
                    explanation: q.explanation
                };
            }
            return null;
        })
        .filter((item): item is { question: string; qIndex: number } => item !== null);

      // Performance Label based on marks (Excllent, Good, Average, Bad)
      const scorePct = (score / attemptsCount) * 100;
      let perfLabel = "Bad";
      if (scorePct >= 90) perfLabel = "Excellent";
      else if (scorePct >= 75) perfLabel = "Good";
      else if (scorePct >= 50) perfLabel = "Average";

      // 3. Prepare Result Object
      const result: MCQResult = {
          id: `res-${Date.now()}`,
          userId: user.id,
          chapterId: chapter.id,
          subjectId: subject.id,
          subjectName: subject.name,
          chapterTitle: chapter.title,
          date: new Date().toISOString(),
          totalQuestions: submittedQuestions.length, // Only attempted count
          correctCount: score,
          wrongCount: attemptsCount - score,
          score: score,
          totalTimeSeconds: timeTaken,
          averageTimePerQuestion: averageTime,
          performanceTag: perfLabel as any,
          classLevel: classLevel,
          omrData: omrData,
          wrongQuestions: wrongQuestions,
          questionTimes: Object.values(remappedTime),
          performanceLabel: perfLabel,
          topic: topicFilter // Save topic if filtered
      };

      // 4. Update User Data
      let updatedUser = { ...user };

      // PRIZE LOGIC (SYLLABUS_MCQ)
      if (settings?.prizeRules) {
          const percentage = (score / attemptsCount) * 100;
          const eligibleRules = settings.prizeRules
              .filter(r => r.enabled && r.category === 'SYLLABUS_MCQ')
              .filter(r => attemptsCount >= r.minQuestions && percentage >= r.minPercentage)
              .sort((a, b) => b.minPercentage - a.minPercentage);

          const bestRule = eligibleRules[0];
          if (bestRule) {
              if (bestRule.rewardType === 'COINS') {
                  updatedUser.credits = (updatedUser.credits || 0) + (bestRule.rewardAmount || 0);
                  setAlertConfig({isOpen: true, title: "Reward Unlocked!", message: `🏆 ${bestRule.label}\n\nYou earned ${bestRule.rewardAmount} Coins!`});
              } else if (bestRule.rewardType === 'SUBSCRIPTION') {
                  const duration = bestRule.rewardDurationHours || 24;
                  const endDate = new Date(Date.now() + duration * 60 * 60 * 1000).toISOString();
                  updatedUser = { 
                      ...updatedUser, 
                      subscriptionTier: bestRule.rewardSubTier || 'WEEKLY',
                      subscriptionLevel: bestRule.rewardSubLevel || 'BASIC',
                      subscriptionEndDate: endDate,
                      grantedByAdmin: true,
                      isPremium: true
                  };
                  setAlertConfig({isOpen: true, title: "Reward Unlocked!", message: `🏆 ${bestRule.label}\n\nYou earned free subscription!`});
              }
          }
      }
      
      // 4.1 Topic Strength Tracking
      if (!updatedUser.topicStrength) updatedUser.topicStrength = {};

      // A) Update overall Subject Strength
      const currentStrength = updatedUser.topicStrength[subject.name] || { correct: 0, total: 0 };
      updatedUser.topicStrength[subject.name] = {
          correct: currentStrength.correct + score,
          total: currentStrength.total + attemptsCount
      };

      // B) Update Granular Topic Strength (if topics exist in questions)
      submittedQuestions.forEach((q, idx) => {
          if (q.topic) {
              const topicKey = q.topic.trim();
              const topicStats = updatedUser.topicStrength![topicKey] || { correct: 0, total: 0 };

              const isCorrect = remappedAnswers[idx] === q.correctAnswer;

              updatedUser.topicStrength![topicKey] = {
                  correct: topicStats.correct + (isCorrect ? 1 : 0),
                  total: topicStats.total + 1
              };
          }
      });

      // 4.2 Add to History
      const newHistory = [result, ...(updatedUser.mcqHistory || [])];
      updatedUser.mcqHistory = newHistory;

      // 4.3 Progress Logic
      if (!updatedUser.progress) updatedUser.progress = {};
      const subjectId = subject.id;
      let progress = updatedUser.progress[subjectId] || { currentChapterIndex: 0, totalMCQsSolved: 0 };
      progress.totalMCQsSolved += attemptsCount;

      const threshold = settings?.mcqUnlockThreshold || 100;
      let leveledUp = false;

      if (progress.totalMCQsSolved >= threshold) {
          progress.currentChapterIndex += 1;
          progress.totalMCQsSolved = progress.totalMCQsSolved - threshold;
          leveledUp = true;
      }
      updatedUser.progress[subjectId] = progress;

      // 5. Save & Sync
      onUpdateUser(updatedUser); 
      localStorage.setItem('nst_current_user', JSON.stringify(updatedUser));
      saveUserToLive(updatedUser);
      
      // 6. Save detailed attempt to Legacy Local History & Firebase (Only attempted questions)
      const resultDataToSet = result; // Keep reference
      
      const newHistoryItem = {
          ...lessonContent,
          mcqData: submittedQuestions, // Save only subset
          id: `mcq-history-${Date.now()}`,
          dateCreated: new Date().toISOString(),
          score: score,
          totalQuestions: submittedQuestions.length,
          userAnswers: remappedAnswers, // Save remapped answers
          analytics: result 
      };
      
      const existingHistoryStr = localStorage.getItem('nst_user_history');
      let history = existingHistoryStr ? JSON.parse(existingHistoryStr) : [];
      history.push(newHistoryItem);
      localStorage.setItem('nst_user_history', JSON.stringify(history));

      // Sync to Firebase (with Offline Fallback)
      try {
          if (navigator.onLine) {
              saveUserHistory(user.id, newHistoryItem);
          } else {
              throw new Error("Offline");
          }
      } catch (e) {
          console.log("Offline or Error saving history. Queuing for sync.");
          const pending = JSON.parse(localStorage.getItem('nst_pending_sync_results') || '[]');
          pending.push({ userId: user.id, data: newHistoryItem, type: 'HISTORY' });
          localStorage.setItem('nst_pending_sync_results', JSON.stringify(pending));
      }

      if (leveledUp) {
          setAlertConfig({isOpen: true, title: "Level Up!", message: `🎉 Congratulations! You cleared ${threshold} MCQs.\n\n🔓 Next Chapter Unlocked!`});
      }
      
      // Store data for analysis view (Fallback to usedData if filtered set is empty to ensure AI Analysis has data)
      if (submittedQuestions.length > 0) {
          setCompletedMcqData(submittedQuestions);
      } else {
          setCompletedMcqData(usedData);
      }

      // Show Marksheet and exit MCQ view
      setResultData(resultDataToSet);
      setViewMode('SELECTION');
  };

  const handleViewAnalysis = () => {
      setShowAnalysisModal(true);
  };

  const handleFreeAnalysis = () => {
      const userAnswers = resultData?.omrData?.reduce((acc: any, curr) => {
          acc[curr.qIndex] = curr.selected;
          return acc;
      }, {}) || {};

      setShowAnalysisModal(false);

      const analysisContent = {
          ...lessonContent,
          id: `analysis-${Date.now()}`,
          type: 'MCQ_ANALYSIS',
          mcqData: completedMcqData,
          userAnswers: userAnswers,
          analysisType: 'FREE'
      };
      
      setResultData(null);
      setLessonContent(analysisContent);
      setViewMode('TEST');
  };

  const handlePremiumAnalysis = () => {
      const cost = settings?.mcqAnalysisCostUltra ?? 20;
      
      if (user.credits < cost) {
          setAlertConfig({isOpen: true, title: "Low Balance", message: `Insufficient Credits! You need ${cost} coins.`});
          return;
      }

      setConfirmConfig({
          isOpen: true,
          title: "Unlock Premium Analysis",
          message: `Pay ${cost} Coins to unlock detailed AI Analysis & Premium Notes?`,
          onConfirm: () => {
              // Deduct Credits
              const updatedUser = { ...user, credits: user.credits - cost };
              localStorage.setItem('nst_current_user', JSON.stringify(updatedUser));
              saveUserToLive(updatedUser);
              onUpdateUser(updatedUser);

              // Generate Analysis
              const userAnswers = resultData?.omrData?.reduce((acc: any, curr) => {
                  acc[curr.qIndex] = curr.selected;
                  return acc;
              }, {}) || {};

              const analysisText = generateLocalAnalysis(
                  completedMcqData,
                  userAnswers,
                  resultData?.score || 0,
                  resultData?.totalQuestions || 0,
                  chapter.title,
                  subject.name
              );

              setConfirmConfig(prev => ({...prev, isOpen: false}));
              setShowAnalysisModal(false);

              const analysisContent = {
                  ...lessonContent,
                  id: `analysis-${Date.now()}`,
                  type: 'MCQ_ANALYSIS',
                  mcqData: completedMcqData,
                  userAnswers: userAnswers,
                  analysisType: 'PREMIUM',
                  aiAnalysisText: analysisText
              };
              
              setResultData(null);
              setLessonContent(analysisContent);
              setViewMode('TEST');
          }
      });
  };

  if (viewMode !== 'SELECTION' && lessonContent) {
      return (
          <LessonView 
              content={lessonContent} 
              subject={subject} 
              classLevel={classLevel as any} 
              chapter={chapter} 
              loading={false} 
              onBack={() => setViewMode('SELECTION')} 
              onMCQComplete={handleMCQComplete}
              user={user}
              onUpdateUser={onUpdateUser}
              settings={settings} // Pass settings down
          />
      );
  }

  const handlePublishResult = () => {
      if (!resultData) return;
      const percentage = Math.round((resultData.score / resultData.totalQuestions) * 100);
      const activity = {
          id: resultData.id,
          userId: user.id,
          userName: user.name,
          testName: resultData.chapterTitle,
          score: resultData.score,
          total: resultData.totalQuestions,
          percentage: percentage,
          timestamp: new Date().toISOString()
      };
      savePublicActivity(activity);
      setAlertConfig({isOpen: true, title: "Success", message: "Result published!"});
  };

  return (
    <div className="bg-white min-h-screen pb-20 animate-in fade-in slide-in-from-right-8">
       {resultData && (
           settings?.hiddenFeatures?.includes('f51') ? (
               <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                   <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl">
                       <Trophy className="mx-auto text-yellow-500 mb-4" size={48} />
                       <h2 className="text-2xl font-black text-slate-800 mb-2">Test Completed!</h2>
                       <p className="text-lg font-bold text-slate-600">Score: <span className="text-blue-600">{resultData.score}</span> / {resultData.totalQuestions}</p>
                       <p className="text-sm text-slate-400 mt-2 mb-6">Detailed marksheet is currently disabled.</p>
                       <button
                           onClick={() => setResultData(null)}
                           className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl"
                       >
                           Continue
                       </button>
                   </div>
               </div>
           ) : (
               <MarksheetCard
                   result={resultData}
                   user={user}
                   settings={settings}
                   onClose={() => {
                       setResultData(null);
                       setViewMode('SELECTION');
                   }}
                   onViewAnalysis={handleViewAnalysis}
                   onPublish={handlePublishResult}
                   questions={completedMcqData}
                   onUpdateUser={onUpdateUser}
               />
           )
       )}
       <CustomAlert 
           isOpen={alertConfig.isOpen} 
           title={alertConfig.title} 
           message={alertConfig.message} 
           onClose={() => setAlertConfig({...alertConfig, isOpen: false})} 
       />
       <CustomConfirm
           isOpen={confirmConfig.isOpen}
           title={confirmConfig.title}
           message={confirmConfig.message}
           onConfirm={confirmConfig.onConfirm}
           onCancel={() => setConfirmConfig({...confirmConfig, isOpen: false})}
       />

       {showAnalysisModal && (
           <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
               <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative">
                   <div className="bg-slate-900 p-6 text-center relative overflow-hidden">
                       <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500 rounded-full blur-3xl opacity-20 -mr-10 -mt-10"></div>
                       <Trophy className="mx-auto text-yellow-400 mb-2 relative z-10" size={48} />
                       <h3 className="text-xl font-black text-white relative z-10">Choose Analysis</h3>
                       <button onClick={() => setShowAnalysisModal(false)} className="absolute top-4 right-4 text-white/50 hover:text-white"><ArrowLeft size={20} /></button>
                   </div>

                   <div className="p-6 space-y-4">
                       <button
                           onClick={handleFreeAnalysis}
                           className="w-full p-4 rounded-2xl border-2 border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 transition-all text-left flex items-center gap-4 group"
                       >
                           <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                               <FileText size={24} />
                           </div>
                           <div>
                               <h4 className="font-bold text-slate-800">Free Analysis</h4>
                               <p className="text-xs text-slate-500">Review Answers & Topics</p>
                           </div>
                       </button>

                       <button
                           onClick={handlePremiumAnalysis}
                           className="w-full p-4 rounded-2xl border-2 border-purple-200 bg-purple-50 hover:border-purple-400 hover:bg-purple-100 transition-all text-left flex items-center gap-4 group relative overflow-hidden"
                       >
                           <div className="w-12 h-12 rounded-full bg-purple-200 text-purple-700 flex items-center justify-center group-hover:scale-110 transition-transform z-10">
                               <BrainCircuit size={24} />
                           </div>
                           <div className="z-10">
                               <h4 className="font-bold text-purple-900">Premium Analysis</h4>
                               <p className="text-xs text-purple-600">AI Report + PDF Notes</p>
                           </div>
                           <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-white text-purple-700 px-3 py-1 rounded-full text-xs font-black shadow-sm z-10">
                               {settings?.mcqAnalysisCostUltra ?? 20} CR
                           </div>
                       </button>
                   </div>
               </div>
           </div>
       )}
       {/* HEADER */}
       <div className="sticky top-0 z-20 bg-white border-b border-slate-100 shadow-sm p-4 flex items-center gap-3">
           <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full text-slate-600">
               <ArrowLeft size={20} />
           </button>
           <div className="flex-1">
               <h3 className="font-bold text-slate-800 leading-tight line-clamp-1">
                   {topicFilter ? `${topicFilter} (Topic)` : chapter.title}
               </h3>
               <p className="text-xs text-slate-500">{subject.name} • MCQ Center</p>
           </div>
           
           {/* COMPETITION MODE TOGGLE (OPTIONAL FOR MCQ IF NEEDED) */}
           {/* Assuming McqView doesn't have the toggle yet as per original code, but if user wants it everywhere:
               The original file doesn't have the toggle in McqView. 
               The prompt says "Admin ke paas ek buttons chahiye jish se class 6 to 12 Competition mode ko off kar sake".
               And usually McqView is shared.
               If McqView has separate content for Competition, we should add the toggle here too if logic exists.
               However, McqView code provided earlier does NOT have the toggle logic like PdfView/VideoPlaylistView.
               It seems McqView handles content internally or via props.
               
               Let's verify if McqView has 'syllabusMode' state.
               Reading file shows: const [viewMode, setViewMode] = useState<'SELECTION' | 'PRACTICE' | 'TEST'>('SELECTION');
               It DOES NOT have syllabusMode state. 
               So no change needed here for the toggle button visibility, as it doesn't exist.
           */}
           <div className="flex items-center gap-1 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
               <Crown size={14} className="text-blue-600" />
               <span className="font-black text-blue-800 text-xs">{user.credits} CR</span>
           </div>
       </div>

       <div className="p-6 space-y-4">
           {/* FREE PRACTICE */}
           <button 
               onClick={() => handleStart('PRACTICE')}
               disabled={loading}
               className="w-full p-6 rounded-3xl border-2 border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 transition-all group text-left relative overflow-hidden"
           >
               <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                   <HelpCircle size={80} className="text-blue-600" />
               </div>
               <div className="relative z-10">
                   <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mb-4">
                       <CheckCircle size={24} />
                   </div>
                   <h4 className="text-xl font-black text-slate-800 mb-1">Free Practice</h4>
                   <p className="text-sm text-slate-500 mb-4">Practice questions with instant feedback. No timer.</p>
                   <span className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-lg shadow-blue-200">START NOW</span>
               </div>
           </button>

           {/* PREMIUM TEST */}
           <button 
               onClick={() => handleStart('TEST')}
               disabled={loading}
               className="w-full p-6 rounded-3xl border-2 border-slate-200 bg-white hover:border-purple-300 hover:bg-purple-50 transition-all group text-left relative overflow-hidden"
           >
               <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                   <Trophy size={80} className="text-purple-600" />
               </div>
               <div className="relative z-10">
                   <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mb-4">
                       <PlayCircle size={24} />
                   </div>
                   <h4 className="text-xl font-black text-slate-800 mb-1">Premium Test</h4>
                   <p className="text-sm text-slate-500 mb-4">Full test mode with timer and professional marksheet.</p>
                   <div className="flex items-center gap-2">
                       <span className="bg-purple-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-lg shadow-purple-200">START TEST</span>
                       {settings?.mcqTestCost && settings.mcqTestCost > 0 && (
                           <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-1 rounded-full">{settings.mcqTestCost} CR</span>
                       )}
                   </div>
               </div>
           </button>
           
           {loading && <div className="text-center py-4 text-slate-500 font-bold animate-pulse">Loading Questions...</div>}

           {/* REVISION NOTES SECTION (NEW) */}
           {chapterData?.topicNotes && chapterData.topicNotes.length > 0 && (
               <div className="pt-4 border-t border-slate-100">
                   <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2 px-2">
                       <FileText size={18} className="text-orange-600"/>
                       {topicFilter ? `Notes for "${topicFilter}"` : 'Revision Notes'}
                   </h4>
                   <div className="space-y-3">
                       {chapterData.topicNotes
                           .filter((n: any) => {
                               if (!topicFilter || chapterData.showAll) return true;
                               const normalize = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                               const normTopic = normalize(n.topic || 'General');
                               const normFilter = normalize(topicFilter);
                               return normTopic === normFilter || normTopic.includes(normFilter) || normFilter.includes(normTopic);
                           })
                           .map((note: any, idx: number) => (
                           <button
                               key={idx}
                               onClick={() => setActiveNote(note)}
                               className="w-full text-left p-4 rounded-2xl bg-orange-50 border border-orange-100 hover:border-orange-300 transition-all flex items-center justify-between group shadow-sm"
                           >
                               <div>
                                   <h5 className="font-bold text-slate-800 text-sm line-clamp-1">{note.title}</h5>
                                   <div className="flex gap-2 mt-1">
                                       <span className="text-[10px] text-orange-600 font-bold uppercase bg-white px-2 py-0.5 rounded border border-orange-100">{note.topic}</span>
                                       {note.isPremium && <span className="text-[10px] text-purple-600 font-bold uppercase flex items-center gap-1"><Lock size={10} /> Premium</span>}
                                   </div>
                               </div>
                               <div className="bg-white p-2 rounded-full text-orange-500 shadow-sm group-hover:bg-orange-500 group-hover:text-white transition-colors">
                                   <ArrowLeft size={16} className="rotate-180" />
                               </div>
                           </button>
                       ))}
                       {chapterData.topicNotes.filter((n: any) => {
                               if (!topicFilter || chapterData.showAll) return true;
                               const normalize = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                               const normTopic = normalize(n.topic || 'General');
                               const normFilter = normalize(topicFilter);
                               return normTopic === normFilter || normTopic.includes(normFilter) || normFilter.includes(normTopic);
                       }).length === 0 && topicFilter && !chapterData.showAll && (
                           <div className="p-4 bg-slate-50 rounded-xl text-center text-slate-400 text-xs italic">
                               No specific notes found for "{topicFilter}". <br/>
                               <button onClick={() => setChapterData({...chapterData, showAll: true})} className="text-blue-500 font-bold underline mt-1">View All Notes</button>
                           </div>
                       )}
                   </div>
               </div>
           )}
       </div>

       {/* NOTE MODAL */}
       {activeNote && (
           <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
               <div className="bg-white w-full max-w-2xl max-h-[80vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl relative">
                   <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                       <h3 className="font-black text-slate-800 line-clamp-1">{activeNote.title}</h3>
                       <button onClick={() => setActiveNote(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
                   </div>
                   <div className="flex-1 overflow-y-auto p-6 prose prose-sm max-w-none">
                       {activeNote.content ? (
                           <div dangerouslySetInnerHTML={{ __html: activeNote.content }} />
                       ) : (
                           <p className="text-center text-slate-400 italic">No content available for preview.</p>
                       )}
                   </div>
                   {activeNote.isPremium && !user.isPremium && (
                       <div className="p-4 bg-purple-50 text-center text-xs font-bold text-purple-700 border-t border-purple-100 flex justify-center gap-2 items-center">
                           <Lock size={12} /> Premium Note Preview
                       </div>
                   )}
               </div>
           </div>
       )}

       {/* HISTORY & DASHBOARD */}
       <div className="px-6 pb-6 space-y-4">
           {user.mcqHistory && user.mcqHistory.filter(h => h.chapterId === chapter.id).length > 0 && (
               <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                   <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                       <Clock size={16} /> History & Unlocked
                   </h4>
                   <div className="space-y-2">
                       {user.mcqHistory.filter(h => h.chapterId === chapter.id).map((attempt, idx) => (
                           <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                               <div>
                                   <div className="flex items-center gap-2">
                                       <span className={`text-xs font-bold px-2 py-0.5 rounded ${attempt.score/attempt.totalQuestions >= 0.8 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                           {Math.round((attempt.score/attempt.totalQuestions)*100)}%
                                       </span>
                                       <span className="text-xs text-slate-500">{new Date(attempt.date).toLocaleDateString()}</span>
                                   </div>
                                   {attempt.ultraAnalysisReport && (
                                       <span className="text-[10px] text-purple-600 font-bold flex items-center gap-1 mt-1">
                                           <BrainCircuit size={10} /> AI Analysis Unlocked
                                       </span>
                                   )}
                               </div>
                               <button 
                                   onClick={() => {
                                       setResultData(attempt);
                                       // Try to recover questions from local history for context if needed
                                       try {
                                           const historyStr = localStorage.getItem('nst_user_history');
                                           if (historyStr) {
                                               const history = JSON.parse(historyStr);
                                               const match = history.find((h: any) => h.analytics && h.analytics.id === attempt.id);
                                               if (match && match.mcqData) {
                                                   setCompletedMcqData(match.mcqData);
                                               } else {
                                                   setCompletedMcqData([]); 
                                               }
                                           }
                                       } catch (e) {}
                                   }}
                                   className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100"
                               >
                                   View
                               </button>
                           </div>
                       ))}
                   </div>
               </div>
           )}
       </div>
       
       {/* AI INTERSTITIAL */}
       {showInterstitial && (
           <AiInterstitial 
               user={user}
               onComplete={handleInterstitialComplete}
               customImage={pendingStart?.data?.chapterAiImage || settings?.aiLoadingImage}
           />
       )}
    </div>
  );
};
