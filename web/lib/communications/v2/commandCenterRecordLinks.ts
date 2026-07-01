import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import { resolveInboxEntityDrawerTarget } from "@/lib/communications/inboxEntityDrawerTarget";
import type { ConversationSummary } from "@/lib/communications/v2/commandCenterViewModel";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type CommandCenterRecordLink = {
    type: AdminDrawerEntityType;
    id: string;
    label: string;
};

/** Build drawer-open targets from conversation enrichment + optional workspace child refs. */
export function buildCommandCenterRecordLinks(
    conv: ConversationSummary,
    childLinks?: Array<{ id: string; name: string }> | null
): CommandCenterRecordLink[] {
    const out: CommandCenterRecordLink[] = [];
    const seen = new Set<string>();

    const push = (type: AdminDrawerEntityType, id: string | null | undefined, label: string) => {
        const tid = (id ?? "").trim();
        const key = `${type}:${tid}`;
        if (!UUID_RE.test(tid) || seen.has(key)) return;
        seen.add(key);
        out.push({ type, id: tid, label: label.trim() || "Record" });
    };

    if (conv.customer_id && UUID_RE.test(conv.customer_id)) {
        push("customers", conv.customer_id, conv.family_label ?? "Family");
    }

    if (conv.primary_contact_person_id && UUID_RE.test(conv.primary_contact_person_id)) {
        push("persons", conv.primary_contact_person_id, conv.primary_contact_name ?? "Contact");
    }

    if (conv.opportunity_id && UUID_RE.test(conv.opportunity_id)) {
        push("opportunities", conv.opportunity_id, conv.stage_label ?? "Opportunity");
    }

    const anchor = resolveInboxEntityDrawerTarget(conv.primary_entity_type, conv.primary_entity_id);
    if (anchor) {
        const label =
            anchor.drawerType === "opportunities"
                ? (conv.stage_label ?? "Opportunity")
                : anchor.drawerType === "persons"
                  ? (conv.primary_contact_name ?? conv.family_label ?? "Person")
                  : anchor.drawerType === "customers"
                    ? (conv.family_label ?? "Family")
                    : "Record";
        push(anchor.drawerType, anchor.entityId, label);
    }

    for (const child of childLinks ?? conv.child_links ?? []) {
        if (child.id && UUID_RE.test(child.id)) {
            push("customer_members", child.id, child.name);
        }
    }

    return out;
}
