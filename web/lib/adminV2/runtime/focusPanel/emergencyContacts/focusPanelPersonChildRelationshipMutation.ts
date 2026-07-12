/**
 * Focus Panel client mutations for canonical Person ↔ Child relationship instances.
 */

import type { PersonChildRelationshipInstance } from "@/lib/fields/personChildRelationship/personChildRelationshipEntity";
import type { PersonChildRelationshipMemberBag } from "@/lib/fields/personChildRelationship/attachPersonChildRelationshipsToEntityRecord";
import type { FocusPanelSaveResult } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

export type PersonChildRelationshipPatchBody = {
    relationship_type?: string | null;
    priority?: number | null;
    status?: string | null;
    custom_fields?: Record<string, unknown>;
};

async function parseJsonError(res: Response): Promise<string> {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return json.error ?? "Save failed";
}

export async function patchPersonChildRelationshipFromFocusPanel(args: {
    relationshipId: string;
    body: PersonChildRelationshipPatchBody;
    fetchFn?: typeof fetch;
}): Promise<FocusPanelSaveResult & { relationship?: PersonChildRelationshipInstance }> {
    const id = args.relationshipId.trim();
    if (!id) return { ok: false, status: 400, error: "No relationship to edit" };
    const f = args.fetchFn ?? fetch;
    const res = await f(`/api/admin/person-child-relationships/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args.body),
    });
    if (!res.ok) return { ok: false, status: res.status, error: await parseJsonError(res) };
    const json = (await res.json()) as { relationship?: PersonChildRelationshipInstance };
    return { ok: true, relationship: json.relationship };
}

export async function removePersonChildRelationshipRoleFromFocusPanel(args: {
    relationshipId: string;
    roleKey: string;
    fetchFn?: typeof fetch;
}): Promise<FocusPanelSaveResult> {
    const id = args.relationshipId.trim();
    const roleKey = args.roleKey.trim();
    if (!id || !roleKey) return { ok: false, status: 400, error: "Missing relationship or role" };
    const f = args.fetchFn ?? fetch;
    const res = await f(
        `/api/admin/person-child-relationships/${encodeURIComponent(id)}/roles/${encodeURIComponent(roleKey)}`,
        { method: "DELETE", credentials: "include" },
    );
    if (!res.ok) return { ok: false, status: res.status, error: await parseJsonError(res) };
    return { ok: true };
}

/** Merge one updated relationship instance back into `_person_child_relationships_by_member`. */
export function mergePersonChildRelationshipIntoFocusPanelTruth(
    truth: Record<string, unknown>,
    relationship: PersonChildRelationshipInstance,
): Record<string, unknown> {
    const memberId = trimOrNull(relationship.customer_member_id);
    if (!memberId) return truth;

    const raw = truth._person_child_relationships_by_member;
    const bags: PersonChildRelationshipMemberBag[] = Array.isArray(raw)
        ? (raw as PersonChildRelationshipMemberBag[]).map((bag) => ({ ...bag, items: [...(bag.items ?? [])] }))
        : [];

    let bagIndex = bags.findIndex((b) => b.customer_member_id === memberId);
    if (bagIndex < 0) {
        bags.push({
            customer_member_id: memberId,
            customer_id: String(relationship.customer_id ?? truth.customer_id ?? ""),
            child_id: null,
            items: [relationship],
        });
    } else {
        const items = [...(bags[bagIndex]!.items ?? [])];
        const idx = items.findIndex((item) => item.id === relationship.id);
        if (idx >= 0) items[idx] = relationship;
        else items.push(relationship);
        bags[bagIndex] = { ...bags[bagIndex]!, items };
    }

    return { ...truth, _person_child_relationships_by_member: bags };
}

/** Remove emergency_contact role locally; preserve edge when other roles remain. */
export function applyEmergencyRoleRemovalToTruth(
    truth: Record<string, unknown>,
    args: { relationshipId: string; customerMemberId: string },
): Record<string, unknown> {
    const raw = truth._person_child_relationships_by_member;
    if (!Array.isArray(raw)) return truth;

    const bags = (raw as PersonChildRelationshipMemberBag[]).map((bag) => {
        if (bag.customer_member_id !== args.customerMemberId) return bag;
        const items = (bag.items ?? []).map((item) => {
            if (item.id !== args.relationshipId) return item;
            const roles = item.operational_roles.filter(
                (role) => role.trim().toLowerCase() !== "emergency_contact",
            );
            if (roles.length === 0) {
                return { ...item, operational_roles: roles, status: "inactive" as const };
            }
            return { ...item, operational_roles: roles };
        });
        return { ...bag, items: [...items] };
    });

    return { ...truth, _person_child_relationships_by_member: bags };
}
