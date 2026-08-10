import type { GlobalRecordSearchCluster, GlobalRecordSearchHit } from "@/lib/admin/globalSearch/globalRecordSearchTypes";

function clusterKeyForHit(hit: GlobalRecordSearchHit): string | null {
    if (hit.cluster_key) return hit.cluster_key;
    const customerId = String(hit.customer_id ?? "").trim();
    const oppId = String(hit.opportunity_id ?? "").trim();
    if (customerId && oppId) return `${customerId}:${oppId}`;
    if (customerId) return customerId;
    return null;
}

function pickSharedLabel(hits: GlobalRecordSearchHit[], field: keyof GlobalRecordSearchHit): string | null {
    for (const hit of hits) {
        const v = hit[field];
        if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
}

/** Group household-related hits for scannable family context (Phase 1.1). */
export function buildGlobalSearchFamilyClusters(hits: GlobalRecordSearchHit[]): GlobalRecordSearchCluster[] {
    const byKey = new Map<string, GlobalRecordSearchHit[]>();
    const unclustered: GlobalRecordSearchHit[] = [];

    for (const hit of hits) {
        if (hit.group === "locations") {
            unclustered.push(hit);
            continue;
        }
        const key = clusterKeyForHit(hit);
        if (!key) {
            unclustered.push(hit);
            continue;
        }
        const list = byKey.get(key) ?? [];
        list.push(hit);
        byKey.set(key, list);
    }

    const clusters: GlobalRecordSearchCluster[] = [];

    for (const [key, members] of byKey) {
        const leadHit = members.find((h) => h.group === "leads") ?? null;
        const children = members.filter((h) => h.group === "children");
        const parents = members.filter((h) => h.group === "parents");
        const anchors = leadHit ? [leadHit] : [];

        if (!anchors.length && !children.length && !parents.length) continue;

        clusters.push({
            key,
            household_name: pickSharedLabel(members, "household_name"),
            lead_short_label: leadHit?.lead_short_label ?? pickSharedLabel(members, "lead_short_label"),
            location_label: pickSharedLabel(members, "location_label"),
            status_label: pickSharedLabel(
                [leadHit, ...children, ...parents].filter(Boolean) as GlobalRecordSearchHit[],
                "status_label"
            ),
            anchors,
            children: children.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
            parents: parents.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
        });
    }

    clusters.sort((a, b) => {
        const la = (a.household_name ?? a.lead_short_label ?? "").toLowerCase();
        const lb = (b.household_name ?? b.lead_short_label ?? "").toLowerCase();
        return la.localeCompare(lb);
    });

    if (unclustered.length) {
        clusters.push({
            key: "__ungrouped__",
            household_name: null,
            lead_short_label: null,
            location_label: null,
            status_label: null,
            anchors: unclustered.filter((h) => h.group === "leads"),
            children: unclustered.filter((h) => h.group === "children"),
            parents: unclustered.filter((h) => h.group === "parents"),
            locations: unclustered.filter((h) => h.group === "locations"),
        });
    }

    return clusters;
}
