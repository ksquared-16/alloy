import { applyHouseholdPrimaryContactToRecord } from "@/lib/admin/person/applyHouseholdPrimaryContactToRecord";
import { patchHouseholdPrimaryContact } from "@/lib/admin/person/patchHouseholdPrimaryContact";
import { dispatchDrawerLayoutRuntimeBodyRecordPatch } from "@/lib/layout/runtime/drawerLayoutRuntimeBodyRecordPatch";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

/** Person drawer: persist household primary contact and refresh open layout-runtime body. */
export async function patchPersonDrawerHouseholdPrimaryContact(args: {
    customerId: string;
    personId: string;
    personRecord: ProofRuntimeRecord;
}): Promise<ProofRuntimeRecord> {
    const customerId = args.customerId.trim();
    const personId = args.personId.trim();
    const personEntityId = String(args.personRecord.id ?? args.personRecord["person.id"] ?? "").trim();
    if (!customerId || !personId || !personEntityId) {
        throw new Error("Customer, person, and drawer person id required");
    }

    await patchHouseholdPrimaryContact(customerId, personId);

    const next = applyHouseholdPrimaryContactToRecord(args.personRecord, customerId, personId) as ProofRuntimeRecord;

    dispatchDrawerLayoutRuntimeBodyRecordPatch({
        entityType: "persons",
        entityId: personEntityId,
        record: next,
    });

    return next;
}
