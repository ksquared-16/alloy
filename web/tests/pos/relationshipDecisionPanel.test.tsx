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
