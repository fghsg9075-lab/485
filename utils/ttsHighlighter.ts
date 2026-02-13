import { TextMapping } from "../types"; // Assuming types might be needed, but will define locally if not

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
let originalTextNodeContent: string | null = null;

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
        // Restore the text
        const text = currentHighlightSpan.textContent || '';
        const textNode = document.createTextNode(text);
        parent.replaceChild(textNode, currentHighlightSpan);
        parent.normalize(); // Merge adjacent text nodes to keep DOM clean
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
        // Skip empty or whitespace-only nodes?
        // No, keep them to preserve fidelity, but maybe normalize spaces?
        // textContent returns raw text.
        const val = currentNode.textContent || "";

        if (!val) {
            currentNode = walker.nextNode();
            continue;
        }

        const parent = currentNode.parentElement;

        // Determine if we should insert a separator (space)
        // Heuristic: If we switched block contexts and aren't in a parent-child relationship
        if (lastParent && parent && lastParent !== parent) {
            const isBlockBoundary = blockTags.has(parent.tagName) || blockTags.has(lastParent.tagName);
            const isRelated = parent.contains(lastParent) || lastParent.contains(parent);

            // If we crossed a block boundary and strictly moved to a new non-nested element
            if (isBlockBoundary && !isRelated) {
                // Ensure there is a space if the previous text didn't end with one
                if (text.length > 0 && !/[ \n\t]$/.test(text)) {
                    text += " ";
                    // This space is unmapped (gap in map)
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
    removeHighlight(); // Clear previous

    // Find the node containing the globalIndex
    // We use .find or loop. Since map is sorted by start, binary search is faster, but linear is fine for normal lengths.
    const mapping = map.find(m => globalIndex >= m.start && globalIndex < m.end);

    if (!mapping) return;

    // Calculate offset within the node
    const localOffset = globalIndex - mapping.start;

    // Ensure we don't overflow the node
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
        span.className = 'tts-highlight'; // Useful for external styling if needed

        range.surroundContents(span);
        currentHighlightSpan = span;

        // Auto scroll to view (smoothly)
        // Check if element is already in view to avoid jarring jumps?
        // span.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        // 'center' is usually better for reading
        span.scrollIntoView({ behavior: 'smooth', block: 'center' });

    } catch (e) {
        // Can fail if DOM changed or range is invalid (e.g. split text node)
        // console.warn("Highlight error:", e);
    }
};

export const speakWithHighlight = (
    container: HTMLElement,
    rate: number = 1.0,
    lang: string = 'en-US',
    onEnd?: () => void
) => {
    stopSpeaking();

    // 1. Build Spoken Text and Map
    const { text: fullText, map } = buildTextAndMap(container);

    if (!fullText.trim()) {
        if (onEnd) onEnd();
        return;
    }

    // 2. Chunking Logic (Sentence level)
    const chunks: Chunk[] = [];
    // Regex matches sequence of non-sentence-ending chars, followed by sentence-ending chars
    const regex = /[^.!?\n]+[.!?\n]*/g;
    let match;

    while ((match = regex.exec(fullText)) !== null) {
        chunks.push({
            text: match[0],
            start: match.index,
            end: match.index + match[0].length
        });
    }

    // Fallback if no punctuation found
    if (chunks.length === 0 && fullText.trim()) {
        chunks.push({ text: fullText, start: 0, end: fullText.length });
    }

    let chunkIdx = 0;

    const speakNextChunk = () => {
        if (chunkIdx >= chunks.length) {
            if (onEnd) onEnd();
            return;
        }

        const chunk = chunks[chunkIdx];

        // Skip empty chunks (whitespace)
        if (!chunk.text.trim()) {
            chunkIdx++;
            speakNextChunk();
            return;
        }

        const utterance = new SpeechSynthesisUtterance(chunk.text);
        utterance.rate = rate;
        utterance.lang = lang;

        // Auto-detect Hindi mixed (Simple check)
        if (/[\u0900-\u097F]/.test(chunk.text)) {
             utterance.lang = 'hi-IN';
        }

        utterance.onboundary = (event) => {
            if (event.name === 'word') {
                const charIndex = event.charIndex; // Relative to chunk text
                const globalIndex = chunk.start + charIndex; // Relative to full text

                // Heuristic to determine length of word to highlight
                // We peek at the chunk text starting from charIndex
                const remainder = chunk.text.substring(charIndex);

                // Match word characters.
                // Note: \w works for English. For Hindi/others it might fail.
                // Better approach: Read until next whitespace or punctuation
                const nextSeparator = remainder.search(/[\s.!?,'":;()[\]{}]/);
                let wordLen = nextSeparator === -1 ? remainder.length : nextSeparator;
                if (wordLen === 0) wordLen = 1; // Fallback

                highlightWord(map, globalIndex, wordLen);
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
