import { validatePersonIdentityFields } from "@/lib/admin/person/upsertAndLinkPersonForAdmin";

export type AddPersonSubmitPayload = {
    first_name: string;
    last_name: string;
    phone?: string;
    email?: string;
    role_type?: string;
};

export function validateAddPersonSubmitPayload(payload: AddPersonSubmitPayload): string | null {
    return validatePersonIdentityFields({
        first_name: payload.first_name,
        last_name: payload.last_name,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
    });
}

export type SubmitAddPersonContext = {
    surface?: string;
    section_key?: string | null;
    department_id?: string | null;
    work_unit_id?: string | null;
};

export type SubmitAddPersonInput = {
    entityType: "opportunity" | "customer";
    entityId: string;
    actionKey: string;
    payload: AddPersonSubmitPayload;
    context?: SubmitAddPersonContext;
    fetchFn?: typeof fetch;
};

export type SubmitAddPersonResult = {
    person_id: string;
    customer_person_id?: string;
    opportunity_person_id?: string;
    existed?: boolean;
};

export async function submitAddPersonFromDrawer(input: SubmitAddPersonInput): Promise<SubmitAddPersonResult> {
    const fetchImpl = input.fetchFn ?? fetch;
    const validation = validateAddPersonSubmitPayload(input.payload);
    if (validation) {
        throw new Error(validation);
    }

    const res = await fetchImpl("/api/admin/actions/execute", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            action_key: input.actionKey,
            entity_type: input.entityType,
            entity_id: input.entityId,
            context: input.context ?? { surface: "record_section" },
            payload: {
                first_name: input.payload.first_name.trim(),
                last_name: input.payload.last_name.trim(),
                email: input.payload.email?.trim() || undefined,
                phone: input.payload.phone?.trim() || undefined,
                role_type: input.payload.role_type?.trim() || undefined,
            },
        }),
    });

    const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        execution_result?: {
            person_id?: string;
            customer_person_id?: string;
            opportunity_person_id?: string;
            existed?: boolean;
        };
    };

    if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Failed to add person.");
    }

    const er = json.execution_result;
    const personId = er?.person_id?.trim();
    if (!personId) {
        throw new Error("Person was saved but the response did not include a person id.");
    }

    return {
        person_id: personId,
        customer_person_id: er?.customer_person_id,
        opportunity_person_id: er?.opportunity_person_id,
        existed: er?.existed,
    };
}
