// @vitest-environment jsdom
/**
 * The operator can decide a proposed relationship from the case — measured on staging: guardian and
 * emergency-contact proposals from submitted paperwork had no commit or reject control at all.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { ProcessingCollectionEvidencePanel } from "@/components/pos/ProcessingCollectionEvidencePanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.unstubAllGlobals());

const instance = (ref: string) => ({
    proposal_id: `rrp:form_submission:sub-1:${ref}:row-1`,
    collection_provider_ref: ref,
    collection_label: "x",
    iteration_entity_type: "person",
    instance_key: "row-1",
    origin: "respondent_added",
    existing_item_id: null,
    identity_label: "Nadia Haddad",
    field_bindings: [],
    status: "valid",
    diagnostics: [],
    lineage: {},
});

async function render(ref: string, response: { ok: boolean; body: unknown }) {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
        return { ok: response.ok, json: async () => response.body } as Response;
    });
    const host = document.createElement("div");
    const group = { group_id: "g", collection_provider_ref: ref, collection_label: "x", instances: [instance(ref)], status: "valid", diagnostics: [] };
    await act(async () => createRoot(host).render(<ProcessingCollectionEvidencePanel groups={[group as never]} caseId="case-1" />));
    return { host, calls };
}

describe("relationship proposals: commit or reject from the case", () => {
    it("an emergency contact is added through the guarded commit route, asserting nothing but approval", async () => {
        const { host, calls } = await render("person.contact_role.emergency_contacts", { ok: true, body: { data: { outcome: "applied" } } });
        const add = host.querySelector('[data-testid="relationship-commit"]') as HTMLButtonElement;
        expect(add.textContent).toBe("Add to Emergency Contacts");
        await act(async () => add.click());
        await act(async () => new Promise((r) => setTimeout(r, 0)));
        expect(calls[0]!.url).toMatch(/\/related-record-proposals\/.+\/commit$/);
        expect(calls[0]!.body).toEqual({ decision: { proposal_id: instance("person.contact_role.emergency_contacts").proposal_id, instance_decision: "approve", field_decisions: [] } });
        expect(host.querySelector('[data-testid="relationship-decision-done"]')?.textContent).toBe("Added to the record as emergency contacts");
    });

    it("reject goes to the reject route with the reason", async () => {
        const { host, calls } = await render("person.contact_role.parents", { ok: true, body: { data: { rejected: true } } });
        const input = host.querySelector('[data-testid="relationship-reject-reason"]') as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        await act(async () => { setter.call(input, "Duplicate"); input.dispatchEvent(new Event("input", { bubbles: true })); });
        await act(async () => (host.querySelector('[data-testid="relationship-reject"]') as HTMLButtonElement).click());
        await act(async () => new Promise((r) => setTimeout(r, 0)));
        expect(calls[0]!.url).toMatch(/\/reject$/);
        expect(calls[0]!.body).toEqual({ reason: "Duplicate" });
        expect(host.querySelector('[data-testid="relationship-decision-done"]')?.textContent).toBe("Rejected — nothing was added");
    });

    it("a refusal is shown, not hidden", async () => {
        const { host } = await render("person.contact_role.emergency_contacts", { ok: false, body: { error: "Emergency Contacts is child-scoped and requires an explicit child." } });
        await act(async () => (host.querySelector('[data-testid="relationship-commit"]') as HTMLButtonElement).click());
        await act(async () => new Promise((r) => setTimeout(r, 0)));
        expect(host.textContent).toContain("requires an explicit child");
    });

    it("a child proposal is not offered as a relationship", async () => {
        const { host } = await render("children", { ok: true, body: {} });
        expect(host.querySelector('[data-testid="relationship-decision"]')).toBeNull();
    });
});

describe("an ambiguous person: the operator chooses or corrects", () => {
    const candidates = [{ person_id: "p-other", display_name: "Parent ZMU7A", in_household: false, same_name: false }];
    async function ambiguous() {
        const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
        let n = 0;
        vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
            calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
            n += 1;
            if (n === 1) return { ok: false, json: async () => ({ error: "A person with this email or phone already exists — choose them, or correct the details.", code: "relationship_identity_choice_required", identity_candidates: candidates }) } as Response;
            return { ok: true, json: async () => ({ data: { outcome: "applied" } }) } as Response;
        });
        const host = document.createElement("div");
        const group = { group_id: "g", collection_provider_ref: "person.contact_role.parents", collection_label: "x", instances: [{ ...instance("person.contact_role.parents"), field_bindings: [
            { field_id: "emergency_contacts_full_name", provider_ref: "emergency_contacts_full_name", display_value: "Parent ZZQA1496Q" },
            { field_id: "emergency_contacts_phone", provider_ref: "emergency_contacts_phone", display_value: "5550101111" },
        ] }], status: "valid", diagnostics: [] };
        await act(async () => createRoot(host).render(<ProcessingCollectionEvidencePanel groups={[group as never]} caseId="case-1" />));
        await act(async () => (host.querySelector('[data-testid="relationship-commit"]') as HTMLButtonElement).click());
        await act(async () => new Promise((r) => setTimeout(r, 0)));
        return { host, calls };
    }

    it("shows who already holds the email/phone, and adds them only when chosen", async () => {
        const { host, calls } = await ambiguous();
        expect(host.querySelector('[data-testid="relationship-candidates"]')?.textContent).toMatch(/Parent ZMU7A.*in another family.*different name/);
        await act(async () => (host.querySelector('[data-testid="relationship-use-person"]') as HTMLButtonElement).click());
        await act(async () => new Promise((r) => setTimeout(r, 0)));
        expect(calls[1]!.body).toMatchObject({ selected_person_id: "p-other" });
        expect(host.querySelector('[data-testid="relationship-decision-done"]')).not.toBeNull();
    });

    it("a different person: the operator corrects the submitted details, prefilled from the paperwork", async () => {
        const { host, calls } = await ambiguous();
        await act(async () => (host.querySelector('[data-testid="relationship-correct"]') as HTMLButtonElement).click());
        const phone = host.querySelector('[data-testid="relationship-fix-phone"]') as HTMLInputElement;
        expect((host.querySelector('[data-testid="relationship-fix-first"]') as HTMLInputElement).value).toBe("Parent");
        expect(phone.value).toBe("5550101111");
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        await act(async () => { setter.call(phone, "5550147199"); phone.dispatchEvent(new Event("input", { bubbles: true })); });
        await act(async () => (host.querySelector('[data-testid="relationship-fix-save"]') as HTMLButtonElement).click());
        await act(async () => new Promise((r) => setTimeout(r, 0)));
        expect(calls[1]!.body).toMatchObject({ person_corrections: { first_name: "Parent", last_name: "ZZQA1496Q", phone: "5550147199" } });
    });
});
