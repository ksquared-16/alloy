import { describe, expect, it } from "vitest";
import { buildPreferenceChange, expandSmsKeywordChanges } from "@/lib/communications/v2/preferenceMutations";

/** PKG-08 — preference mutation builders pair every change with an audit event. */
describe("buildPreferenceChange", () => {
    it("produces a matched upsert + audit event", () => {
        const { upsert, event } = buildPreferenceChange({
            orgId: "o", personId: "p", category: "email_marketing",
            fromState: "unset", toState: "opted_in", source: "form", method: "double_optin", actorUserId: "u",
        });
        expect(upsert.state).toBe("opted_in");
        expect(upsert.updated_by_user_id).toBe("u");
        expect(event.from_state).toBe("unset");
        expect(event.to_state).toBe("opted_in");
        expect(event.actor_user_id).toBe("u");
        expect(event.org_id).toBe("o");
        expect(event.category).toBe("email_marketing");
    });
});

describe("expandSmsKeywordChanges", () => {
    it("STOP opts out of both SMS categories with audit", () => {
        const changes = expandSmsKeywordChanges("stop", { orgId: "o", personId: "p" });
        expect(changes.map((c) => c.upsert.category).sort()).toEqual(["sms_marketing", "sms_transactional"]);
        expect(changes.every((c) => c.upsert.state === "opted_out")).toBe(true);
        expect(changes.every((c) => c.event.method === "stop")).toBe(true);
    });
    it("HELP implies no preference changes", () => {
        expect(expandSmsKeywordChanges("help", { orgId: "o", personId: "p" })).toEqual([]);
    });
});
