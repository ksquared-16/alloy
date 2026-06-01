import { describe, expect, it } from "vitest";

import { normalizeOperationalTaskTitleDisplay } from "@/lib/agent/taskAssist/normalizeOperationalTaskTitleDisplay";

describe("normalizeOperationalTaskTitleDisplay", () => {
    it("removes leading em dash from task titles", () => {
        expect(normalizeOperationalTaskTitleDisplay("— Chen / West Campus — Respond to new request")).toBe(
            "Chen / West Campus — Respond to new request"
        );
    });

    it("leaves normal titles unchanged", () => {
        expect(normalizeOperationalTaskTitleDisplay("Call parent back")).toBe("Call parent back");
    });

    it("does not mutate empty titles", () => {
        expect(normalizeOperationalTaskTitleDisplay("")).toBe("");
    });
});
