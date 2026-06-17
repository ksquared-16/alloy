export type ExtractedAge = {
    raw: string;
    years: number;
};

/** Extract age in years from text using common phrasing. */
export function extractAgeFromText(text: string): ExtractedAge | null {
    const patterns: RegExp[] = [
        /\b(\d{1,2})\s*(?:years?\s+old|yrs?\s+old)\b/i,
        /\bage\s*[:\-]?\s*(\d{1,2})\b/i,
        /\b(\d{1,2})\s*yo\b/i,
    ];

    for (const re of patterns) {
        const match = text.match(re);
        if (match?.[1]) {
            const years = Number(match[1]);
            if (years >= 0 && years <= 99) {
                return { raw: match[0], years };
            }
        }
    }
    return null;
}

/** Age on a dedicated labeled line: Age: 3 */
export function extractLabeledAge(line: string): ExtractedAge | null {
    const match = line.match(/^age\s*[:\-]\s*(\d{1,2})\b/i);
    if (!match?.[1]) return null;
    const years = Number(match[1]);
    if (years < 0 || years > 99) return null;
    return { raw: match[0], years };
}
