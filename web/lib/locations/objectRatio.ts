/**
 * Staffing ratio, as a director reads and writes it on the operational space.
 *
 * A director says "one staff for up to five children, two for up to eleven" and
 * writes it `1:5 · 2:11`. The canonical model already holds exactly that — a
 * ratio rule with ordered tiers of `(required_staff, max_children)` — so nothing
 * here invents a second representation. What this module does is translate
 * between the director's grammar and the canonical one, in both directions, and
 * decide what one Save means.
 *
 * THE GRAMMAR IS THE BUG. The advanced screen rendered a tier as
 * `1:${required_staff} ≤ ${max_children}`, so *one staff for up to five
 * children* printed as `1:1 ≤ 5` — the staff count landed in the ratio's second
 * position, and `1:5` became unsayable. The canonical rows were right the whole
 * time. `formatRatioTier` is the single place that grammar is decided now.
 *
 * TIERS ARE NOT ONE RATIO REPEATED. `2:11` is deliberately not `2:10`: the
 * second adult does not add another whole five. Flattening tiers to a single
 * ratio would silently discard that, which is why there is no single-ratio path
 * through this module at all.
 *
 * Pure functions only. No IO, no Supabase client, no UI dependency.
 */

import { compareIsoDates } from "@/lib/childcareOperational/effectiveDating";
import { chooseObjectEditTransition } from "@/lib/locations/objectEditLifecycle";
import { isRuleEffectiveOn } from "@/lib/childcareOperational/config/resolveConfigRule";
import { sortRatioTiers } from "@/lib/childcareOperational/config/ratioRules";
import type {
    ChildcareRatioRuleRow,
    ChildcareRatioRuleTierRow,
} from "@/lib/childcareOperational/config/configRuleTypes";

/** One staffing threshold, in the director's terms. */
export type RatioTierValue = { requiredStaff: number; maxChildren: number };

/** `1:5` — staff first, children second, which is how the operator says it. */
export function formatRatioTier(tier: RatioTierValue): string {
    return `${tier.requiredStaff}:${tier.maxChildren}`;
}

/** `1:5 · 2:11` — the compact read form. */
export function formatRatioTiers(tiers: readonly RatioTierValue[]): string {
    return tiers.map(formatRatioTier).join(" · ");
}

/** Canonical tier rows in the director's shape, lowest threshold first. */
export function tiersOfRule(
    tiers: readonly ChildcareRatioRuleTierRow[],
    ruleId: string
): RatioTierValue[] {
    return sortRatioTiers(tiers.filter((t) => t.ratio_rule_id === ruleId)).map((t) => ({
        requiredStaff: t.required_staff,
        maxChildren: t.max_children,
    }));
}

/**
 * The ratio rule an ordinary edit maintains for one operational space.
 *
 * Room-scoped and age-agnostic, for the same reason capacity is: an
 * age-specific or program-wide rule is a narrower or broader claim than "this
 * group staffs like this", and the object field neither reads nor writes one.
 */
export function currentObjectRatioRule(
    rules: readonly ChildcareRatioRuleRow[],
    roomLocationId: string,
    todayYmd: string
): ChildcareRatioRuleRow | null {
    const applicable = rules.filter(
        (r) =>
            r.scope_type === "room" &&
            r.room_location_id === roomLocationId &&
            (r.age_group_key ?? null) === null &&
            isRuleEffectiveOn(r, todayYmd)
    );
    if (applicable.length === 0) return null;
    return [...applicable].sort((a, b) => {
        const byStart = compareIsoDates(b.effective_start, a.effective_start);
        if (byStart !== 0) return byStart;
        return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    })[0];
}

// ---------------------------------------------------------------------------
// The legacy string
// ---------------------------------------------------------------------------

/**
 * Parse `locations.metadata.student_teacher_ratio`.
 *
 * Measured shapes in deployed data: `"1:5"`, `"1:5,2:11"`, `"1:7,2:15"`. The
 * separator is a comma and the pair is staff:children — the same grammar the
 * operator uses, which is why the legacy string reads correctly to a human and
 * the canonical screen did not.
 *
 * Anything that does not parse cleanly returns null rather than a guess. A
 * half-understood staffing claim is worse than an unread one.
 */
