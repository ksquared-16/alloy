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
export function derivePersonEmploymentCard(
    signal: OperationalEmploymentSignal | null,
): FocusPanelCardModel {
    const lead = signal?.primary ?? signal?.people[0] ?? null;
    const employment = lead?.employment ?? null;
    const current = employment?.current ?? null;

    if (!employment) {
        return {
            key: "employment",
            archetype: system5ArchetypeForCard("employment"),
            iconName: system5IconForCard("employment"),
            title: cardTitle("employment") ?? "Employment",
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
        key: "employment",
        archetype: system5ArchetypeForCard("employment"),
        iconName: system5IconForCard("employment"),
        title: cardTitle("employment") ?? "Employment",
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
    if (cardAppliesToGrain("employment", "person")) {
        cards.set("employment", derivePersonEmploymentCard(input.employment));
    }
    return cards;
}
