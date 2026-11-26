/**
 * WHAT A LEAD COMMIT DID TO EACH RECORD — created, or an existing one reused.
 *
 * A linked household and the family's reused open lead are planned as `no_op` operations carrying the
 * EXISTING id under the same command key as a create (`create_household`, `create_lead`), and the
 * executor reports them `committed`. "Present and committed" therefore never meant "created": a matched
 * family's household read as new. Created is a committed operation whose planned kind is `create`.
 */
export type LeadCommitOperation = {
    commandKey: string;
    status: string;
    recordId: string | null;
    opKind?: string;
};

export type LeadCommitRecords = {
    records: { household: string | null; child: string | null; person: string | null; lead: string | null; participation: string | null };
    createdRecords: { household: boolean; child: boolean; person: boolean; lead: boolean };
    matchedExisting: boolean;
};

export function summarizeLeadCommitRecords(
    operations: readonly LeadCommitOperation[],
    lead: { customer_id?: string | null; primary_person_id?: string | null } | null,
): LeadCommitRecords {
    const committed = (...keys: string[]) =>
        operations.find((o) => keys.includes(o.commandKey) && o.status === "committed")?.recordId ?? null;
    // Attempts recorded before `opKind` was carried predate reuse ops for leads; treat them as creates.
    const created = (key: string) =>
        operations.find((o) => o.commandKey === key && o.status === "committed" && (o.opKind ?? "create") === "create")
            ?.recordId ?? null;

    const records = {
        household: committed("create_household") ?? lead?.customer_id ?? null,
        child: committed("create_child", "update_child"),
        person: created("create_person") ?? committed("update_person") ?? lead?.primary_person_id ?? null,
        lead: committed("create_lead", "update_lead"),
        participation: committed("create_process_participation"),
    };
    const createdRecords = {
        household: created("create_household") != null,
        child: created("create_child") != null,
        person: created("create_person") != null,
        lead: created("create_lead") != null,
    };
    const matchedExisting =
        (records.household != null && !createdRecords.household) ||
        (records.person != null && !createdRecords.person) ||
        (records.child != null && !createdRecords.child);
    return { records, createdRecords, matchedExisting };
}
