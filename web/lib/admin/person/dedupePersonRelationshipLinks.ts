import type { PersonRelationshipLink } from "@/lib/admin/person/personDrawerVisibilityTypes";

function normalizeName(name: string | null | undefined): string {
    return String(name ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function linkIdentityKeys(link: PersonRelationshipLink): string[] {
    const keys: string[] = [];
    const personId = link.person_id?.trim();
    if (personId) keys.push(`p:${personId}`);
    const memberId = link.customer_member_id?.trim();
    if (memberId) keys.push(`m:${memberId}`);
    const name = normalizeName(link.display_name);
    if (name) keys.push(`n:${name}`);
    return keys;
}

function mergeRelationshipLinks(
    left: PersonRelationshipLink,
    right: PersonRelationshipLink
): PersonRelationshipLink {
    return {
        person_id: left.person_id?.trim() || right.person_id?.trim() || null,
        customer_member_id: left.customer_member_id?.trim() || right.customer_member_id?.trim() || null,
        display_name: left.display_name?.trim() || right.display_name?.trim() || null,
        relationship_label: left.relationship_label?.trim() || right.relationship_label?.trim() || null,
    };
}

/** Collapse duplicate household adults projected from multiple relationship sources. */
export function dedupePersonRelationshipLinks(links: PersonRelationshipLink[]): PersonRelationshipLink[] {
    const clusters: PersonRelationshipLink[][] = [];

    for (const link of links) {
        const keys = linkIdentityKeys(link);
        if (keys.length === 0) continue;

        let clusterIndex = -1;
        for (let i = 0; i < clusters.length; i++) {
            const clusterKeys = new Set(clusters[i]!.flatMap(linkIdentityKeys));
            if (keys.some((key) => clusterKeys.has(key))) {
                clusterIndex = i;
                break;
            }
        }

        if (clusterIndex >= 0) {
            clusters[clusterIndex]!.push(link);
        } else {
            clusters.push([link]);
        }
    }

    return clusters.map((cluster) =>
        cluster.reduce(
            (acc, link) => mergeRelationshipLinks(acc, link),
            {
                person_id: null,
                customer_member_id: null,
                display_name: null,
                relationship_label: null,
            } satisfies PersonRelationshipLink
        )
    );
}
