/**
 * One source document can carry several logical artifacts.
 *
 * The School of Enrichment packet arrives as a single hosted submission, but it is four documents:
 * a Classroom Application, a Tuition & Enrollment Agreement, a Parent Handbook Acknowledgement and
 * an ACH Authorization. Flattening them into one 97-field form because they share a submit button
 * would make a signature on the tuition terms silently satisfy the handbook acknowledgement and the
 * bank authorization — three different commitments, one click.
 *
 * The boundary is drawn from structure, not from reading the headings' words: a signature EXECUTES
 * an artifact, and an artifact begins at the heading that introduces the signature closing it.
 * Everything before the first such heading is the unsigned collection artifact — the part of the
 * packet that gathers information rather than committing to anything.
 *
 * Pure + deterministic. Works for any source whose sections and destinations are known, so a PDF
 * that carries two agreements segments the same way a hosted form does.
 */

/**
 * Name an artifact from what its OWN content says, when that is reliable.
 *
 * A page number is a position, not an identity — "Page 1" and "Page 2" tell an operator nothing and
 * stop meaning anything the moment a page is inserted. The signature that closes an artifact usually
 * states what is being agreed to ("By signing below, I agree to the Tuition and Enrollment
 * Agreement"), and where it does, that is the artifact's name in the source's own words.
 *
 * Nothing is guessed. When no evidence names the artifact, the section title is kept and the
 * artifact is marked `needs_name` so the operator names it during review.
 */
const AGREEMENT_FROM_SIGNATURE =
    /\b(?:i\s+(?:agree|consent|acknowledge|authorize|authorise)\s+(?:to|that)?\s*(?:the\s+)?|by\s+signing[^,.]*,?\s*i\s+agree\s+to\s+(?:the\s+)?)([A-Z][\w&'’-]*(?:\s+[\w&'’-]+){0,5})/;
const PAGE_TITLE = /^\s*page\s+\d+\s*$/i;

/** Trim a name to its agreement phrase, dropping trailing prose. */
function tidyName(raw: string): string {
    return raw
        .replace(/\s+/g, " ")
        .replace(/[.,;:]+$/, "")
        .replace(/\s+(listed|described|outlined|above|below|here)\b.*$/i, "")
        .trim();
}

export function deriveArtifactName(sectionTitle: string, signatureLabels: readonly string[]): { title: string; needs_name: boolean; signal: string } {
    for (const label of signatureLabels) {
        const m = AGREEMENT_FROM_SIGNATURE.exec(label ?? "");
        const name = m ? tidyName(m[1]) : "";
        if (name.length >= 6) {
            return { title: name, needs_name: false, signal: `named by its own signature statement: "${label.slice(0, 80)}"` };
        }
    }
    if (PAGE_TITLE.test(sectionTitle)) {
        return {
            title: sectionTitle,
            needs_name: true,
            signal: "no evidence names this artifact — a page number is a position, not an identity, so the operator names it",
        };
    }
    return { title: sectionTitle, needs_name: false, signal: `named by its section heading "${sectionTitle}"` };
}

export interface LogicalArtifact {
    /** Stable id from lineage: ordinal + normalized title. Never an array index alone. */
    id: string;
    title: string;
    /** Section titles this artifact spans, in source order. */
    section_titles: string[];
    /** Every destination inside the artifact, by its evidence id. */
    destination_ids: string[];
    /** The signature destinations that EXECUTE this artifact. Empty for a collection artifact. */
    signature_ids: string[];
    /** True when nothing signs this artifact — it collects rather than commits. */
    unsigned: boolean;
    /**
     * True when no structural evidence names this artifact. The operator names it during review;
     * until then the placeholder is shown as a placeholder rather than as a name.
     */
    needs_name: boolean;
    /** Why this boundary was drawn. */
    signals: string[];
}

export interface ArtifactSectionInput {
    title: string;
    index: number;
    destinations: Array<{ id: string; type: string; label: string }>;
}

function normalizeTitle(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 60);
}

/**
 * Segment sections into logical artifacts. A section holding a signature closes an artifact that
 * opened at that section's own heading; the sections before the first signed artifact form one
 * unsigned collection artifact.
 */
export function segmentLogicalArtifacts(sections: ArtifactSectionInput[]): LogicalArtifact[] {
    const signedSectionIdx = new Set(
        sections.filter((s) => s.destinations.some((d) => d.type === "signature")).map((s) => s.index)
    );
    if (signedSectionIdx.size === 0) return [];

    const artifacts: LogicalArtifact[] = [];
    let open: ArtifactSectionInput[] = [];
    let ordinal = 0;

    const flush = (signed: boolean) => {
        if (open.length === 0) return;
        ordinal += 1;
        const dests = open.flatMap((s) => s.destinations);
        const sigs = dests.filter((d) => d.type === "signature");
        const named = deriveArtifactName(open[0].title, sigs.map((d) => d.label));
        artifacts.push({
            // The id is lineage — ordinal + the SECTION title — so renaming an artifact during review
            // never changes its identity or orphans the decisions attached to it.
            id: `${ordinal}:${normalizeTitle(open[0].title)}`,
            title: named.title,
            section_titles: open.map((s) => s.title),
            destination_ids: dests.map((d) => d.id),
            signature_ids: sigs.map((d) => d.id),
            unsigned: !signed,
            needs_name: named.needs_name,
            signals: signed
                ? [`closed by ${sigs.length} signature destination(s)`, `opens at the heading "${open[0].title}"`, named.signal]
                : ["no signature closes this span — it collects information rather than committing to it", named.signal],
        });
        open = [];
    };

    for (const s of sections) {
        if (signedSectionIdx.has(s.index)) {
            // This section carries a signature. It opens its own artifact, so everything gathered
            // before it belongs to the preceding (unsigned) one.
            flush(false);
            open = [s];
            flush(true);
            continue;
        }
        open.push(s);
    }
    flush(false);

    return artifacts;
}
