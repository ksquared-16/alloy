import { buildPersonDrawerRelationshipGroups } from "@/lib/admin/person/buildPersonDrawerRelationshipGroups";
import { personDrawerRelationshipInputFromRecord } from "@/lib/admin/person/personDrawerRelationshipInput";
import {
    personDrawerRelationshipSectionHasContent,
    resolvePersonDrawerRelationshipSectionModel,
} from "@/lib/admin/person/personDrawerRelationshipSection";
import type { PersonDrawerProfileResult } from "@/lib/admin/person/personDrawerVisibilityTypes";

/** True when the person has at least one relationship row worth rendering for this profile. */
export function personDrawerHasRelationshipContent(
    record: Record<string, unknown>,
    profile: PersonDrawerProfileResult
): boolean {
    const groups = buildPersonDrawerRelationshipGroups(personDrawerRelationshipInputFromRecord(record));
    const model = resolvePersonDrawerRelationshipSectionModel(profile, groups);
    return personDrawerRelationshipSectionHasContent(model, groups);
}
