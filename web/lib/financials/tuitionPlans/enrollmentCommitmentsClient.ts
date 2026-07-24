import {
    parseEnrollmentCommitmentTemplateItem,
    TUITION_ENROLLMENT_COMMITMENTS_SET_KEY,
    type EnrollmentCommitmentTemplateItem,
} from "@/lib/financials/tuitionPlans/enrollmentCommitmentsViewModel";
import type { QuantityType } from "@/lib/programs/programOfferingVariants";

async function ensureEnrollmentCommitmentsSet(): Promise<void> {
    const listRes = await fetch("/api/admin/option-sets", { credentials: "include" });
    if (!listRes.ok) return;
    const listJson = (await listRes.json()) as { option_sets?: { set_key: string }[] };
    const exists = (listJson.option_sets ?? []).some(
        (row) => row.set_key === TUITION_ENROLLMENT_COMMITMENTS_SET_KEY,
    );
    if (exists) return;

    await fetch("/api/admin/option-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
            set_key: TUITION_ENROLLMENT_COMMITMENTS_SET_KEY,
            label: "Enrollment Commitments",
            sort_order: 0,
        }),
    });
}

export async function fetchEnrollmentCommitmentTemplates(): Promise<EnrollmentCommitmentTemplateItem[]> {
    const listRes = await fetch("/api/admin/option-sets", { credentials: "include" });
    if (listRes.ok) {
        const listJson = (await listRes.json()) as { option_sets?: { set_key: string }[] };
        const exists = (listJson.option_sets ?? []).some(
            (row) => row.set_key === TUITION_ENROLLMENT_COMMITMENTS_SET_KEY,
        );
        if (!exists) return [];
    }

    const res = await fetch(
        `/api/admin/option-sets/${encodeURIComponent(TUITION_ENROLLMENT_COMMITMENTS_SET_KEY)}`,
        { credentials: "include" },
    );
    if (res.status === 404) return [];
    if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || "Could not load enrollment commitment templates.");
    }
    const json = (await res.json()) as {
        items?: { id: string; item_key: string; label: string; metadata?: Record<string, unknown> }[];
    };
    const items = json.items ?? [];
    return items
        .map((row) => parseEnrollmentCommitmentTemplateItem(row))
        .filter((row): row is EnrollmentCommitmentTemplateItem => row != null);
}

export async function createEnrollmentCommitmentTemplate(input: {
    quantityType: QuantityType;
    quantityValue: number;
    label: string;
}): Promise<EnrollmentCommitmentTemplateItem> {
    await ensureEnrollmentCommitmentsSet();
    const itemKey = `${input.quantityType}_${input.quantityValue}`.slice(0, 64);
    const res = await fetch(
        `/api/admin/option-sets/${encodeURIComponent(TUITION_ENROLLMENT_COMMITMENTS_SET_KEY)}/items`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                item_key: itemKey,
                label: input.label.trim(),
                sort_order: input.quantityValue,
                metadata: {
                    quantity_type: input.quantityType,
                    quantity_value: input.quantityValue,
                    active: true,
                },
            }),
        },
    );
    const json = (await res.json()) as {
        id?: string;
        item_key?: string;
        label?: string;
        metadata?: Record<string, unknown>;
        error?: string;
    };
    if (!res.ok) throw new Error(json.error || "Could not save enrollment commitment template.");
    const parsed = parseEnrollmentCommitmentTemplateItem({
        id: String(json.id),
        item_key: String(json.item_key),
        label: String(json.label),
        metadata: json.metadata,
    });
    if (!parsed) throw new Error("Could not parse saved enrollment commitment.");
    return parsed;
}
