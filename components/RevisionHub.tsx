
import React, { useState, useEffect } from 'react';
import { User, StudentTab, MCQResult } from '../types';
import { BrainCircuit, Clock, CheckCircle, TrendingUp, AlertTriangle, ArrowRight, Bot, Sparkles, BookOpen } from 'lucide-react';
import { BannerCarousel } from './BannerCarousel';

interface Props {
    user: User;
    onTabChange: (tab: StudentTab) => void;
}

type TopicStatus = 'WEAK' | 'AVERAGE' | 'STRONG';

interface TopicItem {
    id: string;
    name: string;
    score: number;
    lastAttempt: string;
    status: TopicStatus;
    nextRevision: string; // ISO Date
}

export const RevisionHub: React.FC<Props> = ({ user, onTabChange }) => {
    const [topics, setTopics] = useState<TopicItem[]>([]);
    const [filter, setFilter] = useState<'ALL' | 'WEAK' | 'AVERAGE' | 'STRONG'>('ALL');

    useEffect(() => {
        // Logic to process user.mcqHistory into Topics
        const history = user.mcqHistory || [];
        const topicMap = new Map<string, TopicItem>();

        history.forEach(result => {
            const topicName = result.chapterTitle || 'Unknown Topic';
            const percentage = (result.score / result.totalQuestions) * 100;
            const attemptDate = new Date(result.date);

            // Determine Status
            let status: TopicStatus = 'AVERAGE';
            if (percentage < 50) status = 'WEAK';
            else if (percentage >= 80) status = 'STRONG';

            // Determine Revision Deadline
            let daysToAdd = 3; // Average
            if (status === 'WEAK') daysToAdd = 1;
            if (status === 'STRONG') daysToAdd = 7;

            const nextRev = new Date(attemptDate);
            nextRev.setDate(nextRev.getDate() + daysToAdd);

            // Keep the most relevant/recent status or aggregate?
            // Simple logic: Latest attempt dictates status
            if (!topicMap.has(topicName) || new Date(topicMap.get(topicName)!.lastAttempt) < attemptDate) {
                topicMap.set(topicName, {
                    id: result.chapterId,
                    name: topicName,
                    score: percentage,
                    lastAttempt: result.date,
                    status,
                    nextRevision: nextRev.toISOString()
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

    const filteredTopics = filter === 'ALL' ? topics : topics.filter(t => t.status === filter);

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

            {/* BANNERS (Moved from AI Studio) */}
            <div className="h-40 rounded-2xl overflow-hidden shadow-lg relative border-2 border-slate-900 mb-6">
                <BannerCarousel
                    onBannerClick={(link) => {
                        if (['STORE', 'CUSTOM_PAGE', 'VIDEO', 'PDF', 'MCQ', 'AUDIO', 'AI_CHAT'].includes(link)) {
                            onTabChange(link as any);
                        }
                    }}
                    slides={[
                        {
                            id: 'ai_tutor',
                            image: 'https://img.freepik.com/free-vector/chat-bot-concept-illustration_114360-5522.jpg',
                            title: 'AI Personal Tutor',
                            subtitle: 'Instant Doubt Solving',
                            link: 'AI_CHAT'
                        },
                        {
                            id: 'revision_tips',
                            image: 'https://img.freepik.com/free-vector/exams-concept-illustration_114360-2754.jpg',
                            title: 'Smart Revision',
                            subtitle: 'Focus on Weak Topics',
                            link: ''
                        }
                    ]}
                    interval={4000}
                    autoPlay={true}
                    showDots={true}
                    showArrows={false}
                />
            </div>

            {/* AI TOOLS SHORTCUTS */}
            <div className="grid grid-cols-2 gap-3 mb-6">
                <button
                    onClick={() => onTabChange('AI_CHAT')}
                    className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100 flex flex-col items-center gap-2 hover:shadow-md transition-all group"
                >
                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                        <Bot size={20} />
                    </div>
                    <span className="text-xs font-bold text-slate-700">AI Tutor</span>
                </button>
                <button
                    onClick={() => onTabChange('DEEP_ANALYSIS')}
                    className="bg-white p-4 rounded-2xl shadow-sm border border-purple-100 flex flex-col items-center gap-2 hover:shadow-md transition-all group"
                >
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
                        <Sparkles size={20} />
                    </div>
                    <span className="text-xs font-bold text-slate-700">Deep Analysis</span>
                </button>
            </div>

            {/* REVISION SCHEDULE */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-slate-800 text-lg">Your Revision Plan</h3>
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value as any)}
                        className="bg-white border border-slate-200 text-xs font-bold px-2 py-1 rounded-lg outline-none"
                    >
                        <option value="ALL">All Topics</option>
                        <option value="WEAK">Weak (High Priority)</option>
                        <option value="AVERAGE">Average</option>
                        <option value="STRONG">Strong</option>
                    </select>
                </div>

                {filteredTopics.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                        <BookOpen className="mx-auto text-slate-300 mb-2" size={40} />
                        <p className="text-slate-400 font-bold text-sm">No topics scheduled for revision yet.</p>
                        <p className="text-xs text-slate-400 mt-1">Take some tests to generate data!</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredTopics.map((topic, idx) => {
                            const due = new Date(topic.nextRevision);
                            const now = new Date();
                            const diffHours = (due.getTime() - now.getTime()) / (1000 * 60 * 60);

                            let dueLabel = '';
                            if (diffHours < 0) dueLabel = 'Overdue';
                            else if (diffHours < 24) dueLabel = 'Due Today';
                            else dueLabel = `Due in ${Math.ceil(diffHours/24)} days`;

                            return (
                                <div key={idx} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex items-center justify-between">
                                    <div>
                                        <h4 className="font-bold text-slate-800 text-sm truncate max-w-[200px]">{topic.name}</h4>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded flex items-center gap-1 border ${getStatusColor(topic.status)}`}>
                                                {getStatusIcon(topic.status)} {topic.status}
                                            </span>
                                            <span className={`text-[10px] font-bold ${diffHours < 24 ? 'text-red-500 animate-pulse' : 'text-slate-400'}`}>
                                                <Clock size={10} className="inline mr-1" /> {dueLabel}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onTabChange('MCQ')}
                                        className="bg-indigo-50 text-indigo-600 p-2 rounded-full hover:bg-indigo-600 hover:text-white transition-colors"
                                    >
                                        <ArrowRight size={18} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
