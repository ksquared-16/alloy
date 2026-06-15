import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("announcements dark + operator-first", () => {
    const src = readFileSync(
        join(process.cwd(), "app", "adminV2", "communications", "announcements", "AnnouncementBuilder.tsx"),
        "utf8"
    );
    it("self-gates behind comms_v2_announcements", () => {
        expect(src).toMatch(/isCommsV2FlagEnabled\(["']comms_v2_announcements["']\)/);
        expect(src).toMatch(/return null/);
    });
    it("shows audience targeting", () => {
        expect(src).toMatch(/data-cc-announcement-audience/);
    });
    it("is operator-first, not a campaign/journey/drip builder", () => {
        const body = src.replace(/\/\*[\s\S]*?\*\//g, "");
        expect(body).not.toMatch(/campaign|journey|drip|automation|sequence/i);
    });
});
