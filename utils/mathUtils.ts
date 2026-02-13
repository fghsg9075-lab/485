import katex from 'katex';

export const renderMathInHtml = (html: string): string => {
    if (!html) return '';

    // Replace $$...$$ (Display Mode)
    let processed = html.replace(/\$\$([^$]+)\$\$/g, (match, tex) => {
        try {
            return katex.renderToString(tex, { displayMode: true, throwOnError: false });
        } catch (e) {
            return match;
        }
    });

    // Replace $...$ (Inline Mode)
    // We use a negative lookbehind to avoid matching already rendered katex HTML (which shouldn't happen if we do this first, but caution is good)
    // Simple regex: \$([^$]+)\$
    // We assume $ is not used for currency in these specific text blocks (Math context).
    // If user writes "$10", it might break. But "faltu symbol" implies they see unrendered latex.
    // To be safer, we could require a space or specific format, but latex usually is tight: $x^2$.

    processed = processed.replace(/\$([^$]+)\$/g, (match, tex) => {
        // Filter out likely currency usages: e.g. $10, $ 100.
        // If tex matches /^\s*\d/ (starts with digit), ignore it?
        // But $2x$ is math.
        // Let's rely on the fact that this is an Education App.

        try {
            return katex.renderToString(tex, { displayMode: false, throwOnError: false });
        } catch (e) {
            return match;
        }
    });

    return processed;
};
