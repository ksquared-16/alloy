import type { CrmCompactRowSemanticSlots, QueueItemVm } from "@/lib/ui-v2/workspace-types";

/**
 * Compressed queue row — display field resolution (Alloy OS).
 *
 * Pure + unit-tested. Derives the fields for the fixed-height (76px / max 80px) compressed
 * record card from already-resolved row data. Grain-aware four-line, two-column layout:
 * a left/main column (up to 4 text lines) and a right column (status pill + optional cue).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * CONFIG-READINESS (compatibility layer — NOT final architecture):
 *   The defaults below implement the {@link CompressedQueueRowLayout} contract for the two
 *   built-in grains. Field SELECTION + order should later be owned by **Experience Builder /
 *   queue layout config** (a `queue_row_layout` per perspective). Child display rules (how
 *   many child names, age format, overflow "+N") should become configurable. Search / filter /
 *   group / sort options belong to **Perspective config**. Nothing here is enrollment-specific;
 *   it is grain-driven.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** Logical fields a compressed row can surface. Future: chosen + ordered by queue layout config. */
export type CompressedQueueRowFieldKey =
    | "identity"
    | "status"
    | "primaryContact"
    | "children"
    | "age"
    | "household"
    | "program"
    | "room"
    | "location"
    | "attention"
    | "workCue";

/** Avatar rendering mode (future config). */
export type CompressedQueueRowAvatarMode = "none" | "initial" | "icon";

/** Right-column count semantics — what a count, if shown, actually counts. */
export type CompressedQueueRowBadgeMode = "none" | "children" | "work" | "alerts";

export type CompressedQueueRowDensity = "compact" | "standard";

/**
 * Future queue row configuration contract (NOT yet wired to a settings UI). Experience
 * Builder will emit one of these per perspective/grain; the presenter already renders the
 * shape this describes, so converting to config is a data swap, not a redesign.
 */
export interface CompressedQueueRowLayout {
    /** Line 1 primary identity field. */
    primaryField: CompressedQueueRowFieldKey;
    /** Line 1 right-aligned status field. */
    statusField: CompressedQueueRowFieldKey;
    /** Line 2 field list (joined with " · "). */
    line2Fields: CompressedQueueRowFieldKey[];
    /** Line 3 field list. */
    line3Fields: CompressedQueueRowFieldKey[];
    /** Line 4 field list. */
    line4Fields: CompressedQueueRowFieldKey[];
    /** Right column fields below the status pill (count cue, etc.). */
    rightColumnFields: CompressedQueueRowFieldKey[];
    avatarMode: CompressedQueueRowAvatarMode;
    badgeMode: CompressedQueueRowBadgeMode;
    /** Hard cap on main-column text lines (anatomy = 4). */
    maxLines: number;
    density: CompressedQueueRowDensity;
}

/** Default compatibility layout for family / household / case grain. */
export const DEFAULT_FAMILY_COMPRESSED_ROW_LAYOUT: CompressedQueueRowLayout = {
    primaryField: "identity",
    statusField: "status",
    line2Fields: ["primaryContact"],
    line3Fields: ["children"],
    line4Fields: ["location", "workCue"],
    rightColumnFields: ["children"],
    avatarMode: "initial",
    badgeMode: "children",
    maxLines: 4,
    density: "standard",
};

/** Default compatibility layout for child grain. */
export const DEFAULT_CHILD_COMPRESSED_ROW_LAYOUT: CompressedQueueRowLayout = {
    primaryField: "identity",
    statusField: "status",
    line2Fields: ["age", "household"],
    line3Fields: ["program", "room"],
    line4Fields: ["location", "attention"],
    rightColumnFields: [],
    avatarMode: "initial",
    badgeMode: "none",
    maxLines: 4,
    density: "standard",
};

export type CompressedQueueRowDisplay = {
    /** Line 1 — primary identity. */
    identity: string;
    /** Line 1 right — status pill. */
    statusLabel: string | null;
    /** Line 2. */
    line2: string | null;
    /** Line 3. */
    line3: string | null;
    /** Line 4. */
    line4: string | null;
    /** Right column count cue — reserved for future config; not rendered in compat layer (line 3 owns children). */
    rightCountLabel: string | null;
    /** Whether line 4 carries an attention/work cue (drives subtle accent). */
    attention: boolean;
    /** Resolved row grain for avatar + layout selection. */
    grain: "case" | "child" | "candidate" | null;
};

