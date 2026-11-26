/**
 * Clause-level reading of a section's preserved prose.
 *
 * A consent page is not one acknowledgement. Page 23 of the real School of Enrichment handbook
 * carries SEVEN distinct authorizations — emergency medical treatment, use of play equipment,
 * leaving the premises on a field trip, hold-harmless, photographs, the parent directory, the
 * terms — under a single "Parent Authorizations" heading. Discovery proposed one acknowledgement
 * for the whole section, which is a decision a parent cannot meaningfully give or withhold: they
 * are agreeing to seven different things at once.
 *
 * The same page-level flattening hid upload requirements. So both are read the same way here: the
 * prose is split into sentences and each sentence is asked what commitment it carries.
 *
 * The signal is first-person commitment language — "I certify", "I hereby grant permission",
 * "I have attached" — which is how consent is written in English generally, not a phrase list for
 * one document. A form written only in another language yields nothing here rather than a wrong
 * guess; the CIS repeats every clause in Spanish, and those repeats are correctly NOT counted a
 * second time.
 *
 * Pure + deterministic. Every clause is lifted verbatim from the document; nothing is composed.
 */

/** First-person commitment — the verb that turns a sentence into something the participant gives. */
const COMMITMENT_RE =
    /\bI\s+(?:\([^)]*\)\s+)?(?:hereby\s+|do\s+)?(certify|agree|acknowledge|authorize|authorise|consent|understand|grant|give|release|affirm|declare|request|permit|waive|have\s+read|have\s+received|have\s+reviewed|have\s+attached)\b/i;

/** Asking the participant to supply a document, rather than to agree to something. */
const ATTACHMENT_RE =
    /\b(attach|attached|enclose|enclosed|submit|submitted|provide|provided|bring|include\s+a\s+copy|proof\s+of|must\s+be\s+(?:provided|submitted|attached))\b/i;

/** Words that name the thing being attached — used to title an upload requirement from its own sentence. */
const DOCUMENT_NOUN_RE = /\b(record|records|document|documents|documentation|certificate|letter|plan|copy|proof|form|report|card|statement)\b/i;

const MAX_CLAUSE_LENGTH = 400;
const MAX_CLAUSES = 24;

export interface ProseClause {
    /** The sentence, verbatim and whitespace-normalized. */
    text: string;
    /** Stable identity: normalized clause text, so the same clause never counts twice. */
    key: string;
}

/**
 * Split preserved prose into sentences.
 *
 * Text lifted from a PDF arrives wrapped at the page's line breaks, so a single sentence is
 * routinely split across two or three of them. A line break is only a real boundary when the line
 * finished a sentence; otherwise the next line continues it. Without that rewrap, "I understand my
 * child may / be excluded from school…" is stored as the clause "I understand my child may", which
 * is not a commitment anyone could agree to.
 */
export function splitProseSentences(text: string | null | undefined): string[] {
    if (!text) return [];
    const lines = text
        .split(/\n+/)
        .map((l) => l.replace(/\s+/g, " ").trim())
        .filter((l) => l.length > 0);

    const paragraphs: string[] = [];
    for (const line of lines) {
        const prev = paragraphs[paragraphs.length - 1];
        // The previous line continues into this one when it did not finish a sentence and this one
        // opens mid-sentence (lower case). Anything else starts fresh.
        const isContinuation = prev !== undefined && !/[.!?:;]$/.test(prev) && /^[a-záéíóúñü(]/.test(line);
        if (isContinuation) paragraphs[paragraphs.length - 1] = `${prev} ${line}`;
        else paragraphs.push(line);
    }

    return paragraphs
        .flatMap((para) => para.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡(])/))
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter((s) => s.length > 0);
}

function clauseKey(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .slice(0, 120);
}

function toClause(text: string): ProseClause {
    const trimmed = text.length > MAX_CLAUSE_LENGTH ? `${text.slice(0, MAX_CLAUSE_LENGTH - 1)}…` : text;
    return { text: trimmed, key: clauseKey(text) };
}

/**
 * The consent clauses in a section's prose — one per distinct commitment, deduped by clause text.
 * A sentence that asks for a document is an upload request, not an acknowledgement, and is
 * excluded here so the two never double-count.
 */
export function acknowledgementClauses(text: string | null | undefined): ProseClause[] {
    const out: ProseClause[] = [];
    const seen = new Set<string>();
    for (const sentence of splitProseSentences(text)) {
        if (!COMMITMENT_RE.test(sentence)) continue;
        if (ATTACHMENT_RE.test(sentence) && DOCUMENT_NOUN_RE.test(sentence)) continue;
        const clause = toClause(sentence);
        if (seen.has(clause.key)) continue;
        seen.add(clause.key);
        out.push(clause);
        if (out.length >= MAX_CLAUSES) break;
    }
    return out;
}

/**
 * The sentences that ask the participant to supply a document. The requirement's name comes from
 * the sentence itself — never from a table of known document types — so a form that asks for
 * something we have never seen still produces an honest, reviewable requirement.
 */
export function documentRequestClauses(text: string | null | undefined): ProseClause[] {
    const out: ProseClause[] = [];
    const seen = new Set<string>();
    for (const sentence of splitProseSentences(text)) {
        if (!ATTACHMENT_RE.test(sentence) || !DOCUMENT_NOUN_RE.test(sentence)) continue;
        const clause = toClause(sentence);
        if (seen.has(clause.key)) continue;
        seen.add(clause.key);
        out.push(clause);
        if (out.length >= MAX_CLAUSES) break;
    }
    return out;
}
