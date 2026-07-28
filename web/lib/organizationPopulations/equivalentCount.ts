/**
 * Equivalent Count — Σ weights over a population at room × effective date.
 * Aggregation happens here; OrgCalcExpr composes the scalar (one evaluator).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOperationalExpectationInputs } from "@/lib/childcareOperational/expectations/loadOperationalExpectationInputs";
import { expandExpectedAttendance } from "@/lib/childcareOperational/expectations/scheduleExpectationCore";
import {
    findPopulationVersion,
    loadOrgMetadata,
    parseOrganizationPopulations,
} from "@/lib/organizationPopulations/persist";
import type { PopulationVersion } from "@/lib/organizationPopulations/types";
import { applyWeightingFactor } from "@/lib/organizationWeightings/apply";
import {
    findWeightingVersion,
    parseOrganizationWeightings,
} from "@/lib/organizationWeightings/persist";
import type { WeightingVersion } from "@/lib/organizationWeightings/types";
import type { InputResolution } from "@/lib/organizationCalculations/evaluate";

export type PopulationMemberPreview = {
    customer_member_id: string;
    agreement_id: string;
    days_per_week: number;
    schedule_type_key: string;
    weight: number;
};

export type EquivalentCountResult = {
    value: number;
    memberCount: number;
    members: PopulationMemberPreview[];
    population: { id: string; name: string; version_number: number };
    weighting: { id: string; name: string; version_number: number };
    explanationLines: string[];
    resolution: InputResolution;
};

async function resolveRoomSiteId(
    supabase: SupabaseClient,
    orgId: string,
    roomLocationId: string,
): Promise<string | null> {
    const { data, error } = await supabase
        .from("locations")
        .select("id, parent_location_id, org_id")
        .eq("org_id", orgId)
        .eq("id", roomLocationId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Room not found in organization");
    return data.parent_location_id ? String(data.parent_location_id) : null;
}

function membersForExpectedInRoom(args: {
    entries: ReturnType<typeof expandExpectedAttendance>;
    patternsById: Map<string, { weekdays: number[]; schedule_type_key: string }>;
    roomLocationId: string;
    effectiveAt: string;
    weighting: WeightingVersion;
}): PopulationMemberPreview[] {
    const seen = new Set<string>();
    const members: PopulationMemberPreview[] = [];
    for (const e of args.entries) {
        if (e.date !== args.effectiveAt) continue;
        if (e.roomLocationId !== args.roomLocationId) continue;
        if (seen.has(e.customerMemberId)) continue;
        seen.add(e.customerMemberId);
        const pattern = args.patternsById.get(e.schedulePatternId);
        const days = pattern?.weekdays?.length ?? 0;
        const weight = applyWeightingFactor(args.weighting, {
            daysPerWeek: days,
            scheduleTypeKey: e.scheduleTypeKey,
        });
        members.push({
            customer_member_id: e.customerMemberId,
            agreement_id: e.agreementId,
            days_per_week: days,
            schedule_type_key: e.scheduleTypeKey,
            weight,
        });
    }
    return members;
}

export async function resolveEquivalentCountForRoom(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        roomLocationId: string;
        effectiveAt: string;
        populationVersionId: string;
        weightingVersionId: string;
    },
): Promise<EquivalentCountResult> {
    const metadata = await loadOrgMetadata(supabase, args.orgId);
    const populations = parseOrganizationPopulations(metadata);
    const weightings = parseOrganizationWeightings(metadata);
    const popHit = findPopulationVersion(populations, args.populationVersionId);
    const wgtHit = findWeightingVersion(weightings, args.weightingVersionId);
    if (!popHit) {
        return {
            value: 0,
            memberCount: 0,
            members: [],
            population: { id: "", name: "Unknown", version_number: 0 },
            weighting: { id: "", name: "Unknown", version_number: 0 },
            explanationLines: ["Population version is not available for this organization."],
            resolution: {
                value: null,
                upstreamStatus: "not_configured",
                note: "Population version not found",
            },
        };
    }
    if (!wgtHit) {
        return {
            value: 0,
            memberCount: 0,
            members: [],
            population: {
                id: popHit.population.id,
                name: popHit.population.name,
                version_number: popHit.version.version_number,
            },
            weighting: { id: "", name: "Unknown", version_number: 0 },
            explanationLines: ["Weighting version is not available for this organization."],
            resolution: {
                value: null,
                upstreamStatus: "not_configured",
                note: "Weighting version not found",
            },
        };
    }
    if (!popHit.version.immutable || !wgtHit.version.immutable) {
        return {
            value: 0,
            memberCount: 0,
            members: [],
            population: {
                id: popHit.population.id,
                name: popHit.population.name,
                version_number: popHit.version.version_number,
            },
            weighting: {
                id: wgtHit.weighting.id,
                name: wgtHit.weighting.name,
                version_number: wgtHit.version.version_number,
            },
            explanationLines: ["Only published population and weighting versions can be evaluated."],
            resolution: {
                value: null,
                upstreamStatus: "incomplete",
                note: "Draft population/weighting versions cannot back answers",
            },
        };
    }

    const siteLocationId = await resolveRoomSiteId(supabase, args.orgId, args.roomLocationId);
    if (!siteLocationId) {
        return {
            value: 0,
            memberCount: 0,
            members: [],
            population: {
                id: popHit.population.id,
                name: popHit.population.name,
                version_number: popHit.version.version_number,
            },
            weighting: {
                id: wgtHit.weighting.id,
                name: wgtHit.weighting.name,
                version_number: wgtHit.version.version_number,
            },
            explanationLines: ["Room site is required to resolve population membership."],
            resolution: {
                value: null,
                upstreamStatus: "incomplete",
                note: "Room site missing",
            },
        };
    }

    const loaded = await loadOperationalExpectationInputs(supabase, {
        orgId: args.orgId,
        siteLocationId,
    });
    const entries = expandExpectedAttendance({
        dateStart: args.effectiveAt,
        dateEnd: args.effectiveAt,
        agreements: loaded.agreements,
        placements: loaded.placements,
        assignments: loaded.assignments,
        patternsById: loaded.patternsById,
    });

    const patternsById = new Map<string, { weekdays: number[]; schedule_type_key: string }>();
    for (const [id, p] of loaded.patternsById.entries()) {
        patternsById.set(id, {
            weekdays: p.weekdays ?? [],
            schedule_type_key: p.schedule_type_key,
        });
    }

    const predicate = popHit.version.predicate;
    if (predicate !== "expected_in_room_on_date") {
        return {
            value: 0,
            memberCount: 0,
            members: [],
            population: {
                id: popHit.population.id,
                name: popHit.population.name,
                version_number: popHit.version.version_number,
            },
            weighting: {
                id: wgtHit.weighting.id,
                name: wgtHit.weighting.name,
                version_number: wgtHit.version.version_number,
            },
            explanationLines: [`Unsupported population predicate: ${predicate}`],
            resolution: {
                value: null,
                upstreamStatus: "not_configured",
                note: "Unsupported population predicate",
            },
        };
    }

    const members = membersForExpectedInRoom({
        entries,
        patternsById,
        roomLocationId: args.roomLocationId,
        effectiveAt: args.effectiveAt,
        weighting: wgtHit.version,
    });
    const value = members.reduce((sum, m) => sum + m.weight, 0);
    const rounded = Math.round(value * 1000) / 1000;

    const explanationLines = [
        `Population “${popHit.population.name}” v${popHit.version.version_number}: ${members.length} matching children.`,
        `Weighting “${wgtHit.weighting.name}” v${wgtHit.version.version_number}: ${wgtHit.version.summary}.`,
        `Equivalent count = ${rounded}.`,
    ];

    return {
        value: rounded,
        memberCount: members.length,
        members,
        population: {
            id: popHit.population.id,
            name: popHit.population.name,
            version_number: popHit.version.version_number,
        },
        weighting: {
            id: wgtHit.weighting.id,
            name: wgtHit.weighting.name,
            version_number: wgtHit.version.version_number,
        },
        explanationLines,
        resolution: {
            value: rounded,
            upstreamStatus: "resolved",
            note: explanationLines.join(" "),
        },
    };
}

export function collectEquivalentCountBindings(expr: unknown): Array<{
    populationVersionId: string;
    weightingVersionId: string;
}> {
    const out: Array<{ populationVersionId: string; weightingVersionId: string }> = [];
    const seen = new Set<string>();
    function walk(node: unknown) {
        if (node == null || typeof node !== "object") return;
        const rec = node as Record<string, unknown>;
        if (
            rec.kind === "equivalent_count"
            && typeof rec.population_version_id === "string"
            && typeof rec.weighting_version_id === "string"
        ) {
            const key = `${rec.population_version_id}::${rec.weighting_version_id}`;
            if (!seen.has(key)) {
                seen.add(key);
                out.push({
                    populationVersionId: rec.population_version_id,
                    weightingVersionId: rec.weighting_version_id,
                });
            }
        }
        for (const v of Object.values(rec)) {
            if (Array.isArray(v)) v.forEach(walk);
            else walk(v);
        }
    }
    walk(expr);
    return out;
}

export type { PopulationVersion, WeightingVersion };
