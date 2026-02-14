import React, { useState, useEffect } from 'react';
import { Volume2, StopCircle, Square, Zap, Settings2 } from 'lucide-react';
import { speakText, stopSpeech } from '../utils/textToSpeech';
import { SystemSettings } from '../types';

interface Props {
    text: string;
    className?: string;
    iconSize?: number;
    color?: string;
    settings?: SystemSettings;
    onToggleAutoTts?: (enabled: boolean) => void;
    autoPlay?: boolean; // If strictly forced by parent context
}

export const SpeakButton: React.FC<Props> = ({ text, className, iconSize = 18, color = 'text-slate-400', settings, onToggleAutoTts, autoPlay }) => {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [showControls, setShowControls] = useState(false);
    const [speed, setSpeed] = useState(1.0);

    // Effect: Handle Auto-Play if enabled globally or locally
    useEffect(() => {
        if (settings?.isAutoTtsEnabled || autoPlay) {
            // Slight delay to ensure text is stable
            const timer = setTimeout(() => {
                if (!isSpeaking) triggerSpeech();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [text, settings?.isAutoTtsEnabled, autoPlay]);

    // Clean up on unmount
    useEffect(() => {
        return () => {
            if (isSpeaking) stopSpeech();
        };
    }, [isSpeaking]);

    const triggerSpeech = () => {
        if (!text) return;
        setIsSpeaking(true);
        speakText(
            text,
            null,
            speed,
            'hi-IN',
            () => setIsSpeaking(true),
            () => setIsSpeaking(false)
        ).catch(() => setIsSpeaking(false));
    };

    const handleSpeak = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isSpeaking) {
            stopSpeech();
            setIsSpeaking(false);
        } else {
            triggerSpeech();
        }
    };

    return (
        <div className="relative inline-block">
            <div className="flex items-center gap-1">
                <button
                    onClick={handleSpeak}
                    className={`p-2 rounded-full hover:bg-slate-100 transition-colors ${className} ${isSpeaking ? 'text-blue-600 animate-pulse' : color}`}
                    title={isSpeaking ? "Stop Speaking" : "Read Aloud"}
                >
                    {isSpeaking ? <Square size={iconSize} fill="currentColor" className="opacity-80"/> : <Volume2 size={iconSize} />}
                </button>

                {/* SETTINGS TOGGLE */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowControls(!showControls);
                    }}
                    className="p-1 rounded-full text-slate-300 hover:text-slate-500 hover:bg-slate-100"
                >
                    <Settings2 size={12} />
                </button>
            </div>

            {/* CONTROLS POPUP */}
            {showControls && (
                <div
                    className="absolute top-full left-0 mt-2 bg-white p-3 rounded-xl shadow-xl border border-slate-200 z-50 w-48 animate-in slide-in-from-top-2"
                    onClick={(e) => e.stopPropagation()}
                >
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">TTS Settings</p>

                    {/* GLOBAL TOGGLE */}
                    <div className="flex items-center justify-between mb-3 bg-slate-50 p-2 rounded-lg">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                            <Zap size={12} className={settings?.isAutoTtsEnabled ? "text-yellow-500" : "text-slate-400"} />
                            Auto-Read
                        </span>
                        <button
                            onClick={() => onToggleAutoTts && onToggleAutoTts(!settings?.isAutoTtsEnabled)}
                            className={`w-8 h-4 rounded-full p-0.5 transition-colors ${settings?.isAutoTtsEnabled ? 'bg-green-500' : 'bg-slate-300'}`}
                        >
                            <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${settings?.isAutoTtsEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    {/* SPEED CONTROL */}
                    <div>
                        <p className="text-[9px] font-bold text-slate-400 mb-1">Speed: {speed}x</p>
                        <div className="flex gap-1">
                            {[0.75, 1.0, 1.25, 1.5].map(s => (
                                <button
                                    key={s}
                                    onClick={() => {
                                        setSpeed(s);
                                        // Restart if speaking to apply speed
                                        if (isSpeaking) {
                                            stopSpeech();
                                            setTimeout(() => triggerSpeech(), 100);
                                        }
                                    }}
                                    className={`flex-1 py-1 rounded text-[10px] font-bold border ${speed === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                                >
                                    {s}x
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
