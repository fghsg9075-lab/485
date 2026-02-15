import React, { useState, useEffect } from 'react';
import { User, SystemSettings, MCQItem } from '../types';
import { X, BookOpen, Zap, CheckCircle, AlertCircle, ChevronRight, Check, RotateCcw, Loader2 } from 'lucide-react';
import { getChapterData, saveUserToLive } from '../firebase';
import { storage } from '../utils/storage';

interface Props {
    user: User;
    settings?: SystemSettings;
    chapterId: string;
    subTopic: string;
    chapterTitle: string;
    subjectName?: string;
    onClose: () => void;
    onUpdateUser: (u: User) => void;
}

export const RevisionSession: React.FC<Props> = ({ user, settings, chapterId, subTopic, chapterTitle, subjectName, onClose, onUpdateUser }) => {
    const [activeTab, setActiveTab] = useState<'NOTES' | 'MCQ'>('NOTES');
    const [loading, setLoading] = useState(true);
    const [notesContent, setNotesContent] = useState<string | null>(null);
    const [mcqData, setMcqData] = useState<MCQItem[]>([]);

    // MCQ State
    const [currentQIndex, setCurrentQIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [showExplanation, setShowExplanation] = useState(false);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [score, setScore] = useState(0);

    useEffect(() => {
        const loadContent = async () => {
            setLoading(true);
            try {
                let data = null;
                const board = user.board || 'CBSE';
                const classLevel = user.classLevel || '10';
                const streamKey = (classLevel === '11' || classLevel === '12') && user.stream ? `-${user.stream}` : '';
                const subject = subjectName || 'Unknown';

                // 1. Try Strict Key
                const strictKey = `nst_content_${board}_${classLevel}${streamKey}_${subject}_${chapterId}`;
                data = await storage.getItem(strictKey);

                // 2. If Failed, Search by Chapter ID (Robust Search)
                if (!data) {
                    try {
                        const allKeys = await storage.keys();
                        const matchKey = allKeys.find(k => k.includes(chapterId) && k.startsWith('nst_content_'));
                        if (matchKey) {
                            data = await storage.getItem(matchKey);
                        }
                    } catch(e) { console.warn("Storage Scan failed", e); }
                }

                // 3. Fallback to Firebase
                if (!data) {
                    try {
                        data = await getChapterData(strictKey);
                    } catch(e) { console.error("Firebase fetch failed", e); }
                }

                if (data) {
                    // Filter Notes (Normalize Matching)
                    const normSubTopic = subTopic.toLowerCase().trim();
                    const relevantNote = data.topicNotes?.find((n: any) => n.topic && n.topic.toLowerCase().trim() === normSubTopic);

                    if (relevantNote) {
                        setNotesContent(relevantNote.content);
                    } else {
                        // Loose Search (Contains)
                        const looseNote = data.topicNotes?.find((n: any) => n.topic && n.topic.toLowerCase().includes(normSubTopic));
                        if (looseNote) setNotesContent(looseNote.content);
                    }

                    // Filter MCQs (Normalize Matching)
                    if (data.manualMcqData) {
                        const relevantMcqs = data.manualMcqData.filter((q: any) => q.topic && q.topic.toLowerCase().trim() === normSubTopic);
                        setMcqData(relevantMcqs);
                    }
                }
            } catch (e) {
                console.error("Failed to load revision content", e);
            } finally {
                setLoading(false);
            }
        };

        loadContent();
    }, [chapterId, subTopic, subjectName, user]);

    const handleOptionSelect = (idx: number) => {
        if (selectedOption !== null) return; // Prevent change
        setSelectedOption(idx);

        const correct = mcqData[currentQIndex].correctAnswer;
        const isRight = idx === correct;
        setIsCorrect(isRight);
        setShowExplanation(true);

        if (isRight) setScore(prev => prev + 1);
    };

    const nextQuestion = () => {
        if (currentQIndex < mcqData.length - 1) {
            setCurrentQIndex(prev => prev + 1);
            setSelectedOption(null);
            setShowExplanation(false);
            setIsCorrect(null);
        } else {
            finishSession();
        }
    };

    const finishSession = () => {
        // Calculate Logic
        const total = mcqData.length;
        const finalScore = score; // Already updated
        const percentage = total > 0 ? (finalScore / total) * 100 : 0;

        // Status Logic
        let status = 'AVERAGE';
        if (percentage < 50) status = 'WEAK';
        else if (percentage >= 80) status = 'STRONG';

        // Construct Report for Spaced Repetition Logic in RevisionHub
        const ultraReport = {
            topics: [
                {
                    name: subTopic,
                    status: status
                }
            ]
        };

        // Create History Entry
        const newEntry = {
            testId: `rev-${Date.now()}`,
            chapterId: chapterId,
            chapterTitle: chapterTitle,
            subjectName: subjectName || 'Revision',
            score: finalScore,
            totalQuestions: total,
            date: new Date().toISOString(),
            type: 'REVISION_MCQ',
            ultraAnalysisReport: JSON.stringify(ultraReport)
        };

        // Update User
        const updatedUser = {
            ...user,
            mcqHistory: [...(user.mcqHistory || []), newEntry]
        };

        onUpdateUser(updatedUser);
        saveUserToLive(updatedUser);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in slide-in-from-bottom-10">
            {/* HEADER */}
            <div className="bg-white border-b border-slate-100 p-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
                <div>
                    <h2 className="text-lg font-black text-slate-800 leading-tight">{subTopic}</h2>
                    <p className="text-xs text-slate-500 font-bold">{chapterTitle} • Revision Mode</p>
                </div>
                <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-600 transition-colors">
                    <X size={20} />
                </button>
            </div>

            {/* TABS */}
            <div className="flex p-2 bg-slate-50 gap-2 border-b border-slate-200">
                <button
                    onClick={() => setActiveTab('NOTES')}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'NOTES' ? 'bg-white shadow text-indigo-600 ring-1 ring-indigo-100' : 'text-slate-400 hover:bg-white/50'}`}
                >
                    <BookOpen size={16} /> Study Notes
                </button>
                <button
                    onClick={() => setActiveTab('MCQ')}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'MCQ' ? 'bg-white shadow text-purple-600 ring-1 ring-purple-100' : 'text-slate-400 hover:bg-white/50'}`}
                >
                    <Zap size={16} /> Quick Practice
                </button>
            </div>

            {/* CONTENT AREA */}
            <div className="flex-1 overflow-y-auto bg-slate-50 p-4">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <Loader2 size={32} className="animate-spin mb-2" />
                        <p className="text-xs font-bold">Fetching Revision Data...</p>
                    </div>
                ) : (
                    <>
                        {/* NOTES VIEW */}
                        {activeTab === 'NOTES' && (
                            <div className="max-w-3xl mx-auto">
                                {notesContent ? (
                                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 prose prose-sm prose-slate max-w-none">
                                        <div dangerouslySetInnerHTML={{ __html: notesContent }} />
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 text-center">
                                        <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4 text-slate-400">
                                            <BookOpen size={32} />
                                        </div>
                                        <p className="font-bold text-slate-600">No specific notes found for this topic.</p>
                                        <p className="text-xs mt-1">Try checking the main chapter notes.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* MCQ VIEW */}
                        {activeTab === 'MCQ' && (
                            <div className="max-w-2xl mx-auto h-full flex flex-col">
                                {mcqData.length > 0 ? (
                                    <div className="flex-1 flex flex-col gap-4">
                                        {/* PROGRESS BAR */}
                                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-purple-600 transition-all duration-300"
                                                style={{ width: `${((currentQIndex + 1) / mcqData.length) * 100}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
                                            <span>Question {currentQIndex + 1} / {mcqData.length}</span>
                                            <span>Topic: {subTopic}</span>
                                        </div>

                                        {/* QUESTION CARD */}
                                        <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100 flex-1 flex flex-col">
                                            <h3 className="text-lg font-bold text-slate-800 mb-6 leading-relaxed">
                                                {mcqData[currentQIndex].question}
                                            </h3>

                                            <div className="space-y-3 flex-1">
                                                {mcqData[currentQIndex].options.map((opt, idx) => {
                                                    let stateClass = "border-slate-200 hover:border-purple-300 hover:bg-purple-50 text-slate-600";
                                                    if (selectedOption !== null) {
                                                        if (idx === mcqData[currentQIndex].correctAnswer) {
                                                            stateClass = "bg-green-100 border-green-500 text-green-800 font-bold ring-2 ring-green-200";
                                                        } else if (idx === selectedOption) {
                                                            stateClass = "bg-red-100 border-red-500 text-red-800 font-bold";
                                                        } else {
                                                            stateClass = "opacity-50 border-slate-100";
                                                        }
                                                    } else if (selectedOption === idx) {
                                                         stateClass = "bg-purple-100 border-purple-500 text-purple-800 font-bold";
                                                    }

                                                    return (
                                                        <button
                                                            key={idx}
                                                            onClick={() => handleOptionSelect(idx)}
                                                            disabled={selectedOption !== null}
                                                            className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-3 ${stateClass}`}
                                                        >
                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border ${
                                                                selectedOption !== null && idx === mcqData[currentQIndex].correctAnswer ? 'bg-green-500 border-green-600 text-white' :
                                                                selectedOption === idx ? 'bg-red-500 border-red-600 text-white' :
                                                                'bg-white border-slate-300 text-slate-500'
                                                            }`}>
                                                                {['A','B','C','D'][idx]}
                                                            </div>
                                                            <span className="flex-1 text-sm">{opt}</span>
                                                            {selectedOption !== null && idx === mcqData[currentQIndex].correctAnswer && <CheckCircle size={20} className="text-green-600" />}
                                                            {selectedOption === idx && idx !== mcqData[currentQIndex].correctAnswer && <AlertCircle size={20} className="text-red-600" />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* EXPLANATION & NEXT */}
                                        {showExplanation && (
                                            <div className="animate-in slide-in-from-bottom-4 space-y-4 pb-8">
                                                <div className={`p-4 rounded-xl border-l-4 ${isCorrect ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                                                    <h4 className={`font-bold text-sm mb-1 ${isCorrect ? 'text-green-800' : 'text-red-800'}`}>
                                                        {isCorrect ? 'Correct Answer!' : 'Incorrect'}
                                                    </h4>
                                                    <p className="text-xs text-slate-600">
                                                        {mcqData[currentQIndex].explanation || "No explanation provided."}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={nextQuestion}
                                                    className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl shadow-lg hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center gap-2"
                                                >
                                                    {currentQIndex < mcqData.length - 1 ? 'Next Question' : 'Finish Revision'} <ChevronRight size={18} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 text-center">
                                        <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4 text-slate-400">
                                            <Zap size={32} />
                                        </div>
                                        <p className="font-bold text-slate-600">No quick practice questions found.</p>
                                        <p className="text-xs mt-1">Try taking the full chapter test.</p>
                                        <button
                                            onClick={finishSession}
                                            className="mt-4 px-6 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl"
                                        >
                                            Go Back
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
