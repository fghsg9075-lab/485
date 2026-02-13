import React from 'react';
import { X, Gift, Gamepad2, CreditCard, Crown, History, BrainCircuit, Award, Trophy, Mail, User, ChevronRight, LogOut, FileClock } from 'lucide-react';
import { StudentTab, User as UserType, SystemSettings } from '../types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (tab: StudentTab) => void;
    user: UserType;
    onLogout: () => void;
    settings?: SystemSettings;
}

export const StudentSidebar: React.FC<Props> = ({ isOpen, onClose, onNavigate, user, onLogout, settings }) => {

    const rawItems: { id: StudentTab, icon: any, label: string, color: string, featureId?: string }[] = [
        { id: 'REDEEM', icon: Gift, label: 'Redeem', color: 'text-pink-600' },
        { id: 'GAME', icon: Gamepad2, label: 'Game', color: 'text-orange-600', featureId: 'f9' },
        { id: 'SUB_HISTORY', icon: CreditCard, label: 'My Plan', color: 'text-blue-600', featureId: 'f11' },
        { id: 'STORE', icon: Crown, label: 'Premium', color: 'text-yellow-600', featureId: 'f12' },
        { id: 'HISTORY', icon: History, label: 'History', color: 'text-slate-600', featureId: 'f21' },
        { id: 'ANALYTICS', icon: Trophy, label: 'Test Analysis', color: 'text-teal-600', featureId: 'f50' },
        { id: 'AI_HISTORY', icon: BrainCircuit, label: 'AI History', color: 'text-indigo-600', featureId: 'f101' },
        { id: 'PRIZES', icon: Award, label: 'Prizes', color: 'text-purple-600', featureId: 'f6' },
        { id: 'LEADERBOARD', icon: Trophy, label: 'Leaderboard', color: 'text-yellow-500', featureId: 'f5' },
        { id: 'PROFILE', icon: User, label: 'Profile', color: 'text-slate-800', featureId: 'f13' },
    ];

    const menuItems = rawItems.filter(item => {
        if (!item.featureId) return true;
        if (settings?.hiddenFeatures?.includes(item.featureId)) return false;
        return true;
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            ></div>

            {/* Drawer */}
            <div className="relative w-72 bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">

                {/* Header */}
                <div className="p-6 bg-slate-900 text-white flex justify-between items-start">
                    <div>
                        <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mb-3 text-xl font-black border border-white/20">
                            {user.name.charAt(0)}
                        </div>
                        <h2 className="font-bold text-lg leading-tight">{user.name}</h2>
                        <p className="text-xs text-slate-400 font-mono mt-1">ID: {user.displayId || user.id.slice(0, 8)}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Menu Items */}
                <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                    {menuItems.map((item) => {
                        const badge = item.featureId ? settings?.featureBadges?.[item.featureId] : undefined;
                        return (
                        <button
                            key={item.id}
                            onClick={() => {
                                onNavigate(item.id);
                                onClose();
                            }}
                            className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-all group relative"
                        >
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg bg-slate-50 group-hover:bg-white group-hover:shadow-sm transition-all ${item.color}`}>
                                    <item.icon size={20} />
                                </div>
                                <span className="font-bold text-slate-700 text-sm group-hover:text-slate-900">{item.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {badge === 'NEW' && <span className="text-[10px] font-black bg-green-500 text-white px-2 py-0.5 rounded-full animate-pulse">NEW</span>}
                                {badge === 'UPGRADE' && <span className="text-[10px] font-black bg-purple-500 text-white px-2 py-0.5 rounded-full">PRO</span>}
                                <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500" />
                            </div>
                        </button>
                    )})}
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-slate-100 bg-slate-50">
                    <button
                        onClick={() => {
                            onLogout();
                            onClose();
                        }}
                        className="w-full flex items-center justify-center gap-2 p-3 text-red-600 font-bold hover:bg-red-50 rounded-xl transition-colors text-sm"
                    >
                        <LogOut size={18} /> Logout
                    </button>
                </div>
            </div>
        </div>
    );
};
