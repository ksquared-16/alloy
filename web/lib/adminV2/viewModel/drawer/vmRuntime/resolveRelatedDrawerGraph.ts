import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import type { AdminDrawerState, DrawerStackItem } from "@/contexts/AdminDrawerContext";
import { DRAWER_BACK_TO_LEAD_OPEN_SOURCE } from "@/contexts/AdminDrawerContext";
import { PERSON_DRAWER_CHILD_OPEN_SOURCE } from "@/lib/admin/drawer/personDrawerOpenSeed";
import type { PersonDrawerOpenSeed } from "@/lib/admin/drawer/personDrawerOpenSeed";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
import { resolveWarmDrawerTargetsFromOpportunityRecord } from "@/lib/adminV2/viewModel/drawer/opportunity/resolveWarmDrawerTargetsFromOpportunityRecord";
import {
    backToLeadOpportunityIdFromRecord,
    findBackToLeadOpportunityInStack,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/resolveBackToLeadOpportunity";

function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

export type RelatedDrawerGraphWarmTarget = {
    entityType: AdminDrawerEntityType;
    entityId: string;
    openSource: string;
    presentationEmphasis?: string | null;
    personDrawerOpenSeed?: PersonDrawerOpenSeed | null;
};

export type ResolvedRelatedDrawerGraph = {
    currentEntityId: string;
    backToLeadOpportunityId: string | null;
    backToLeadStackItem: DrawerStackItem | null;
    relatedPersonTargets: RelatedDrawerGraphWarmTarget[];
    relatedChildTargets: RelatedDrawerGraphWarmTarget[];
    siblingChildTargets: RelatedDrawerGraphWarmTarget[];
    warmTargets: RelatedDrawerGraphWarmTarget[];
};

function personSeed(
    personId: string,
    emphasis: PersonDrawerOpenSeed["presentation_emphasis"],
    opportunityId: string | null
): PersonDrawerOpenSeed {
    return {
        personId,
        presentation_emphasis: emphasis,
        opportunity_id: opportunityId ?? undefined,
    };
}

function addTarget(
    list: RelatedDrawerGraphWarmTarget[],
    seen: Set<string>,
    target: RelatedDrawerGraphWarmTarget
): void {
    const key = `${target.entityType}:${target.openSource}:${target.presentationEmphasis ?? ""}:${target.entityId}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push(target);
}

/**
 * Central resolver for linked drawer graph warm targets and Back to Lead pinning.
 */
export function resolveRelatedDrawerGraph(params: {
    drawer: AdminDrawerState;
    entityType: AdminDrawerEntityType;
    record: Record<string, unknown>;
    runtime: "opportunity" | "person" | "child";
    previousDrawer?: DrawerStackItem | null;
    stack?: DrawerStackItem[];
}): ResolvedRelatedDrawerGraph {
    const entityId = trimId(params.record.id) ?? trimId(params.drawer.id) ?? "";
    const ws = params.drawer.opportunityWorkspaceContext ?? null;
    const stack = params.stack ?? [];
    const seen = new Set<string>();
    const relatedPersonTargets: RelatedDrawerGraphWarmTarget[] = [];
    const relatedChildTargets: RelatedDrawerGraphWarmTarget[] = [];
    const siblingChildTargets: RelatedDrawerGraphWarmTarget[] = [];
    const warmTargets: RelatedDrawerGraphWarmTarget[] = [];

    const backStackItem = findBackToLeadOpportunityInStack(stack, params.drawer);
    const recordOppId = backToLeadOpportunityIdFromRecord(params.record, params.drawer.personDrawerOpenSeed);
    const stackOppId = backStackItem?.type === "opportunities" ? trimId(backStackItem.id) : null;
    const seedOppId = trimId(params.drawer.personDrawerOpenSeed?.opportunity_id);
    const prevOppId =
        params.previousDrawer?.type === "opportunities" ? trimId(params.previousDrawer.id) : null;
    const backToLeadOpportunityId = stackOppId || seedOppId || prevOppId || recordOppId;

    const pushWarm = (t: RelatedDrawerGraphWarmTarget) => {
        addTarget(warmTargets, seen, t);
    };

    if (params.entityType === "opportunities") {
        const oppId = trimId(params.record.id) ?? entityId;
        for (const t of resolveWarmDrawerTargetsFromOpportunityRecord(params.record)) {
            const isChild = t.presentationEmphasis === "child_lifecycle";
            const target: RelatedDrawerGraphWarmTarget = {
                entityType: "persons",
                entityId: t.personId,
                openSource: t.openSource,
                presentationEmphasis: t.presentationEmphasis,
                personDrawerOpenSeed: personSeed(
                    t.personId,
                    t.presentationEmphasis === "child_lifecycle" ?
                        "child_lifecycle"
                    :   t.presentationEmphasis === PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS ?
                        PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS
                    :   undefined,
                    oppId
                ),
            };
            if (isChild) {
                addTarget(relatedChildTargets, seen, target);
            } else {
                addTarget(relatedPersonTargets, seen, target);
            }
            pushWarm(target);
        }
    }

    if (params.entityType === "persons" && backToLeadOpportunityId && ws) {
        pushWarm({
            entityType: "opportunities",
            entityId: backToLeadOpportunityId,
            openSource: DRAWER_BACK_TO_LEAD_OPEN_SOURCE,
        });
    }

    if (params.runtime === "child") {
        const pinOppId = backToLeadOpportunityId;
        for (const raw of params.record._household_adult_links as unknown[] | undefined ?? []) {
            if (!raw || typeof raw !== "object") continue;
            const adultId = trimId((raw as { person_id?: unknown }).person_id);
            if (!adultId) continue;
            const target: RelatedDrawerGraphWarmTarget = {
                entityType: "persons",
                entityId: adultId,
                openSource: "person_household_link",
                personDrawerOpenSeed: personSeed(
                    adultId,
                    PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS,
                    pinOppId
                ),
            };
            addTarget(relatedPersonTargets, seen, target);
            pushWarm(target);
        }
        for (const raw of params.record._sibling_links as unknown[] | undefined ?? []) {
            if (!raw || typeof raw !== "object") continue;
            const siblingId = trimId((raw as { person_id?: unknown }).person_id);
            if (!siblingId) continue;
            const target: RelatedDrawerGraphWarmTarget = {
                entityType: "persons",
                entityId: siblingId,
                openSource: PERSON_DRAWER_CHILD_OPEN_SOURCE,
                presentationEmphasis: "child_lifecycle",
                personDrawerOpenSeed: personSeed(siblingId, "child_lifecycle", pinOppId),
            };
            addTarget(siblingChildTargets, seen, target);
            pushWarm(target);
        }
    }

    if (params.runtime === "person") {
        for (const raw of params.record._household_child_links as unknown[] | undefined ?? []) {
            if (!raw || typeof raw !== "object") continue;
            const childId = trimId((raw as { person_id?: unknown }).person_id);
            if (!childId) continue;
            const target: RelatedDrawerGraphWarmTarget = {
                entityType: "persons",
                entityId: childId,
                openSource: PERSON_DRAWER_CHILD_OPEN_SOURCE,
                presentationEmphasis: "child_lifecycle",
                personDrawerOpenSeed: personSeed(childId, "child_lifecycle", backToLeadOpportunityId),
            };
            addTarget(relatedChildTargets, seen, target);
            pushWarm(target);
        }
        for (const raw of params.record._household_adult_links as unknown[] | undefined ?? []) {
            if (!raw || typeof raw !== "object") continue;
            const adultId = trimId((raw as { person_id?: unknown }).person_id);
            if (!adultId) continue;
            const target: RelatedDrawerGraphWarmTarget = {
                entityType: "persons",
                entityId: adultId,
                openSource: "person_household_link",
                personDrawerOpenSeed: personSeed(
                    adultId,
                    PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS,
                    backToLeadOpportunityId
                ),
            };
            addTarget(relatedPersonTargets, seen, target);
            pushWarm(target);
        }
    }

    return {
        currentEntityId: entityId,
        backToLeadOpportunityId,
        backToLeadStackItem: backStackItem,
        relatedPersonTargets,
        relatedChildTargets,
        siblingChildTargets,
        warmTargets,
    };
}
