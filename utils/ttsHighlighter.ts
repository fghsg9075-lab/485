import { TextMapping } from "../types";

interface Chunk {
    text: string;
    start: number;
    end: number;
}

interface TextMap {
    node: Node;
    start: number;
    end: number;
}

let currentUtterance: SpeechSynthesisUtterance | null = null;
let currentHighlightSpan: HTMLSpanElement | null = null;
let isPaused = false;

// Global State for Restarting
let activeChunks: Chunk[] = [];
let activeChunkIdx = 0;
let activeMap: TextMap[] = [];
let activeRate = 1.0;
let activeLang = 'en-US';
let activeOnEnd: (() => void) | undefined;

export const stopSpeaking = () => {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    removeHighlight();
    currentUtterance = null;
    isPaused = false;
    activeChunks = [];
    activeChunkIdx = 0;
};

export const pauseSpeaking = () => {
    if (window.speechSynthesis && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        isPaused = true;
    }
};

export const resumeSpeaking = () => {
    if (window.speechSynthesis && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        isPaused = false;
    }
};

export const setGlobalRate = (rate: number) => {
    if (rate === activeRate) return;
    activeRate = rate;

    // If currently speaking, we need to restart from current chunk to apply rate
    if (window.speechSynthesis.speaking || isPaused) {
        window.speechSynthesis.cancel();
        // Don't reset chunk index, continue from where we were
        speakNextChunk();
    }
};

const removeHighlight = () => {
    if (currentHighlightSpan && currentHighlightSpan.parentNode) {
        const parent = currentHighlightSpan.parentNode;
        const text = currentHighlightSpan.textContent || '';
        const textNode = document.createTextNode(text);
        parent.replaceChild(textNode, currentHighlightSpan);
        parent.normalize();
        currentHighlightSpan = null;
    }
};

const blockTags = new Set([
    'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'LI', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER',
    'MAIN', 'ASIDE', 'TR', 'TD', 'TH', 'CAPTION', 'FIGCAPTION'
]);

const buildTextAndMap = (root: HTMLElement): { text: string, map: TextMap[] } => {
    const map: TextMap[] = [];
    let text = "";

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let currentNode: Node | null = walker.nextNode();
    let lastParent: Element | null = null;

    while (currentNode) {
        const val = currentNode.textContent || "";

        if (!val) {
            currentNode = walker.nextNode();
            continue;
        }

        const parent = currentNode.parentElement;

        if (lastParent && parent && lastParent !== parent) {
            const isBlockBoundary = blockTags.has(parent.tagName) || blockTags.has(lastParent.tagName);
            const isRelated = parent.contains(lastParent) || lastParent.contains(parent);

            if (isBlockBoundary && !isRelated) {
                if (text.length > 0 && !/[ \n\t]$/.test(text)) {
                    text += " ";
                }
            }
        }

        const start = text.length;
        text += val;
        const end = text.length;

        map.push({ node: currentNode, start, end });

        lastParent = parent;
        currentNode = walker.nextNode();
    }

    return { text, map };
};

const highlightWord = (map: TextMap[], globalIndex: number, length: number) => {
    removeHighlight();

    const mapping = map.find(m => globalIndex >= m.start && globalIndex < m.end);

    if (!mapping) return;

    const localOffset = globalIndex - mapping.start;
    const nodeTextLen = (mapping.node.textContent || "").length;
    const safeLength = Math.min(length, nodeTextLen - localOffset);

    if (safeLength <= 0) return;

    try {
        const range = document.createRange();
        range.setStart(mapping.node, localOffset);
        range.setEnd(mapping.node, localOffset + safeLength);

        const span = document.createElement('span');
        span.style.backgroundColor = 'yellow';
        span.style.color = 'black';
        span.className = 'tts-highlight';

        range.surroundContents(span);
        currentHighlightSpan = span;

        span.scrollIntoView({ behavior: 'smooth', block: 'center' });

    } catch (e) {
    }
};

const speakNextChunk = () => {
    if (activeChunkIdx >= activeChunks.length) {
        if (activeOnEnd) activeOnEnd();
        return;
    }

    const chunk = activeChunks[activeChunkIdx];

    if (!chunk.text.trim()) {
        activeChunkIdx++;
        speakNextChunk();
        return;
    }

    const utterance = new SpeechSynthesisUtterance(chunk.text);
    utterance.rate = activeRate;
    utterance.lang = activeLang;

    if (/[\u0900-\u097F]/.test(chunk.text)) {
            utterance.lang = 'hi-IN';
    }

    utterance.onboundary = (event) => {
        if (event.name === 'word') {
            const charIndex = event.charIndex;
            const globalIndex = chunk.start + charIndex;

            const remainder = chunk.text.substring(charIndex);
            const nextSeparator = remainder.search(/[\s.!?,'":;()[\]{}]/);
            let wordLen = nextSeparator === -1 ? remainder.length : nextSeparator;
            if (wordLen === 0) wordLen = 1;

            highlightWord(activeMap, globalIndex, wordLen);
        }
    };

    utterance.onend = () => {
        activeChunkIdx++;
        speakNextChunk();
    };

    utterance.onerror = (e) => {
        console.error("TTS Error", e);
        stopSpeaking();
    };

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
};

export const speakWithHighlight = (
    container: HTMLElement,
    rate: number = 1.0,
    lang: string = 'en-US',
    onEnd?: () => void
) => {
    stopSpeaking();

    const { text: fullText, map } = buildTextAndMap(container);

    if (!fullText.trim()) {
        if (onEnd) onEnd();
        return;
    }

    const chunks: Chunk[] = [];
    const regex = /[^.!?\n]+[.!?\n]*/g;
    let match;

    while ((match = regex.exec(fullText)) !== null) {
        chunks.push({
            text: match[0],
            start: match.index,
            end: match.index + match[0].length
        });
    }

    if (chunks.length === 0 && fullText.trim()) {
        chunks.push({ text: fullText, start: 0, end: fullText.length });
    }

    // Set Global State
    activeChunks = chunks;
    activeChunkIdx = 0;
    activeMap = map;
    activeRate = rate;
    activeLang = lang;
    activeOnEnd = onEnd;

    speakNextChunk();
};
