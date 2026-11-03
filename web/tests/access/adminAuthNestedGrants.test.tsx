// @vitest-environment jsdom
/**
 * A NESTED AdminAuthProvider THAT OMITS THE GRANTS INHERITS THEM — the defect that hid "Change amount".
 *
 * The root admin layout resolves `permissionKeys`; the Workspace provider (where the Focus Panel and
 * Add Charge live) nests inside it and passed none. The inner `null` shadowed the outer answer, so
 * `permissionKeys.includes("fin.adjust")` was false for EVERY operator and the amount override was
 * never offered. `catalogAmountOverrideRendered.test.tsx` mocks the context and could not see it;
 * this mounts the real providers in the same nesting the shell uses.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AdminAuthProvider, useAdminAuthOptional } from "@/contexts/AdminAuthContext";
import { CATALOG_AMOUNT_OVERRIDE_PERMISSION } from "@/lib/financials/catalogCharges/catalogAmountOverride";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function Probe() {
    const auth = useAdminAuthOptional();
    return <span data-keys={auth?.permissionKeys == null ? "null" : auth.permissionKeys.join(",")} />;
}
const keysRead = () => host.querySelector("[data-keys]")!.getAttribute("data-keys");

function mount(inner: { userId: string; orgId: string; permissionKeys?: string[] | null }) {
    act(() =>
        root.render(
            <AdminAuthProvider userEmail="a@x" userId="u1" orgId="o1" role="admin" permissionKeys={["fin.read", CATALOG_AMOUNT_OVERRIDE_PERMISSION]}>
                <AdminAuthProvider userEmail="a@x" role="admin" {...inner}>
                    <Probe />
                </AdminAuthProvider>
            </AdminAuthProvider>,
        ),
    );
}

describe("nested AdminAuthProvider grants", () => {
    it("a nested mount that passes no grants reads the root's, for the same principal and org", () => {
        mount({ userId: "u1", orgId: "o1" });
        expect(keysRead()).toBe(`fin.read,${CATALOG_AMOUNT_OVERRIDE_PERMISSION}`);
    });

    it("another principal or another org inherits nothing — unknown stays unknown", () => {
        mount({ userId: "u2", orgId: "o1" });
        expect(keysRead()).toBe("null");
        mount({ userId: "u1", orgId: "o2" });
        expect(keysRead()).toBe("null");
    });

    it("grants a nested mount does pass are its own answer, never widened by the root's", () => {
        mount({ userId: "u1", orgId: "o1", permissionKeys: ["fin.read"] });
        expect(keysRead()).toBe("fin.read");
    });
});
