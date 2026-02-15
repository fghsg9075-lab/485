import React, { useState, useEffect } from 'react';
import { User, StudentTab, SystemSettings } from '../types';
import { BrainCircuit, Clock, CheckCircle, TrendingUp, AlertTriangle, ArrowRight, Bot, Sparkles, BookOpen, AlertCircle, X, FileText, CheckSquare, Calendar, Zap, AlertCircle as AlertIcon, ChevronDown, ChevronUp, Loader2, Lock, Unlock, Layers } from 'lucide-react';
import { BannerCarousel } from './BannerCarousel';
import { generateCustomNotes } from '../services/groq';
import { saveAiInteraction, getChapterData } from '../firebase';
import { CustomAlert } from './CustomDialogs';
import { RevisionSession } from './RevisionSession';

interface Props {
    user: User;
    onTabChange: (tab: StudentTab) => void;
    settings?: SystemSettings;
    onNavigateContent?: (type: 'PDF' | 'MCQ', chapterId: string, topicName?: string, subjectName?: string) => void;
}

type TopicStatus = 'WEAK' | 'AVERAGE' | 'STRONG';

interface TopicItem {
    id: string; // Unique ID for list rendering (e.g. chapterId_subTopic)
    chapterId: string;
    chapterName: string; // Name of the parent chapter
    name: string; // Sub-topic name (or Chapter name if no sub-topics)
    score: number; // Inherited or Specific Score
    lastAttempt: string;
    status: TopicStatus;
    nextRevision: string; // ISO Date
    subjectName?: string;
    isSubTopic: boolean;
}

