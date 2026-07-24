/**
 * Identity Review → operator conversation (presentation only).
 *
 * Maps the canonical /identity/review engine payload into an operator-facing view of a FAMILY —
 * never an identity graph. No engine vocabulary (facts, subjects, confirmed_existing,
 * plausible_match_needs_review, household:<uuid>, raw fact keys, ids) reaches the operator. The
 * underlying identity model, endpoints, and decisions are unchanged; this only renames and reshapes.
 */

import { formatDisplayDate } from "@/lib/presentation/presentationDateFormat";

/** Loose shapes for the bits of the /identity/review payload we present. */
export interface ReviewCandidateRaw {
    recordId?: string | null;
    displayName?: string | null;
    confidenceBand?: string;
    entityType?: string;
    explanation?: string | null;
    signals?: { kind?: string; explanation?: string }[];
    blockingConflicts?: { explanation?: string }[];
}
export interface ReviewResolutionRaw {
    id: string;
    subject_ref: string;
    subject_role: string;
    decision_action: string | null;
    selected_candidate_id: string | null;
    provisional?: Record<string, unknown>;
    candidates?: ReviewCandidateRaw[];
}
export interface ReviewSubjectEligibilityRaw {
    subjectRole: string;
    state: string;
    eligibleForPlan: boolean;
}
export interface ReviewDataRaw {
    resolutions?: ReviewResolutionRaw[];
    subjectEligibility?: ReviewSubjectEligibilityRaw[];
    planEligible?: boolean;
    identityBlockers?: string[];
}

/** Enriched profile for a matched parent, joined from the recommendation's candidate details. */
export interface CandidateProfile {
    id: string;
    email?: string | null;
    phone?: string | null;
    zip?: string | null;
    household?: string | null;
    children?: string[];
    status?: string | null;
    lastActivity?: string | null;
}

export type SubjectMatchState = "exact_match" | "possible_match" | "new";

export interface ConversationAction {
    /** The canonical engine decisionAction — unchanged. */
    decisionAction: string;
    /** Operator-facing label — a decision about a family, not a database operation. */
    label: string;
    selectedCandidateId: string | null;
    /** create-new despite a plausible match requires an explicit operator reason. */
    requiresReason: boolean;
    /** Emphasis for the most natural choice. */
    emphasis: "primary" | "secondary";
}

export interface ConversationSubject {
    resolutionId: string;
    kind: "parent" | "child";
    name: string;
    /** Submitted identity, plain. */
    submitted: { email?: string | null; dob?: string | null };
    matchState: SubjectMatchState;
    /** One-line status the operator reads first, e.g. "Already exists." / "Possible existing child". */
    headline: string;
    /** Supporting explanation (already human from the engine). */
    detail: string | null;
    /** Whether this subject still needs an operator decision. */
    needsDecision: boolean;
    /** The matched record shown as a profile card (null when this is new). */
    match: {
        name: string;
        reasons: string[];
        profile: CandidateProfile | null;
        band: SubjectMatchState;
    } | null;
    currentDecision: string | null;
    actions: ConversationAction[];
}

export interface ConversationView {
    /** "We found one existing family that may match." — null when everything is new. */
    foundSummary: string | null;
    subjects: ConversationSubject[];
    /** Calm review panel (never a technical warning) when a decision is still required. */
    reviewNeeded: { title: string; body: string } | null;
    allResolved: boolean;
    /** "After confirmation Alloy will:" outcome lines, reflecting the CURRENT decisions. */
    outcome: { text: string; pending: boolean }[];
}

function fullName(p: Record<string, unknown> | undefined): string {
    if (!p) return "";
    const display = typeof p.display_name === "string" ? p.display_name : "";
    if (display.trim()) return display.trim();
    const first = typeof p.first_name === "string" ? p.first_name : "";
    const last = typeof p.last_name === "string" ? p.last_name : "";
    return [first, last].filter(Boolean).join(" ").trim();
}

function stripSignal(s: string): string {
    // "supporting:Exact canonical email match within organization." → "Exact canonical email match within organization."
    const i = s.indexOf(":");
    return (i >= 0 ? s.slice(i + 1) : s).trim();
}

function matchReasons(c: ReviewCandidateRaw): string[] {
    const out: string[] = [];
    for (const s of c.signals ?? []) if (s.explanation) out.push(stripSignal(String(s.explanation)));
    if (out.length === 0 && c.explanation) out.push(String(c.explanation));
    return out;
}

function formatDob(raw: unknown): string | null {
    if (!raw) return null;
    // Canonical display date (doctrine: typography-and-presentation-doctrine.md) — "May 10, 2022", never ISO.
    return formatDisplayDate(String(raw).trim()) || null;
}

