
// utils/ttsHighlighter.ts

interface Chunk {
    text: string;
    start: number;
    end: number;
}

let currentUtterance: SpeechSynthesisUtterance | null = null;
let currentHighlightSpan: HTMLSpanElement | null = null;

export const stopSpeaking = () => {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    removeHighlight();
    currentUtterance = null;
};

const removeHighlight = () => {
    if (currentHighlightSpan && currentHighlightSpan.parentNode) {
        const parent = currentHighlightSpan.parentNode;
        parent.replaceChild(document.createTextNode(currentHighlightSpan.textContent || ''), currentHighlightSpan);
        parent.normalize(); // Merge text nodes
        currentHighlightSpan = null;
    }
};

const findTextNodeAndOffset = (root: HTMLElement, targetIndex: number): { node: Node, offset: number } | null => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let currentNode: Node | null = walker.nextNode();
    let currentIndex = 0;

    while (currentNode) {
        const len = currentNode.textContent?.length || 0;
        if (currentIndex + len > targetIndex) {
            return { node: currentNode, offset: targetIndex - currentIndex };
        }
        currentIndex += len;
        currentNode = walker.nextNode();
    }
    return null;
};

const highlightWord = (root: HTMLElement, startIndex: number, length: number) => {
    removeHighlight(); // Clear previous

    const start = findTextNodeAndOffset(root, startIndex);
    if (!start) return;

    // Determine safe length within the same node (simplification: assume word doesn't cross nodes)
    // If word crosses nodes, we just highlight the part in the first node to avoid complexity
    const safeLength = Math.min(length, (start.node.textContent?.length || 0) - start.offset);

    if (safeLength <= 0) return;

    try {
        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(start.node, start.offset + safeLength);

        const span = document.createElement('span');
        span.style.backgroundColor = 'yellow';
        span.style.color = 'black';
        span.className = 'tts-highlight';

        range.surroundContents(span);
        currentHighlightSpan = span;

        // Auto scroll to view
        span.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
        console.warn("Highlight error:", e);
    }
};

export const speakWithHighlight = (
    container: HTMLElement,
    rate: number = 1.0,
    lang: string = 'en-US',
    onEnd?: () => void
) => {
    stopSpeaking();

    const fullText = container.innerText; // Use innerText to match what is visible/spoken
    // Note: mapping innerText offsets to textNode offsets is tricky because innerText normalizes whitespace.
    // However, for simple highlighting, it's often "good enough" if DOM structure isn't too complex.
    // A more robust way is to speak textContent, but that reads hidden text.
    // Let's try matching textContent for highlighting accuracy.

    const textContent = container.textContent || '';

    // Chunking logic (Simple sentence split)
    const chunks: Chunk[] = [];
    const regex = /[^.!?\n]+[.!?\n]*/g;
    let match;
    while ((match = regex.exec(textContent)) !== null) {
        chunks.push({
            text: match[0],
            start: match.index,
            end: match.index + match[0].length
        });
    }

    if (chunks.length === 0 && textContent.trim()) {
        chunks.push({ text: textContent, start: 0, end: textContent.length });
    }

    let chunkIdx = 0;

    const speakNextChunk = () => {
        if (chunkIdx >= chunks.length) {
            if (onEnd) onEnd();
            return;
        }

        const chunk = chunks[chunkIdx];
        const utterance = new SpeechSynthesisUtterance(chunk.text);
        utterance.rate = rate;
        utterance.lang = lang;

        // Auto-detect Hindi mixed
        if (/[\u0900-\u097F]/.test(chunk.text)) {
             utterance.lang = 'hi-IN';
        }

        utterance.onboundary = (event) => {
            if (event.name === 'word') {
                const charIndex = event.charIndex; // Relative to chunk
                const globalIndex = chunk.start + charIndex;

                // Estimate word length (scan for next whitespace)
                // We use the original textContent to find the word length
                const remainder = chunk.text.substring(charIndex);
                const wordMatch = remainder.match(/^\w+/); // Simple word match
                // For Hindi/Other scripts, \w might not work well.
                // Let's look for space or punctuation
                const endMatch = remainder.search(/[\s.!?]/);
                const wordLength = endMatch === -1 ? remainder.length : endMatch;

                // Fallback min length
                const len = Math.max(1, wordLength);

                highlightWord(container, globalIndex, len);
            }
        };

        utterance.onend = () => {
            chunkIdx++;
            speakNextChunk();
        };

        utterance.onerror = (e) => {
            console.error("TTS Error", e);
            stopSpeaking();
        };

        currentUtterance = utterance;
        window.speechSynthesis.speak(utterance);
    };

    speakNextChunk();
};