function firstNonEmpty(...values: (string | null | undefined)[]): string | null {
    for (const value of values) {
        const trimmed = value?.trim();
        if (trimmed) return trimmed;
    }
    return null;
}

/** Join non-empty parts with a middot separator. */
function joinMeta(...parts: (string | null | undefined)[]): string | null {
    const kept = parts.map((p) => p?.trim()).filter((p): p is string => Boolean(p));
    return kept.length ? kept.join(" · ") : null;
}

/** First structured child label (backend may include age suffix on `primary`, e.g. "Alex (5y)"). */
export function firstChildLabel(
    childrenLines: CrmCompactRowSemanticSlots["childrenLines"],
): string | null {
    return childrenLines?.[0]?.primary?.trim() ?? null;
}

/**
 * Children inline summary for the children line — names with whatever age suffix the backend
 * supplied, joined with " · ", with "+N more" overflow when more than `maxNames` exist.
 * Example: `Emyrson Wright (4y) · Mckenzie Wright (2y)` or `Emyrson (4y) · Mckenzie (2y) +1 more`.
 *
 * CONFIG-READINESS: `maxNames` (children display max) should become Experience Builder
 * queue-row config per perspective/grain; 2 is the default compatibility value.
 */
export function formatChildrenInline(
    childrenLines: CrmCompactRowSemanticSlots["childrenLines"],
    maxNames = 2,
): string | null {
    if (!childrenLines || childrenLines.length === 0) return null;
    const names = childrenLines
        .map((c) => c.primary?.trim())
        .filter((n): n is string => Boolean(n));
    if (names.length === 0) return null;
    const shown = names.slice(0, maxNames).join(" · ");
    const extra = names.length - Math.min(maxNames, names.length);
    return extra > 0 ? `${shown} +${extra} more` : shown;
}

/** Clear, labeled child count for the right column (never an ambiguous bare badge). */
export function childCountLabel(
    childrenLines: CrmCompactRowSemanticSlots["childrenLines"],
): string | null {
    const n = childrenLines?.length ?? 0;
    if (n < 2) return null;
    return `${n} children`;
}

export function resolveCompressedQueueRowDisplay(
    item: Pick<QueueItemVm, "title" | "subtitle" | "rowGrain">,
    crm: CrmCompactRowSemanticSlots | null | undefined,
    cue?: { rightCue: string | null } | null,
): CompressedQueueRowDisplay {
    const grain = item.rowGrain ?? null;
    const statusLabel = firstNonEmpty(crm?.statusLabel, crm?.stageLabel);
    const workCue = firstNonEmpty(
        crm?.attentionReason,
        crm?.operationalNextHint,
        crm?.nextStep,
        cue?.rightCue,
    );

    if (grain === "child") {
        // Child grain: name / age·household / program·room / location·attention.
        const identity = firstNonEmpty(crm?.childName, crm?.primaryIdentity, item.title) ?? "Untitled record";
        const household =
            crm?.primaryIdentity && crm.primaryIdentity.trim() !== identity ? crm.primaryIdentity : null;
        const line2 = joinMeta(crm?.ageContext, household);
        const line3 = joinMeta(crm?.programContext, crm?.roomContext);
        const line4 = joinMeta(crm?.locationContext, workCue);
        return {
            identity,
            statusLabel,
            line2,
            line3,
            line4,
            rightCountLabel: null,
            attention: Boolean(workCue),
            grain,
        };
    }

    // Family / household / case grain (and candidate).
    const identity = firstNonEmpty(crm?.primaryIdentity, item.title) ?? "Untitled record";
    const primaryContact = firstNonEmpty(crm?.contactDisplayName, crm?.contactSnippet);
    const children = formatChildrenInline(crm?.childrenLines);
    const line2 = primaryContact ?? item.subtitle?.trim() ?? null;
    const line3 = children;
    const line4 = joinMeta(firstNonEmpty(crm?.locationContext, crm?.roomContext), workCue);
    return {
        identity,
        statusLabel,
        line2,
        line3,
        line4,
        rightCountLabel: childCountLabel(crm?.childrenLines),
        attention: Boolean(workCue),
        grain,
    };
}
