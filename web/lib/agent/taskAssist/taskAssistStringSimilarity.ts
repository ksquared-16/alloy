/** Deterministic string similarity helpers (no LLM). */

export function normalizeSimilarityText(s: string): string {
    return s
        .toLowerCase()
        .replace(/['']/g, "")
        .replace(/\b(family|household)\b/g, " ")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const rows = a.length + 1;
    const cols = b.length + 1;
    const dp = new Array(cols).fill(0);
    for (let j = 0; j < cols; j++) dp[j] = j;
    for (let i = 1; i < rows; i++) {
        let prev = dp[0]!;
        dp[0] = i;
        for (let j = 1; j < cols; j++) {
            const temp = dp[j]!;
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + cost);
            prev = temp;
        }
    }
    return dp[cols - 1]!;
}

/** 0–1 similarity; 1 = identical after normalize. */
export function similarityRatio(a: string, b: string): number {
    const na = normalizeSimilarityText(a);
    const nb = normalizeSimilarityText(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.92;
    const dist = levenshteinDistance(na, nb);
    const maxLen = Math.max(na.length, nb.length);
    return maxLen > 0 ? 1 - dist / maxLen : 0;
}

export function titlesAreSimilar(a: string, b: string, threshold = 0.72): boolean {
    return similarityRatio(a, b) >= threshold;
}

/** Single-edit variants for fuzzy entity search (e.g. Michell → Mitchell). */
export function editDistanceOneTokens(token: string): string[] {
    const t = token.trim().toLowerCase();
    if (t.length < 3 || t.length > 24) return [];
    const alpha = "abcdefghijklmnopqrstuvwxyz";
    const out = new Set<string>();
    for (let i = 0; i < t.length; i++) {
        out.add(t.slice(0, i) + t.slice(i + 1));
        for (const c of alpha) {
            if (c === t[i]) continue;
            out.add(t.slice(0, i) + c + t.slice(i + 1));
        }
    }
    for (let i = 0; i <= t.length; i++) {
        for (const c of alpha) {
            out.add(t.slice(0, i) + c + t.slice(i));
        }
    }
    out.delete(t);
    return [...out].filter((v) => v.length >= 3).slice(0, 12);
}
