import React, { useState, useEffect } from 'react';
import { User, StudentTab, SystemSettings } from '../types';
import { BrainCircuit, Clock, CheckCircle, TrendingUp, AlertTriangle, ArrowRight, Bot, Sparkles, BookOpen, AlertCircle, X, FileText, CheckSquare, Calendar, Zap, AlertCircle as AlertIcon, ChevronDown, ChevronUp, Loader2, Lock, Unlock } from 'lucide-react';
import { BannerCarousel } from './BannerCarousel';
import { generateCustomNotes } from '../services/groq';
import { saveAiInteraction, getChapterData } from '../firebase';
import { CustomAlert } from './CustomDialogs';

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
                            let status: TopicStatus = 'AVERAGE';
                            let daysToAdd = 3;

                            if (t.status === 'WEAK') {
                                status = 'WEAK';
                                daysToAdd = 2; // < 50% -> 2 days
                                streak = 0; // Reset streak
                            } else if (t.status === 'STRONG') {
                                status = 'STRONG';
                                streak += 1;

                                if (streak >= 2) {
                                    daysToAdd = 30; // 2x > 80% -> 30 days
                                } else {
                                    daysToAdd = 7; // > 80% -> 7 days
                                }
                            } else {
                                status = 'AVERAGE';
                                daysToAdd = 3; // 50-80% -> 3 days
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
                                score: result.score, // Chapter Score
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
                let daysToAdd = 3;

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
                    daysToAdd = 3;
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

    const getStatusColor = (status: TopicStatus) => {
        if (status === 'WEAK') return 'text-red-600 bg-red-50 border-red-200';
        if (status === 'STRONG') return 'text-green-600 bg-green-50 border-green-200';
        return 'text-orange-600 bg-orange-50 border-orange-200';
    };

    const getStatusIcon = (status: TopicStatus) => {
        if (status === 'WEAK') return <AlertTriangle size={14} />;
        if (status === 'STRONG') return <CheckCircle size={14} />;
        return <TrendingUp size={14} />;
    };

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

            {/* TOPIC LIST */}
            <div>
                <h3 className="font-black text-slate-800 text-lg mb-4 flex items-center gap-2">
                    {activeFilter === 'TODAY' ? '🔥 Today\'s Tasks' :
                     activeFilter === 'WEAK' ? '⚠️ Focus Areas' :
                     activeFilter === 'AVERAGE' ? '📈 Improvements' : '💪 Mastered Topics'}
                </h3>

                {(() => {
                    let displayedTopics = topics;
                    const now = new Date();

                    if (activeFilter === 'TODAY') {
                        // STRICT: Only items Due Today or Before
                        displayedTopics = topics.filter(t => new Date(t.nextRevision) <= now);
                    } else {
                        // STRICT: Only Future items of this status (Exclude Today's tasks)
                        displayedTopics = topics.filter(t => t.status === activeFilter && new Date(t.nextRevision) > now);
                    }

                    if (displayedTopics.length === 0) {
                        return (
                            <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                                <BookOpen className="mx-auto text-slate-300 mb-2" size={40} />
                                <p className="text-slate-400 font-bold text-sm">No topics found in this category.</p>
                                <p className="text-xs text-slate-400 mt-1">Keep studying to populate your plan!</p>

                                {activeFilter === 'TODAY' && (
                                    <button
                                        onClick={() => onTabChange('COURSES')}
                                        className="mt-4 bg-indigo-600 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-lg hover:scale-105 transition-transform"
                                    >
                                        Start Learning
                                    </button>
                                )}
                            </div>
                        );
                    }

                    // GROUP BY CHAPTER
                    const groupedTopics: Record<string, { chapterName: string, items: TopicItem[] }> = {};
                    displayedTopics.forEach(t => {
                        const key = t.chapterId;
                        if (!groupedTopics[key]) {
                            groupedTopics[key] = { chapterName: t.chapterName, items: [] };
                        }
                        groupedTopics[key].items.push(t);
                    });

                    return (
                        <div className="space-y-4">
                            {Object.values(groupedTopics).map((group, gIdx) => (
                                <div key={gIdx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                    {/* CHAPTER HEADER */}
                                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                                        <h4 className="font-black text-slate-800 text-sm truncate flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                                            {group.chapterName}
                                        </h4>
                                        <span className="text-[10px] font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-500">
                                            {group.items.length} Sub-Topics
                                        </span>
                                    </div>

                                    <div className="divide-y divide-slate-50">
                                        {group.items.map((topic, idx) => {
                                            const due = new Date(topic.nextRevision);
                                            const now = new Date();
                                            const diffTime = due.getTime() - now.getTime();
                                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                                            let dueLabel = '';
                                            const isDue = diffDays <= 0;

                                            if (isDue) {
                                                dueLabel = 'TODAY';
                                            } else if (diffDays === 1) {
                                                dueLabel = 'Tomorrow';
                                            } else {
                                                dueLabel = `${diffDays} Days`;
                                            }

                                            // OMR BAR STYLE LOGIC
                                            let barColor = 'bg-blue-500';
                                            let barWidth = '60%';
                                            let nextInterval = '3 Days';

                                            if (topic.status === 'WEAK') {
                                                barColor = 'bg-red-500';
                                                barWidth = '30%';
                                                nextInterval = '2 Days';
                                            } else if (topic.status === 'STRONG') {
                                                barColor = 'bg-green-500';
                                                barWidth = '90%';
                                                nextInterval = '7 Days';
                                                // Check for 30 day mastery (rough heuristic from score if streak data unavailable in view)
                                                if (topic.score >= 90) nextInterval = '30 Days';
                                            } else {
                                                barColor = 'bg-orange-500';
                                                barWidth = '60%';
                                                nextInterval = '3 Days';
                                            }

                                            return (
                                                <div key={idx} className="p-4 hover:bg-slate-50 transition-colors">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="flex-1 pr-2">
                                                            <h5 className="font-bold text-slate-700 text-sm">{topic.name}</h5>
                                                            {/* PROGRESS BAR (OMR Style) */}
                                                            <div className="mt-2 w-full max-w-[200px]">
                                                                <div className="flex justify-between items-end mb-1">
                                                                    <span className={`text-[9px] font-black uppercase ${topic.status === 'WEAK' ? 'text-red-500' : topic.status === 'STRONG' ? 'text-green-600' : 'text-orange-500'}`}>
                                                                        {topic.status}
                                                                    </span>
                                                                    <span className="text-[9px] text-slate-400 font-bold">
                                                                        {Math.round(topic.score)}%
                                                                    </span>
                                                                </div>
                                                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-100">
                                                                    <div className={`h-full ${barColor} transition-all duration-1000`} style={{ width: barWidth }}></div>
                                                                </div>
                                                                <div className="mt-1 text-[8px] text-slate-400 font-medium flex items-center gap-1">
                                                                    <TrendingUp size={8} /> Next: {nextInterval}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* TIME BADGE */}
                                                        <div className="flex flex-col items-end gap-1">
                                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isDue ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-100 text-slate-500'}`}>
                                                                {dueLabel}
                                                            </span>
                                                            {!isDue && (
                                                                <span className="text-[9px] text-slate-300 font-bold flex items-center gap-1">
                                                                    <Clock size={10} /> Wait
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* ACTIONS */}
                                                    <div className="mt-3 flex gap-2">
                                                        {isDue ? (
                                                            <>
                                                                <button
                                                                    onClick={() => onNavigateContent ? onNavigateContent('PDF', topic.chapterId, topic.isSubTopic ? topic.name : undefined, topic.subjectName) : null}
                                                                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-blue-700 shadow-sm transition-all flex items-center justify-center gap-2 active:scale-95"
                                                                >
                                                                    <FileText size={14} /> Read
                                                                </button>
                                                                <button
                                                                    onClick={() => onNavigateContent ? onNavigateContent('MCQ', topic.chapterId, topic.isSubTopic ? topic.name : undefined, topic.subjectName) : null}
                                                                    className="flex-1 bg-white text-slate-700 border border-slate-200 py-2 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2 active:scale-95"
                                                                >
                                                                    <CheckSquare size={14} /> MCQ
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                onClick={() => onNavigateContent ? onNavigateContent('PDF', topic.chapterId, topic.isSubTopic ? topic.name : undefined, topic.subjectName) : null}
                                                                className="w-full text-center text-[10px] font-black text-blue-400 hover:text-blue-600 hover:underline py-1 transition-colors flex items-center justify-center gap-1"
                                                            >
                                                                <Unlock size={10} /> Unlock & Revise Early
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
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