export function parseLegacyRatio(raw: unknown): RatioTierValue[] | null {
    if (typeof raw !== "string") return null;
    const text = raw.trim();
    if (!text) return null;
    const parts = text.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    const tiers: RatioTierValue[] = [];
    for (const part of parts) {
        const m = /^(\d+)\s*:\s*(\d+)$/.exec(part);
        if (!m) return null;
        const requiredStaff = Number(m[1]);
        const maxChildren = Number(m[2]);
        if (requiredStaff <= 0 || maxChildren <= 0) return null;
        tiers.push({ requiredStaff, maxChildren });
    }
    return sortTierValues(tiers);
}

export function sortTierValues(tiers: readonly RatioTierValue[]): RatioTierValue[] {
    return [...tiers].sort((a, b) => a.maxChildren - b.maxChildren || a.requiredStaff - b.requiredStaff);
}

export function sameTiers(a: readonly RatioTierValue[], b: readonly RatioTierValue[]): boolean {
    const x = sortTierValues(a);
    const y = sortTierValues(b);
    if (x.length !== y.length) return false;
    return x.every((t, i) => t.requiredStaff === y[i].requiredStaff && t.maxChildren === y[i].maxChildren);
}

/** The provenance that proves a human established this ratio through the object editor. */
export const RATIO_OBJECT_EDITOR_PROVENANCE = "object_editor";

/** Did a person explicitly author this rule on the space itself? */
export function isOperatorConfirmedRatioRule(rule: ChildcareRatioRuleRow | null | undefined): boolean {
    const via = (rule?.metadata as Record<string, unknown> | undefined)?.authored_via;
    return via === RATIO_OBJECT_EDITOR_PROVENANCE;
}

/**
 * How the two records of one space's ratio stand to each other.
 *
 * LEGACY EVIDENCE IS MIGRATION PROVENANCE, NOT A PERMANENT COMPARATOR. Once a
 * person has explicitly authored the canonical ratio on the space, the question
 * "which of these is right" has been answered, and continuing to ask it turns a
 * migration artefact into a standing warning. Infant A showed the failure
 * exactly: canonical `1:5 · 2:11 · 3:18`, authored by hand, still reported as
 * needing review against the `1:5 · 2:11` it was authored from.
 *
 * `confirmed` is decided by PROVENANCE ALONE — never by the numbers. Tiers that
 * happen to agree, or a legacy value that happens to be a prefix of the
 * canonical one, prove nothing about whether a human looked: an extra tier can
 * be a real staffing change. Only `authored_via` settles it.
 *
 * `conflict` remains for the case no one has answered: two records, no evidence
 * a person chose between them.
 */
export type ObjectRatioStanding =
    | { state: "none" }
    /** A person authored this ratio on the space. Current truth; no review. */
    | { state: "confirmed"; ruleId: string; tiers: RatioTierValue[]; legacyRaw: string | null }
    | { state: "canonical_only"; ruleId: string; tiers: RatioTierValue[] }
    | { state: "legacy_only"; legacy: RatioTierValue[]; legacyRaw: string }
    | { state: "agree"; ruleId: string; tiers: RatioTierValue[]; legacyRaw: string }
    | {
          state: "conflict";
          ruleId: string;
          tiers: RatioTierValue[];
          legacy: RatioTierValue[];
          legacyRaw: string;
      }
    /** A legacy value exists but is not in a shape we are willing to read. */
    | { state: "legacy_unreadable"; legacyRaw: string };

export function resolveObjectRatioStanding(input: {
    rules: readonly ChildcareRatioRuleRow[];
    tierRows: readonly ChildcareRatioRuleTierRow[];
    roomLocationId: string;
    legacyRaw: unknown;
    todayYmd: string;
}): ObjectRatioStanding {
    const rule = currentObjectRatioRule(input.rules, input.roomLocationId, input.todayYmd);
    const canonical = rule ? tiersOfRule(input.tierRows, rule.id) : null;
    const rawText =
        typeof input.legacyRaw === "string" && input.legacyRaw.trim() ? input.legacyRaw.trim() : null;
    const legacy = parseLegacyRatio(input.legacyRaw);

    if (!rule || !canonical || canonical.length === 0) {
        if (!rawText) return { state: "none" };
        return legacy ?
                { state: "legacy_only", legacy, legacyRaw: rawText }
            :   { state: "legacy_unreadable", legacyRaw: rawText };
    }
    // Explicit authorship settles the migration, whatever the legacy value says.
    if (isOperatorConfirmedRatioRule(rule)) {
        return { state: "confirmed", ruleId: rule.id, tiers: canonical, legacyRaw: rawText };
    }
    if (!rawText) return { state: "canonical_only", ruleId: rule.id, tiers: canonical };
    if (!legacy) return { state: "canonical_only", ruleId: rule.id, tiers: canonical };
    if (sameTiers(canonical, legacy)) {
        return { state: "agree", ruleId: rule.id, tiers: canonical, legacyRaw: rawText };
    }
    return { state: "conflict", ruleId: rule.id, tiers: canonical, legacy, legacyRaw: rawText };
}

