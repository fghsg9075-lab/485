
export const getAvailableVoices = (): Promise<SpeechSynthesisVoice[]> => {
    if (!('speechSynthesis' in window)) {
        return Promise.resolve([]);
    }
    
    return new Promise((resolve) => {
        let voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            resolve(voices);
            return;
        }
        
        // Voices might load asynchronously
        window.speechSynthesis.onvoiceschanged = () => {
            voices = window.speechSynthesis.getVoices();
            resolve(voices);
        };
        
        // Fallback timeout in case onvoiceschanged never fires
        setTimeout(() => {
             resolve(window.speechSynthesis.getVoices());
        }, 2000);
    });
};

export const getCategorizedVoices = async () => {
    const voices = await getAvailableVoices();
    return {
        hindi: voices.filter(v => v.lang.includes('hi') || v.name.toLowerCase().includes('hindi')),
        indianEnglish: voices.filter(v => v.lang === 'en-IN' || (v.lang.includes('en') && v.name.toLowerCase().includes('india'))),
        others: voices.filter(v => !v.lang.includes('hi') && !v.name.toLowerCase().includes('hindi') && v.lang !== 'en-IN' && !v.name.toLowerCase().includes('india'))
    };
};

export const setPreferredVoice = (voiceURI: string) => {
    localStorage.setItem('nst_preferred_voice_uri', voiceURI);
};

export const getPreferredVoice = async (): Promise<SpeechSynthesisVoice | undefined> => {
    const uri = localStorage.getItem('nst_preferred_voice_uri');
    const voices = await getAvailableVoices();
    if (!uri) return undefined;
    return voices.find(v => v.voiceURI === uri);
};

export const stripHtml = (html: string): string => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    return tempDiv.textContent || tempDiv.innerText || "";
};

export const speakText = async (
    text: string,
    voice?: SpeechSynthesisVoice | null,
    rate: number = 1.0,
    lang: string = 'en-US',
    onStart?: () => void,
    onEnd?: () => void
): Promise<SpeechSynthesisUtterance | null> => {
    if (!('speechSynthesis' in window)) {
        console.warn('Text-to-speech not supported.');
        return null;
    }

    // Cancel any existing speech
    window.speechSynthesis.cancel();

    // Strip HTML if present (simple check, but utility ensures clean text)
    const cleanText = stripHtml(text);

    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Priority: Explicit Voice -> User Preferred Voice -> Auto-Detect -> Default
    let selectedVoice = voice;
    
    if (!selectedVoice) {
        selectedVoice = await getPreferredVoice();
    }

    if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
    } else {
        utterance.lang = lang;
    }
    
    utterance.rate = rate;
    utterance.pitch = 1.0;

    if (onStart) utterance.onstart = onStart;
    if (onEnd) utterance.onend = onEnd;

    // Error handling
    utterance.onerror = (e) => {
        console.error("Speech Error:", e);
        if(onEnd) onEnd();
    };

    window.speechSynthesis.speak(utterance);
    return utterance;
};

export const stopSpeech = () => {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
};