/** Build the operator-facing conversation from the engine review payload. */
export function buildIdentityConversation(
    data: ReviewDataRaw,
    opts?: { candidateProfiles?: CandidateProfile[] }
): ConversationView {
    const resolutions = data.resolutions ?? [];
    const eligByRole = new Map((data.subjectEligibility ?? []).map((e) => [e.subjectRole, e]));
    const profileById = new Map((opts?.candidateProfiles ?? []).map((p) => [p.id, p]));

    const subjects: ConversationSubject[] = [];
    let anyFamilyMatch = false;

    for (const r of resolutions) {
        if (r.subject_role === "household") {
            const c = (r.candidates ?? [])[0];
            if (c && c.confidenceBand === "confirmed" && c.recordId && c.recordId !== "none") anyFamilyMatch = true;
            continue; // the family is conveyed through the parent + summary, not its own card
        }
        if (r.subject_role !== "parent" && r.subject_role !== "child") continue; // 'lead' is an outcome, not a subject

        const kind = r.subject_role as "parent" | "child";
        const name = fullName(r.provisional) || (kind === "parent" ? "This parent" : "This child");
        const cand = (r.candidates ?? [])[0];
        const hasMatch = !!cand && cand.confidenceBand !== "excluded" && !!cand.recordId && cand.recordId !== "none";
        const elig = eligByRole.get(kind);
        const needsDecision = elig ? elig.eligibleForPlan === false : r.decision_action === "review_required";

        let matchState: SubjectMatchState = "new";
        if (hasMatch) matchState = cand!.confidenceBand === "confirmed" ? "exact_match" : "possible_match";
        if (matchState === "exact_match") anyFamilyMatch = true;

        const headline =
            matchState === "exact_match"
                ? "Already exists"
                : matchState === "possible_match"
                  ? kind === "child"
                      ? "Possible existing child"
                      : "Possible existing parent"
                  : kind === "child"
                    ? "New child"
                    : "New parent";

        const detail = hasMatch ? cand!.explanation ?? null : null;

        subjects.push({
            resolutionId: r.id,
            kind,
            name,
            submitted: {
                email: typeof r.provisional?.email === "string" ? (r.provisional.email as string) : null,
                dob: formatDob(r.provisional?.dob),
            },
            matchState,
            headline,
            detail,
            needsDecision,
            match: hasMatch
                ? {
                      name: cand!.displayName || name,
                      reasons: matchReasons(cand!),
                      profile: cand!.recordId ? profileById.get(cand!.recordId) ?? null : null,
                      band: matchState,
                  }
                : null,
            currentDecision: r.decision_action,
            actions: buildActions(kind, hasMatch, cand?.recordId ?? null, name, r.decision_action),
        });
    }

    const childNeeding = subjects.find((s) => s.kind === "child" && s.needsDecision);
    const reviewNeeded =
        data.planEligible === false
            ? {
                  title: "Review required",
                  body: childNeeding
                      ? `We found a possible existing child. Please confirm whether ${childNeeding.name} already exists before continuing. No records will be changed until you decide.`
                      : "A record couldn’t be settled automatically. Please confirm the details below before continuing. No records will be changed until you decide.",
              }
            : null;

    return {
        foundSummary: anyFamilyMatch ? "We found one existing family that may match." : null,
        subjects,
        reviewNeeded,
        allResolved: data.planEligible !== false,
        outcome: buildOutcome(resolutions),
    };
}

/** Natural operator actions for a subject — mapping to the unchanged engine decisionActions. */
function buildActions(
    kind: "parent" | "child",
    hasMatch: boolean,
    candidateId: string | null,
    name: string,
    current: string | null,
): ConversationAction[] {
    const noun = kind === "child" ? "child" : "family";
    const actions: ConversationAction[] = [];
    if (hasMatch) {
        actions.push({
            decisionAction: "link_existing",
            label: kind === "child" ? "Same child" : "Same family",
            selectedCandidateId: candidateId,
            requiresReason: false,
            emphasis: current === "link_existing" ? "primary" : "secondary",
        });
        actions.push({
            decisionAction: "create_new",
            label: kind === "child" ? "New child" : "New family",
            selectedCandidateId: null,
            requiresReason: true, // create-new despite a plausible match needs an explicit reason
            emphasis: "secondary",
        });
        actions.push({
            decisionAction: "review_required",
            label: "Not sure yet",
            selectedCandidateId: null,
            requiresReason: false,
            emphasis: "secondary",
        });
        actions.push({
            decisionAction: "reject",
            label: kind === "child" ? "Different child" : "Different family",
            selectedCandidateId: null,
            requiresReason: false,
            emphasis: "secondary",
        });
    } else {
        actions.push({
            decisionAction: "create_new",
            label: kind === "child" ? "Create child" : `Create ${noun}`,
            selectedCandidateId: null,
            requiresReason: false,
            emphasis: "primary",
        });
        actions.push({
            decisionAction: "request_information",
            label: "Need more info",
            selectedCandidateId: null,
            requiresReason: false,
            emphasis: "secondary",
        });
    }
    return actions;
}

/** "After confirmation Alloy will:" — reflects the current per-subject decisions. */
function buildOutcome(resolutions: ReviewResolutionRaw[]): { text: string; pending: boolean }[] {
    const out: { text: string; pending: boolean }[] = [];
    for (const r of resolutions) {
        const name = fullName(r.provisional);
        if (r.subject_role === "parent") {
            if (r.decision_action === "link_existing") out.push({ text: `Link ${name}`, pending: false });
            else if (r.decision_action === "create_new") out.push({ text: `Create ${name}`, pending: false });
            else out.push({ text: `Confirm ${name || "the parent"}`, pending: true });
        } else if (r.subject_role === "child") {
            if (r.decision_action === "create_new") out.push({ text: `Create ${name} as a new child`, pending: false });
            else if (r.decision_action === "link_existing") out.push({ text: `Use the existing record for ${name}`, pending: false });
            else out.push({ text: `Confirm ${name || "the child"} before continuing`, pending: true });
        } else if (r.subject_role === "lead") {
            out.push({ text: "Create the enrollment lead", pending: false });
        }
    }
    return out;
}