/** Does this space need a human to decide which staffing record is true? */
export function ratioNeedsReview(standing: ObjectRatioStanding): boolean {
    return standing.state === "conflict" || standing.state === "legacy_only" || standing.state === "legacy_unreadable";
}

/** The tiers to show in read state, or null when there is nothing canonical yet. */
export function readObjectRatioTiers(standing: ObjectRatioStanding): RatioTierValue[] | null {
    switch (standing.state) {
        case "confirmed":
        case "canonical_only":
        case "agree":
        case "conflict":
            return standing.tiers;
        default:
            return null;
    }
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export type ObjectRatioPlan =
    | { action: "noop" }
    | { action: "create"; tiers: RatioTierValue[]; effectiveStart: string }
    | { action: "version"; priorId: string; tiers: RatioTierValue[]; effectiveStart: string }
    | { action: "replace_same_day"; retireId: string; tiers: RatioTierValue[]; effectiveStart: string }
    | { action: "retire"; id: string; effectiveEnd: string };

/**
 * Decide the canonical lifecycle operation behind one ordinary ratio Save.
 *
 * Same four shapes as capacity, for the same reasons — including the same-day
 * replacement, because a version may not start on its predecessor's own start
 * date and a rule already in effect cannot be voided.
 */
export function planObjectRatioWrite(input: {
    rules: readonly ChildcareRatioRuleRow[];
    tierRows: readonly ChildcareRatioRuleTierRow[];
    roomLocationId: string;
    tiers: readonly RatioTierValue[];
    todayYmd: string;
}): ObjectRatioPlan {
    const current = currentObjectRatioRule(input.rules, input.roomLocationId, input.todayYmd);
    const next = sortTierValues(input.tiers);

    if (next.length === 0) {
        return current ? { action: "retire", id: current.id, effectiveEnd: input.todayYmd } : { action: "noop" };
    }
    if (!current) return { action: "create", tiers: next, effectiveStart: input.todayYmd };

    const currentTiers = tiersOfRule(input.tierRows, current.id);
    if (sameTiers(currentTiers, next)) return { action: "noop" };

    // Ask the canonical store whether a supersede from today is legal, rather
    // than guessing from the start date alone. A rule that is still in force
    // today but CLOSES today cannot be versioned from today — Infant A hit that
    // and the operator was shown the store's version-constraint error while
    // editing an ordinary ratio.
    const transition = chooseObjectEditTransition({
        priorStart: current.effective_start,
        priorEnd: current.effective_end,
        todayYmd: input.todayYmd,
    });
    if (transition === "replace_same_day") {
        return { action: "replace_same_day", retireId: current.id, tiers: next, effectiveStart: input.todayYmd };
    }
    return { action: "version", priorId: current.id, tiers: next, effectiveStart: input.todayYmd };
}

/**
 * Validate a tier set the operator typed.
 *
 * Refuses rather than repairs. Two tiers that permit the same child count are
 * ambiguous about which staffing applies, and more staff covering fewer children
 * is almost certainly a transposed pair — both are better questioned than
 * silently sorted into something plausible.
 */
export function validateRatioTiers(
    tiers: readonly RatioTierValue[]
): { ok: true; tiers: RatioTierValue[] } | { ok: false; message: string } {
    if (tiers.length === 0) return { ok: true, tiers: [] };
    for (const t of tiers) {
        if (!Number.isInteger(t.requiredStaff) || !Number.isInteger(t.maxChildren)) {
            return { ok: false, message: "Staff and children must both be whole numbers." };
        }
        if (t.requiredStaff <= 0) return { ok: false, message: "Every step needs at least one staff member." };
        if (t.maxChildren <= 0) return { ok: false, message: "Every step needs at least one child." };
    }
    const sorted = sortTierValues(tiers);
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].maxChildren === sorted[i - 1].maxChildren) {
            return {
                ok: false,
                message: `Two steps both stop at ${sorted[i].maxChildren} children. Give each step a different number of children.`,
            };
        }
        if (sorted[i].requiredStaff <= sorted[i - 1].requiredStaff) {
            return {
                ok: false,
                message: "Each step up in children should need more staff, not the same or fewer.",
            };
        }
    }
    return { ok: true, tiers: sorted };
}
