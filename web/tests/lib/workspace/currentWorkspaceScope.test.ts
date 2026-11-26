/**
 * Current workspace scope publisher — powers the shared nav prewarm so sidebar/shell affordances key
 * their Work Unit surface prewarm to the live org/user/scope (Trust Closure §11).
 */

import { describe, it, expect, afterEach } from "vitest";
import {
    getCurrentWorkspaceScope,
    setCurrentWorkspaceScope,
    clearCurrentWorkspaceScope,
} from "@/lib/workspace/currentWorkspaceScope";

afterEach(() => clearCurrentWorkspaceScope());

describe("currentWorkspaceScope", () => {
    it("defaults to a null scope", () => {
        clearCurrentWorkspaceScope();
        expect(getCurrentWorkspaceScope()).toEqual({ orgId: null, userId: null, scopeFingerprint: null });
    });

    it("publishes and returns the live scope", () => {
        setCurrentWorkspaceScope({ orgId: "org-1", userId: "user-1", scopeFingerprint: "scope:1" });
        expect(getCurrentWorkspaceScope()).toEqual({ orgId: "org-1", userId: "user-1", scopeFingerprint: "scope:1" });
    });

    it("clears on logout / org change", () => {
        setCurrentWorkspaceScope({ orgId: "org-1", userId: "user-1", scopeFingerprint: "scope:1" });
        clearCurrentWorkspaceScope();
        expect(getCurrentWorkspaceScope().orgId).toBeNull();
    });
});
