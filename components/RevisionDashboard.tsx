import React from 'react';
import { User, RevisionItem, SystemSettings } from '../types';
import { Calendar, CheckCircle, Clock, BookOpen, ArrowRight, BrainCircuit, AlertCircle } from 'lucide-react';

interface Props {
    user: User;
    settings?: SystemSettings;
    onTopicSelect: (topic: string) => void;
}

export const RevisionDashboard: React.FC<Props> = ({ user, settings, onTopicSelect }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const schedule = user.revisionSchedule || [];

    const todayItems = schedule.filter(item => {
        const d = new Date(item.nextRevisionDate);
        d.setHours(0, 0, 0, 0);
        return d.getTime() <= today.getTime();
    });

    const upcomingItems = schedule.filter(item => {
        const d = new Date(item.nextRevisionDate);
        d.setHours(0, 0, 0, 0);
        return d.getTime() > today.getTime();
    }).sort((a, b) => new Date(a.nextRevisionDate).getTime() - new Date(b.nextRevisionDate).getTime());

    const getCategoryColor = (cat: string) => {
        if (cat === 'WEAK') return 'text-red-600 bg-red-100 border-red-200';
        if (cat === 'AVERAGE') return 'text-orange-600 bg-orange-100 border-orange-200';
        return 'text-green-600 bg-green-100 border-green-200';
    };

    return (
        <div className="pb-24 p-4 space-y-6 animate-in fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-800">Revision Center</h2>
                    <p className="text-sm text-slate-500">Master your weak topics.</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                    <BrainCircuit size={24} />
                </div>
            </div>

            {/* TODAY'S GOALS */}
            <div>
                <h3 className="text-lg font-black text-slate-800 mb-3 flex items-center gap-2">
                    <Calendar size={20} className="text-blue-600" /> Today's Goals
                    {todayItems.length > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{todayItems.length}</span>}
                </h3>

                {todayItems.length === 0 ? (
                    <div className="bg-green-50 p-6 rounded-2xl border border-green-100 text-center">
                        <CheckCircle size={32} className="mx-auto text-green-500 mb-2" />
                        <p className="font-bold text-green-800">All Caught Up!</p>
                        <p className="text-xs text-green-600">No revisions due for today.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {todayItems.map((item, idx) => (
                            <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-blue-300 transition-all">
                                <div>
                                    <h4 className="font-bold text-slate-800 mb-1">{item.topic}</h4>
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${getCategoryColor(item.category)}`}>
                                        {item.category}
                                    </span>
                                </div>
                                <button
                                    onClick={() => onTopicSelect(item.topic)}
                                    className="bg-blue-600 text-white p-2 rounded-xl shadow-lg shadow-blue-200 active:scale-95 transition-transform"
                                >
                                    <ArrowRight size={20} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* UPCOMING */}
            {upcomingItems.length > 0 && (
                <div>
                    <h3 className="text-lg font-black text-slate-800 mb-3 flex items-center gap-2">
                        <Clock size={20} className="text-slate-400" /> Upcoming
                    </h3>
                    <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
                        {upcomingItems.map((item, idx) => (
                            <div key={idx} className="p-4 flex items-center justify-between">
                                <div>
                                    <h4 className="font-bold text-slate-700 text-sm">{item.topic}</h4>
                                    <p className="text-xs text-slate-400">Due: {new Date(item.nextRevisionDate).toLocaleDateString()}</p>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getCategoryColor(item.category)}`}>
                                    {item.category}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