export const RevisionHub: React.FC<Props> = ({ user, onTabChange, settings, onNavigateContent }) => {
    const [topics, setTopics] = useState<TopicItem[]>([]);
    const [activeFilter, setActiveFilter] = useState<'TODAY' | 'WEAK' | 'AVERAGE' | 'STRONG'>('TODAY');

    // Revision Session State
    const [currentSession, setCurrentSession] = useState<{chapterId: string, subTopic: string, chapterTitle: string, subjectName?: string} | null>(null);

    // AI Modal State
    const [showAiModal, setShowAiModal] = useState(false);
    const [aiTopic, setAiTopic] = useState('');
    const [aiGenerating, setAiGenerating] = useState(false);
    const [aiResult, setAiResult] = useState<string | null>(null);

    // Custom Alert State
    const [alertConfig, setAlertConfig] = useState<{isOpen: boolean, type: 'SUCCESS'|'ERROR'|'INFO', title?: string, message: string}>({isOpen: false, type: 'INFO', message: ''});
    const showAlert = (msg: string, type: 'SUCCESS'|'ERROR'|'INFO' = 'INFO', title?: string) => {
        setAlertConfig({ isOpen: true, type, title, message: msg });
    };

    useEffect(() => {
        // Logic to process user.mcqHistory into Sub-Topic Centric Items
        const history = user.mcqHistory || [];
        const topicMap = new Map<string, TopicItem>();

        // Sort history chronologically (oldest first) so newer attempts overwrite older ones in the Map
        const sortedHistory = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Track streaks for 2x > 80% logic (30 days)
        const streakTracker = new Map<string, number>();

        sortedHistory.forEach(result => {
            const attemptDate = new Date(result.date);
            const chapterTitle = result.chapterTitle || 'Unknown Chapter';

            // 1. Try to Parse Ultra Analysis for Sub-Topics
            let hasSubTopics = false;
            if (result.ultraAnalysisReport) {
                try {
                    const parsed = JSON.parse(result.ultraAnalysisReport);
                    if (parsed.topics && Array.isArray(parsed.topics)) {
                        hasSubTopics = true;
                        parsed.topics.forEach((t: any) => {
                            // Determine Streak Key (Unique to SubTopic)
                            const uniqueId = `${result.chapterId}_${t.name.trim()}`;
                            let streak = streakTracker.get(uniqueId) || 0;

                            // Extract Status and Logic
                            // Rules:
                            // < 50% -> 2 days (Weak)
                            // 50-80% -> 3 days (Average)
                            // > 80% -> 7 days (Strong)
                            // 2x > 80% -> 30 days (Super Strong)

                            let status: TopicStatus = 'AVERAGE';
                            let daysToAdd = 3; // Default Average (3 days per user request)
                            let score = t.score || 0; // Assuming parsed topic has score

                            // Re-infer score bucket if exact score missing
                            if (t.status === 'WEAK') score = 40;
                            else if (t.status === 'STRONG') score = 90;
                            else if (t.status === 'AVERAGE') score = 65;

                            if (score < 50) {
                                status = 'WEAK';
                                daysToAdd = 2;
                                streak = 0; // Reset streak
                            } else if (score >= 80) {
                                status = 'STRONG';
                                streak += 1;
                                if (streak >= 2) {
                                    daysToAdd = 30;
                                } else {
                                    daysToAdd = 7;
                                }
                            } else {
                                status = 'AVERAGE';
                                daysToAdd = 3; // Changed from 5 to 3
                                streak = 0; // Reset streak
                            }

                            streakTracker.set(uniqueId, streak);

                            const nextRev = new Date(attemptDate);
                            nextRev.setDate(nextRev.getDate() + daysToAdd);

                            topicMap.set(uniqueId, {
                                id: uniqueId,
                                chapterId: result.chapterId,
                                chapterName: chapterTitle,
                                name: t.name, // Sub-topic Name
                                score: score,
                                lastAttempt: result.date,
                                status,
                                nextRevision: nextRev.toISOString(),
                                subjectName: result.subjectName,
                                isSubTopic: true
                            });
                        });
                    }
                } catch (e) {
                    // Fallback if JSON parse fails
                }
            }

            // 2. Fallback: If no sub-topics found, create a generic Chapter Item
            if (!hasSubTopics) {
                const percentage = (result.score / result.totalQuestions) * 100;
                const uniqueId = result.chapterId;
                let streak = streakTracker.get(uniqueId) || 0;

                let status: TopicStatus = 'AVERAGE';
                let daysToAdd = 3; // Default Average

                if (percentage < 50) {
                    status = 'WEAK';
                    daysToAdd = 2;
                    streak = 0;
                } else if (percentage >= 80) {
                    status = 'STRONG';
                    streak += 1;
                    if (streak >= 2) daysToAdd = 30;
                    else daysToAdd = 7;
                } else {
                    status = 'AVERAGE';
                    daysToAdd = 3; // Changed from 5 to 3
                    streak = 0;
                }

                streakTracker.set(uniqueId, streak);

                const nextRev = new Date(attemptDate);
                nextRev.setDate(nextRev.getDate() + daysToAdd);

                // Use chapterId as key so later attempts overwrite earlier ones
                topicMap.set(uniqueId, {
                    id: uniqueId,
                    chapterId: result.chapterId,
                    chapterName: chapterTitle,
                    name: chapterTitle, // Display Chapter Name
                    score: percentage,
                    lastAttempt: result.date,
                    status,
                    nextRevision: nextRev.toISOString(),
                    subjectName: result.subjectName,
                    isSubTopic: false
                });
            }
        });

        setTopics(Array.from(topicMap.values()).sort((a, b) => new Date(a.nextRevision).getTime() - new Date(b.nextRevision).getTime()));
    }, [user.mcqHistory]);

    const handleAiNotesGeneration = async () => {
        if (!aiTopic.trim()) {
            showAlert("Please enter a topic!", "ERROR");
            return;
        }

        // Check Limits
        const today = new Date().toDateString();
        const usageKey = `nst_ai_usage_${user.id}_${today}`;
        const currentUsage = parseInt(localStorage.getItem(usageKey) || '0');

        let limit = settings?.aiLimits?.free || 0; // Default Free Limit
        if (user.subscriptionLevel === 'BASIC' && user.isPremium) limit = settings?.aiLimits?.basic || 0;
        if (user.subscriptionLevel === 'ULTRA' && user.isPremium) limit = settings?.aiLimits?.ultra || 0;

        if (currentUsage >= limit) {
            showAlert(`Daily Limit Reached! You have used ${currentUsage}/${limit} AI generations today.`, "ERROR", "Limit Exceeded");
            return;
        }

        setAiGenerating(true);
        try {
            const notes = await generateCustomNotes(aiTopic, settings?.aiNotesPrompt || '', settings?.aiModel);
            setAiResult(notes);

            // Increment Usage
            localStorage.setItem(usageKey, (currentUsage + 1).toString());

            // SAVE TO HISTORY
            saveAiInteraction({
                id: `ai-note-${Date.now()}`,
                userId: user.id,
                userName: user.name,
                type: 'AI_NOTES',
                query: aiTopic,
                response: notes,
                timestamp: new Date().toISOString()
            });

            showAlert("Notes Generated Successfully!", "SUCCESS");
        } catch (e) {
            console.error(e);
            showAlert("Failed to generate notes. Please try again.", "ERROR");
        } finally {
            setAiGenerating(false);
        }
    };

    const slides = [
        {
            id: 'ai_tutor',
            image: 'https://img.freepik.com/free-vector/chat-bot-concept-illustration_114360-5522.jpg',
            title: 'AI Personal Tutor',
            subtitle: 'Instant Doubt Solving',
            link: 'AI_CHAT'
        },
        {
            id: 'ultra_pdf',
            image: 'https://img.freepik.com/free-vector/online-document-concept-illustration_114360-5454.jpg',
            title: 'Ultra PDF Notes',
            subtitle: 'Premium Handwritten Notes',
            link: 'PDF'
        },
        {
            id: 'ultra_mcq',
            image: 'https://img.freepik.com/free-vector/forms-concept-illustration_114360-4957.jpg',
            title: 'Ultra MCQ Tests',
            subtitle: 'Advanced Question Bank',
            link: 'MCQ'
        },
        {
            id: 'ultra_video',
            image: 'https://img.freepik.com/free-vector/video-tutorials-concept-illustration_114360-1557.jpg',
            title: 'Ultra Video Classes',
            subtitle: 'Learn with Visuals',
            link: 'VIDEO'
        },
        {
            id: 'ultra_audio',
            image: 'https://img.freepik.com/free-vector/podcast-concept-illustration_114360-1049.jpg',
            title: 'Ultra Audio Learning',
            subtitle: 'Listen & Learn',
            link: 'AUDIO'
        },
        {
            id: 'subscription',
            image: 'https://img.freepik.com/free-vector/subscription-model-concept-illustration_114360-6395.jpg',
            title: 'Premium Subscription',
            subtitle: 'Unlock All Features',
            link: 'STORE'
        },
        {
            id: 'ai_agent',
            image: 'https://img.freepik.com/free-vector/online-assistant-user-help-faq-personal-helper-web-support-worker-virtual-call-center-consultant-messaging-cartoon-character_335657-2544.jpg',
            title: 'AI Agent (Notes)',
            subtitle: 'Get Instant Notes',
            link: 'AI_AGENT'
        },
        {
            id: 'deep_analysis',
            image: 'https://img.freepik.com/free-vector/data-analysis-concept-illustration_114360-8023.jpg',
            title: 'Deep Analysis',
            subtitle: 'Unlock Performance Insights',
            link: 'DEEP_ANALYSIS'
        },
        {
            id: 'ai_history',
            image: 'https://img.freepik.com/free-vector/memory-storage-concept-illustration_114360-1599.jpg',
            title: 'AI History',
            subtitle: 'Review Learning Journey',
            link: 'AI_HISTORY'
        }
    ];

    if (settings?.specialDiscountEvent?.enabled) {
        slides.unshift({
            id: 'discount_offer',
            image: 'https://img.freepik.com/free-vector/sale-banner-with-product-description_1361-1333.jpg',
            title: settings.specialDiscountEvent.eventName || 'Special Offer',
            subtitle: `${settings.specialDiscountEvent.discountPercent}% OFF Limited Time`,
            link: 'STORE'
        });
    }

    return (
        <div className="space-y-6 pb-24 p-4 animate-in fade-in">
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                    <BrainCircuit className="text-indigo-600" /> Revision Hub
                </h2>
                <div className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold">
                    Smart Schedule
                </div>
            </div>

            {/* BANNERS */}
            <div className="h-40 rounded-2xl overflow-hidden shadow-lg relative border-2 border-slate-900 mb-6">
                <BannerCarousel
                    onBannerClick={(link) => {
                        if (['STORE', 'CUSTOM_PAGE', 'VIDEO', 'PDF', 'MCQ', 'AUDIO', 'AI_CHAT', 'DEEP_ANALYSIS', 'AI_HISTORY'].includes(link)) {
                            onTabChange(link as any);
                        } else if (link === 'AI_AGENT') {
                            setShowAiModal(true);
                        }
                    }}
                    slides={slides}
                    interval={4000}
                    autoPlay={true}
                    showDots={true}
                    showArrows={false}
                />
            </div>

            {/* AI TOOLS SHORTCUTS */}
            <div className="grid grid-cols-3 gap-3 mb-6">
                <button
                    onClick={() => onTabChange('AI_CHAT')}
                    className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100 flex flex-col items-center gap-2 hover:shadow-md transition-all group"
                >
                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                        <Bot size={20} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 text-center leading-tight">AI Tutor</span>
                </button>

                <button
                    onClick={() => setShowAiModal(true)}
                    className="bg-white p-4 rounded-2xl shadow-sm border border-purple-100 flex flex-col items-center gap-2 hover:shadow-md transition-all group"
                >
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
                        <BrainCircuit size={20} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 text-center leading-tight">AI Agent</span>
                </button>

                <button
                    onClick={() => onTabChange('DEEP_ANALYSIS')}
                    className="bg-white p-4 rounded-2xl shadow-sm border border-pink-100 flex flex-col items-center gap-2 hover:shadow-md transition-all group"
                >
                    <div className="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center text-pink-600 group-hover:scale-110 transition-transform">
                        <Sparkles size={20} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 text-center leading-tight">Deep Analysis</span>
                </button>
            </div>

            {/* FILTER BUTTONS */}
            <div className="grid grid-cols-4 gap-2 mb-6 bg-slate-100 p-1 rounded-xl">
                {[
                    { id: 'TODAY', label: 'Today', icon: Calendar },
                    { id: 'WEAK', label: 'Weak', icon: AlertIcon },
                    { id: 'AVERAGE', label: 'Average', icon: TrendingUp },
                    { id: 'STRONG', label: 'Strong', icon: CheckCircle }
                ].map(tab => {
                    const isActive = activeFilter === tab.id;
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveFilter(tab.id as any)}
                            className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-[10px] font-bold transition-all ${
                                isActive ? 'bg-white shadow-sm text-blue-600 scale-105' : 'text-slate-500 hover:bg-white/50'
                            }`}
                        >
                            <Icon size={16} className={isActive ? 'mb-1 text-blue-600' : 'mb-1 text-slate-400'} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* TOPIC LIST (GROUPED BY CHAPTER) */}
            <div>
                <h3 className="font-black text-slate-800 text-lg mb-4 flex items-center gap-2">
                    {activeFilter === 'TODAY' ? '🔥 Today\'s Tasks' :
                     activeFilter === 'WEAK' ? '⚠️ Upcoming Weak Areas' :
                     activeFilter === 'AVERAGE' ? '📈 Upcoming Improvements' : '💪 Upcoming Mastered'}
                </h3>

                {(() => {
                    let displayedTopics = topics;
                    const now = new Date();
                    const endOfToday = new Date();
                    endOfToday.setHours(23, 59, 59, 999);

                    if (activeFilter === 'TODAY') {
                        // TODAY: Anything due today or overdue
                        displayedTopics = topics.filter(t => new Date(t.nextRevision) <= endOfToday);
                    } else {
                        // WEAK/AVG/STRONG: Only Future Tasks (Exclude Today)
                        displayedTopics = topics.filter(t => t.status === activeFilter && new Date(t.nextRevision) > endOfToday);
                    }

                    if (displayedTopics.length === 0) {
                        return (
                            <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                                <BookOpen className="mx-auto text-slate-300 mb-2" size={40} />
                                <p className="text-slate-400 font-bold text-sm">No topics found in this category.</p>
                                <p className="text-xs text-slate-400 mt-1">Keep studying to populate your plan!</p>
                            </div>
                        );
                    }

                    // GROUP BY CHAPTER
                    const grouped: Record<string, TopicItem[]> = {};
                    displayedTopics.forEach(t => {
                        const key = t.chapterName;
                        if (!grouped[key]) grouped[key] = [];
                        grouped[key].push(t);
                    });

                    // Sort Groups by Priority (Earliest Due Date first)
                    const sortedGroupKeys = Object.keys(grouped).sort((a, b) => {
                        const minDateA = Math.min(...grouped[a].map(t => new Date(t.nextRevision).getTime()));
                        const minDateB = Math.min(...grouped[b].map(t => new Date(t.nextRevision).getTime()));
                        return minDateA - minDateB;
                    });

                    return (
                        <div className="space-y-6">
                            {sortedGroupKeys.map((chapterName, idx) => {
                                const groupTopics = grouped[chapterName];
                                const subTopicsCount = groupTopics.length;

                                return (
                                    <div key={idx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-bottom-2">
                                        {/* CHAPTER HEADER */}
                                        <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 shadow-sm">
                                                    <Layers size={20} />
                                                </div>
                                                <div>
                                                    <h4 className="font-black text-slate-800 text-sm">{chapterName}</h4>
                                                    <p className="text-[10px] text-slate-500 font-bold">{subTopicsCount} Sub-topics due</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* SUB TOPICS LIST */}
                                        <div className="divide-y divide-slate-50">
                                            {groupTopics.map((topic, tIdx) => {
                                                const due = new Date(topic.nextRevision);
                                                const diffTime = due.getTime() - now.getTime();
                                                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                                                let dueLabel = '';
                                                let dueColor = 'text-slate-400';
                                                const isDue = diffDays <= 0;

                                                if (isDue) {
                                                    dueLabel = 'Due Today';
                                                    dueColor = 'text-red-600 font-black animate-pulse';
                                                } else if (diffDays === 1) {
                                                    dueLabel = 'Tomorrow';
                                                    dueColor = 'text-orange-500 font-bold';
                                                } else {
                                                    dueLabel = `${diffDays} Days`;
                                                    dueColor = 'text-blue-500 font-bold';
                                                }

                                                return (
                                                    <div key={tIdx} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <h5 className="font-bold text-slate-700 text-sm">{topic.name}</h5>
                                                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${topic.status === 'WEAK' ? 'bg-red-100 text-red-700' : topic.status === 'STRONG' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                                    {topic.status}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                                                    <Clock size={10} />
                                                                    <span className={isDue ? 'text-red-500 font-bold' : ''}>{dueLabel}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                                                    <TrendingUp size={10} />
                                                                    <span>Score: {Math.round(topic.score)}%</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {isDue ? (
                                                            <button
                                                                onClick={() => setCurrentSession({
                                                                    chapterId: topic.chapterId,
                                                                    subTopic: topic.name,
                                                                    chapterTitle: topic.chapterName,
                                                                    subjectName: topic.subjectName
                                                                })}
                                                                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2"
                                                            >
                                                                <Zap size={14} /> Revise
                                                            </button>
                                                        ) : (
                                                            <div className="px-4 py-2 bg-slate-100 text-slate-400 text-[10px] font-bold rounded-xl flex items-center gap-2 border border-slate-200">
                                                                <Lock size={12} /> Locked
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}
            </div>

            {/* AI NOTES MODAL */}
            {showAiModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                                    <BrainCircuit size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-800">{settings?.aiName || 'AI Notes'}</h3>
                                    <p className="text-xs text-slate-500">Instant Note Generator</p>
                                </div>
                            </div>
                            <button onClick={() => {setShowAiModal(false); setAiResult(null);}} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
                        </div>

                        {!aiResult ? (
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase block mb-2">What topic do you want notes for?</label>
                                    <textarea
                                        value={aiTopic}
                                        onChange={(e) => setAiTopic(e.target.value)}
                                        placeholder="e.g. Newton's Laws of Motion, Photosynthesis process..."
                                        className="w-full p-4 bg-slate-50 border-none rounded-2xl text-slate-800 focus:ring-2 focus:ring-indigo-100 h-32 resize-none"
                                    />
                                </div>

                                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-start gap-3">
                                    <AlertCircle size={16} className="text-blue-600 mt-0.5 shrink-0" />
                                    <div className="text-xs text-blue-800">
                                        <span className="font-bold block mb-1">Usage Limit</span>
                                        You can generate notes within your daily limit.
                                        {user.isPremium ? (user.subscriptionLevel === 'ULTRA' ? ' (Ultra Plan: High Limit)' : ' (Basic Plan: Medium Limit)') : ' (Free Plan: Low Limit)'}
                                    </div>
                                </div>

                                <button
                                    onClick={handleAiNotesGeneration}
                                    disabled={aiGenerating}
                                    className="w-full py-4 bg-indigo-600 text-white font-black rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    {aiGenerating ? <Sparkles className="animate-spin" /> : <Sparkles />}
                                    {aiGenerating ? "Generating Magic..." : "Generate Notes"}
                                </button>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-hidden flex flex-col">
                                <div className="flex-1 overflow-y-auto bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4 prose prose-sm max-w-none">
                                    <div className="whitespace-pre-wrap">{aiResult}</div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setAiResult(null)}
                                        className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl"
                                    >
                                        New Topic
                                    </button>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(aiResult);
                                            showAlert("Notes Copied!", "SUCCESS");
                                        }}
                                        className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg"
                                    >
                                        Copy Text
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* REVISION SESSION MODAL */}
            {currentSession && (
                <RevisionSession
                    user={user}
                    settings={settings}
                    chapterId={currentSession.chapterId}
                    subTopic={currentSession.subTopic}
                    chapterTitle={currentSession.chapterTitle}
                    subjectName={currentSession.subjectName}
                    onClose={() => setCurrentSession(null)}
                />
            )}

            {/* GLOBAL ALERT MODAL */}
            <CustomAlert
                isOpen={alertConfig.isOpen}
                type={alertConfig.type}
                title={alertConfig.title}
                message={alertConfig.message}
                onClose={() => setAlertConfig(prev => ({...prev, isOpen: false}))}
            />
        </div>
    );
};
