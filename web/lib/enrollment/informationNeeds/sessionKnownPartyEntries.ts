/**
 * The people Alloy already knows for one packet session's child — resolved once, for every reader.
 *
 * ## Why this is its own module
 *
 * Three surfaces need the same answer and must not be able to disagree about it. The conversation
 * card shows the known sibling and the known emergency contact; the submit seam has to carry them
 * into the payload as evidence; the document renderer has to print them. When that resolution lived
 * only inside the objective resolver, the card had known people and the artifact did not — which is
 * exactly the defect human QA found: two headings, no people underneath.
 *
 * Nothing here writes. It reads the canonical graph — `person_child_relationships` through
 * `resolveChildParties`, and the household's own `customer_members` — and never the session, so a
 * resumed session and a regenerated document see the same family. A read that fails yields no known
 * people rather than throwing: an artifact missing a known contact is a defect, but an artifact that
 * cannot be produced at all is worse, and the family's own answers survive either way.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { FormSchemaV1 } from "@/lib/forms/schema";
import { resolveChildParties, type ChildParty } from "@/lib/enrollment/participantRuntime/childPartyRuntime";
import { resolveParticipantSubjectCustomerMemberId } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";
import {
    knownPartyEntriesFromParties,
    type ParticipantPartyEntry,
} from "@/lib/enrollment/informationNeeds/participantPartyCollection";

/**
 * The other children on this household — the people a "siblings" collection already knows.
 *
 * `resolveChildParties` answers who is RELATED TO this child as a person in a role; it cannot
 * answer who else is a child of the same household, because that is a different edge. So the
 * household's own members are read here, from `customer_members`, which is the canonical child
 * record and the same table the operator surfaces list from.
 *
 * The enrollment subject is excluded by id. A child is not their own sibling, and a family shown
 * their own child in that list would reasonably conclude Alloy has them twice.
 */
export async function resolveHouseholdSiblings(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly customerId: string; readonly excludeMemberId: string },
): Promise<Array<{ id: string; display_name: string }>> {
    try {
        const { data } = await supabase
            .from("customer_members")
            .select("id, display_name, first_name, last_name, is_active")
            .eq("org_id", input.orgId)
            .eq("customer_id", input.customerId);
        return (data ?? [])
            .map((r) => r as { id?: string; display_name?: string; first_name?: string; last_name?: string; is_active?: boolean })
            .filter((r) => r.id && r.id !== input.excludeMemberId && r.is_active !== false)
            .map((r) => ({
                id: String(r.id),
                display_name: String(r.display_name ?? [r.first_name, r.last_name].filter(Boolean).join(" ")).trim(),
            }))
            .filter((r) => r.display_name);
    } catch {
        return [];
    }
}

/**
 * The canonical people around this session's child, and the household they belong to.
 *
 * ## The child is not found through a journey
 *
 * MEASURED, on a hand-launched packet: this read the process instance's subject and stopped, so a
 * session with no Business Process journey resolved no child, no parties and no household — and the
 * completed document printed the two people the family had TYPED while silently dropping the known
 * sibling and the known emergency contact they had confirmed. The participant runtime converged away
 * from requiring a journey some time ago; this had quietly reintroduced the requirement.
 *
 * `resolveParticipantSubjectCustomerMemberId` is the platform's own answer to "which child is this
 * session about" — the instance's subject where one exists, the session's CRM snapshot where it does
 * not. Reused rather than re-derived, so a hand-launched packet and a journey-anchored one cannot
 * disagree about whose family this is.
 *
 * The household read is separate because the two collection subjects are different canonical edges:
 * a role-holder is a person related to the child, a sibling is another member of the same household.
 */
export async function resolveSessionChildContext(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly processInstanceId: string | null | undefined;
        /** The session row, which carries the CRM snapshot a journeyless packet is found through. */
        readonly session?: unknown;
    },
): Promise<{ parties: readonly ChildParty[]; householdChildren: readonly { id: string; display_name: string }[] }> {
    try {
        const childId = String(
            (await resolveParticipantSubjectCustomerMemberId(supabase, {
                orgId: input.orgId,
                linkId: "",
                sessionId: "",
                processInstanceId: String(input.processInstanceId ?? "").trim() || null,
                session: (input.session ?? {}) as never,
            })) ?? "",
        ).trim();
        if (!childId) return { parties: [], householdChildren: [] };

        const [parties, { data: child }] = await Promise.all([
            resolveChildParties(supabase, { orgId: input.orgId, customerMemberId: childId }),
            supabase
                .from("customer_members")
                .select("customer_id")
                .eq("org_id", input.orgId)
                .eq("id", childId)
                .maybeSingle(),
        ]);
        const customerId = String((child as { customer_id?: string } | null)?.customer_id ?? "").trim();
        const householdChildren = customerId
            ? await resolveHouseholdSiblings(supabase, { orgId: input.orgId, customerId, excludeMemberId: childId })
            : [];
        return { parties, householdChildren };
    } catch {
        return { parties: [], householdChildren: [] };
    }
}

/**
 * Known entries for every party collection this schema declares, keyed by group id.
 *
 * The shape `partyCollectionGroupRows` and the conversation card both consume, so the payload, the
 * card and the document all describe one list of people.
 */
export async function resolveSessionKnownPartyEntries(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly processInstanceId: string | null | undefined;
        /** The packet session row — how a journeyless packet names its child. */
        readonly session?: unknown;
        readonly schema: Pick<FormSchemaV1, "fields">;
    },
): Promise<Record<string, ParticipantPartyEntry[]>> {
    const { parties, householdChildren } = await resolveSessionChildContext(supabase, {
        orgId: input.orgId,
        processInstanceId: input.processInstanceId,
        session: input.session,
    });
    return knownPartyEntriesFromParties(input.schema, parties, householdChildren);
}
