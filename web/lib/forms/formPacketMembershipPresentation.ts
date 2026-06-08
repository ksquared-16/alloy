/**
 * Resolve which enrollment packets include a form (Forms MVP Card 4).
 */

export type PacketDefinitionSummary = {
    id: string;
    name: string;
    key: string;
    is_active: boolean;
};

export type PacketDefinitionItemRow = {
    sequence_index: number;
    form_definition_id: string;
    form_definitions?: { id: string; name: string; key: string } | null;
};

export type FormPacketMembership = {
    packetDefinitionId: string;
    packetName: string;
    packetKey: string;
    stepNumber: number;
    totalSteps: number;
    stepFormName: string | null;
};

export function resolveFormPacketMemberships(params: {
    formId: string;
    definitions: PacketDefinitionSummary[];
    itemsByDefinitionId: Record<string, PacketDefinitionItemRow[]>;
}): FormPacketMembership[] {
    const memberships: FormPacketMembership[] = [];

    for (const def of params.definitions) {
        if (!def.is_active) continue;
        const items = params.itemsByDefinitionId[def.id] ?? [];
        const index = items.findIndex((item) => item.form_definition_id === params.formId);
        if (index < 0) continue;

        const row = items[index];
        memberships.push({
            packetDefinitionId: def.id,
            packetName: def.name,
            packetKey: def.key,
            stepNumber: row.sequence_index + 1,
            totalSteps: items.length,
            stepFormName:
                row.form_definitions && typeof row.form_definitions.name === "string" ?
                    row.form_definitions.name
                :   null,
        });
    }

    return memberships.sort((a, b) => a.packetName.localeCompare(b.packetName));
}

export function buildPacketContextOperatorCopy(params: {
    memberships: FormPacketMembership[];
    formName: string;
}): { lead: string; bullets: string[] } {
    if (params.memberships.length > 0) {
        const first = params.memberships[0];
        const more =
            params.memberships.length > 1 ?
                ` Also used in ${params.memberships.length - 1} other packet${params.memberships.length === 2 ? "" : "s"}.`
            :   "";
        return {
            lead: `${params.formName} is a step in ${params.memberships.length === 1 ? "an enrollment packet" : "enrollment packets"}.${more}`,
            bullets: [
                "Send the packet from an enrollment inquiry — families complete each step in order.",
                "This form attaches to the active packet record; staff review progress from the opportunity drawer.",
                "Packet setup is managed from the packet builder or the related workflow.",
            ],
        };
    }

    return {
        lead: "Add this form to a multi-step enrollment packet, then send the packet from an enrollment inquiry.",
        bullets: [
            "Each packet step is one form — families complete them in sequence.",
            "Send enrollment packets from an opportunity drawer when you are ready for a family to fill out forms.",
            "Public share links on this page are for standalone forms, not full packets.",
        ],
    };
}
