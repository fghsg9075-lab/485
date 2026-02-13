import React, { useState, useEffect } from 'react';
import { Volume2, StopCircle, Square } from 'lucide-react';
import { speakText, stopSpeech } from '../utils/textToSpeech';

interface Props {
    text: string;
    className?: string;
    iconSize?: number;
    color?: string;
}

export const SpeakButton: React.FC<Props> = ({ text, className, iconSize = 18, color = 'text-slate-400' }) => {
    const [isSpeaking, setIsSpeaking] = useState(false);

    // Clean up on unmount
    useEffect(() => {
        return () => {
            if (isSpeaking) stopSpeech();
        };
    }, [isSpeaking]);

    const handleSpeak = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isSpeaking) {
            stopSpeech();
            setIsSpeaking(false);
        } else {
            setIsSpeaking(true);
            speakText(
                text,
                null,
                1.0,
                'hi-IN',
                () => setIsSpeaking(true),
                () => setIsSpeaking(false)
            ).catch(() => setIsSpeaking(false));
        }
    };

    return (
        <button 
            onClick={handleSpeak}
            className={`p-2 rounded-full hover:bg-slate-100 transition-colors ${className} ${isSpeaking ? 'text-blue-600 animate-pulse' : color}`}
            title={isSpeaking ? "Stop Speaking" : "Read Aloud"}
        >
            {isSpeaking ? <Square size={iconSize} fill="currentColor" className="opacity-80"/> : <Volume2 size={iconSize} />}
        </button>
    );
};
