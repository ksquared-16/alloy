/**
 * PERSON-GRAIN CARD MODELS.
 *
 * The person counterpart of `deriveOpportunityFocusPanelCards` — and deliberately ~1% of its size,
 * because a durable Person V1 has exactly one card with canonical Person truth: Employment.
 *
 * ── SPARSE IS THE CORRECT ANSWER ──
 *
 * The temptation is to carry `current_work`, `household` and `children` across so the panel looks
 * full. Those are case facts. A staff member has no case, usually no household and no children, so
 * those cards would render empty shells asserting relationships that do not exist — which is worse
 * than an absent card, because an empty card is a claim.
 *
 * ── THE GRAIN CONCERN IS THE GATE, NOT THIS MODULE ──
 *
 * This module builds models only for keys the registry says apply to `person`. It never widens
 * applicability on its own: if a key is not declared for the person grain it is skipped here, so
 * "which cards exist on this surface" has ONE authority (`focusPanelCardRegistry`) rather than two
 * that can disagree.
 *
 * Employment MEANING is not computed here. `is_staff`, `current`, `state_label` and the configured
 * facts all arrive decided by `lib/employment`; this module only phrases them.
 *
 * Nor is PRESENTATION invented here. Title, archetype and icon come from the same platform helpers
 * the case derivation uses (`cardTitle`, `system5ArchetypeForCard`, `system5IconForCard`), keyed by
 * card — so the Employment card looks like itself on both surfaces. Hardcoding them here would have
 * been two answers for one card, and they would have drifted at the first System 5 change.
 */

import { cardAppliesToGrain, cardTitle } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { system5ArchetypeForCard } from "@/lib/adminV2/runtime/focusPanel/system5CardArchetypes";
import { system5IconForCard } from "@/lib/adminV2/runtime/focusPanel/system5OperationalSurfaceSpec";
import type {
    FocusPanelCardKey,
    FocusPanelCardModel,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalEmploymentSignal } from "@/lib/adminV2/runtime/operationalContext/types";

function trimOrNull(v: unknown): string | null {
    const s = v != null ? String(v).trim() : "";
    return s || null;
}

/**
 * The Employment card model for a durable Person.
 *
 * The insight is the same sentence the case-grain derivation produces — "who, in what capacity,
 * where" — minus the name, because on a person's own panel the name is the surface's subject and
 * repeating it inside the card is noise.
 *
 * `visible: false` when the signal is absent (never employed): the readiness contract turns that
 * into `not_applicable`, so the configured cell is KEPT and renders its muted treatment rather than
 * disappearing or claiming employment.
 */
/**
 * THE PERSON-GRAIN STAFF CARD.
 *
 * Same composition, same presentation, canonical identity. `staff` supersedes `employment` on the
 * person grain (registry SUPERSESSION concern), so this is what a durable Person composes.
 *
 * It is deliberately NOT a fuller re-implementation: the Employment presentation already answers
 * "who is this employee, in what capacity, where, and in what state" in the order an operator reads
 * it — headline, current period, configured facts, history. Rebuilding those sections under a new
 * name would have created a second presentation of one owner's truth, which is the thing this
 * supersession exists to prevent. What changes is identity and placement, not the facts.
 *
 * Scheduling stays separate. "When and where are they scheduled" is `scheduling`'s question, and
 * folding a schedule projection in here would introduce a second scheduling resolver.
 */
export function derivePersonStaffCard(
    signal: OperationalEmploymentSignal | null,
): FocusPanelCardModel {
    return buildPersonEmploymentPresentation(signal, "staff");
}

export function derivePersonEmploymentCard(
    signal: OperationalEmploymentSignal | null,
): FocusPanelCardModel {
    return buildPersonEmploymentPresentation(signal, "employment");
}

function buildPersonEmploymentPresentation(
    signal: OperationalEmploymentSignal | null,
    key: Extract<FocusPanelCardKey, "employment" | "staff">,
): FocusPanelCardModel {
    const lead = signal?.primary ?? signal?.people[0] ?? null;
    const employment = lead?.employment ?? null;
    const current = employment?.current ?? null;

    if (!employment) {
        return {
            key,
            archetype: system5ArchetypeForCard(key),
            iconName: system5IconForCard(key),
            title: cardTitle(key) ?? "Employment",
            insight: "This person has never worked here",
            tier: "reference",
            span: 2,
            density: "compact",
            primaryAction: null,
            visible: false,
        };
    }

    let insight: string;
    if (current) {
        const role = trimOrNull(current.position_label) ?? "Staff";
        const where = trimOrNull(current.primary_location_label);
        insight = `${role}${where ? ` at ${where}` : ""}`;
    } else {
        const role = trimOrNull(employment.periods[0]?.position_label);
        insight = role ? `Formerly ${role}` : "No longer works here";
    }

    return {
        key,
        archetype: system5ArchetypeForCard(key),
        iconName: system5IconForCard(key),
        title: cardTitle(key) ?? "Employment",
        insight,
        secondaryInsight: trimOrNull(current?.employment_type_label),
        tier: "reference",
        span: 2,
        density: "compact",
        statusChip: trimOrNull(current?.state_label),
        statusTone: current && employment.is_staff ? "ready" : "neutral",
        // Read-only, exactly as at case grain. Add / Edit / End employment are operator capabilities
        // elsewhere; offering them here would be a second execution path for one capability.
        primaryAction: null,
        visible: true,
    };
}

/**
 * THE QUALIFICATIONS CARD MODEL — a content-free shell.
 *
 * Unlike the Staff card, this one carries no facts: the component addresses its own read from the
 * employment id in the operational context and resolves standing against the ORGANISATION's day,
 * server-side. Deriving any of that here would be a second resolver for one answer, and a stored
 * count would be wrong the moment a credential expired overnight.
 *
 * `visible: false` when the person has never worked here, matching the Staff card: a qualification
 * hangs off an employment, so with no employment there is nothing for the card to be about. The
 * readiness contract turns that into `not_applicable`, which keeps the configured cell and renders
 * its muted treatment rather than asserting an absence.
 *
 * ── WHY THIS EXISTS AT ALL ──
 *
 * Declaring the card for the `person` grain and placing it on the person composition was not
 * enough. This module is a THIRD gate: it builds models only for keys it has a branch for, so a
 * card that is declared and placed but not derived composes nothing and the panel renders it as if
 * it had never been added. That is exactly what shipped, and mounted QA on deployed staging is what
 * caught it.
 */
export function derivePersonQualificationsCard(
    signal: OperationalEmploymentSignal | null,
): FocusPanelCardModel {
    const key: FocusPanelCardKey = "staff_qualifications";
    const lead = signal?.primary ?? signal?.people[0] ?? null;
    const employment = lead?.employment ?? null;
    return {
        key,
        archetype: system5ArchetypeForCard(key),
        iconName: system5IconForCard(key),
        title: cardTitle(key) ?? "Qualifications",
        // The component replaces this the moment its own read resolves. It is phrased as a pending
        // state rather than an answer, because an absent read is not "nothing held".
        insight: employment ? "Reading qualifications…" : "This person has never worked here",
        tier: "reference",
        span: 2,
        density: "compact",
        primaryAction: null,
        visible: Boolean(employment),
    };
}

/**
 * THE AVAILABILITY CARD MODEL — a content-free shell, like Qualifications.
 *
 * The component addresses its own read and resolves the answer against the
 * organisation's day server-side. Deriving a summary here would be a second
 * resolver for one question, and it would be stale the morning an exception took
 * effect.
 */
export function derivePersonAvailabilityCard(
    signal: OperationalEmploymentSignal | null,
): FocusPanelCardModel {
    const key: FocusPanelCardKey = "staff_availability";
    const lead = signal?.primary ?? signal?.people[0] ?? null;
    const employment = lead?.employment ?? null;
    return {
        key,
        archetype: system5ArchetypeForCard(key),
        iconName: system5IconForCard(key),
        title: cardTitle(key) ?? "Availability",
        insight: employment ? "Reading availability…" : "This person has never worked here",
        tier: "reference",
        span: 2,
        density: "compact",
        primaryAction: null,
        visible: Boolean(employment),
    };
}

export type DerivePersonFocusPanelCardsInput = {
    employment: OperationalEmploymentSignal | null;
};

/**
 * Every person-grain card model, keyed by card. Only keys the registry declares for `person` are
 * built; anything else is omitted deterministically, never emitted as an empty shell.
 */
export function derivePersonFocusPanelCards(
    input: DerivePersonFocusPanelCardsInput,
): Map<FocusPanelCardKey, FocusPanelCardModel> {
    const cards = new Map<FocusPanelCardKey, FocusPanelCardModel>();
    // `staff` is the person-grain identity; `employment` no longer declares this grain, so the
    // registry answers "no" for it and exactly one of the two ever composes here.
    if (cardAppliesToGrain("staff", "person")) {
        cards.set("staff", derivePersonStaffCard(input.employment));
    }
    if (cardAppliesToGrain("employment", "person")) {
        cards.set("employment", derivePersonEmploymentCard(input.employment));
    }
    // Qualifications is a separate question on a separate clock, so it is a separate model rather
    // than a section inside Staff. The registry is still the gate — this only phrases a key it
    // already declares for `person`.
    if (cardAppliesToGrain("staff_qualifications", "person")) {
        cards.set("staff_qualifications", derivePersonQualificationsCard(input.employment));
    }
    // When they can work is a third question on a third clock — a separate model,
    // gated by the registry exactly as the other two are.
    if (cardAppliesToGrain("staff_availability", "person")) {
        cards.set("staff_availability", derivePersonAvailabilityCard(input.employment));
    }
    return cards;
}
