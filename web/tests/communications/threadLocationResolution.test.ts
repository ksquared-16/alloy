/**
 * The one rule that decides which conversation a message belongs to.
 *
 * Every case the Director named as a pressure test is here, plus the two that
 * would silently corrupt data if the rule were written carelessly: downgrading a
 * located conversation, and re-pointing one location's conversation at another.
 */

import { describe, expect, it } from "vitest";

import {
    correlationUsableForLocation,
    decideThreadForLocation,
    resolveInboundThreadLocation,
    resolveOutboundThreadLocation,
    type ThreadLocationCandidate,
} from "@/lib/communications/threadLocationResolution";

const RIVERSIDE = "00000000-0000-4000-8000-000000000010";
const LAKESIDE = "00000000-0000-4000-8000-000000000011";

const thread = (id: string, location_id: string | null): ThreadLocationCandidate => ({ id, location_id });

describe("same parent, two locations — never cross-filed", () => {
    it("a Lakeside message does not join the Riverside conversation", () => {
        const d = decideThreadForLocation({
            candidates: [thread("riverside-thread", RIVERSIDE)],
            locationId: LAKESIDE,
        });
        expect(d).toEqual({ kind: "create", locationId: LAKESIDE });
    });

    it("each location keeps its own conversation once both exist", () => {
        const candidates = [thread("t-river", RIVERSIDE), thread("t-lake", LAKESIDE)];
        expect(decideThreadForLocation({ candidates, locationId: RIVERSIDE })).toEqual({
            kind: "use",
            threadId: "t-river",
        });
        expect(decideThreadForLocation({ candidates, locationId: LAKESIDE })).toEqual({
            kind: "use",
            threadId: "t-lake",
        });
    });

    it("order of candidates cannot change the answer", () => {
        const forward = [thread("t-river", RIVERSIDE), thread("t-lake", LAKESIDE)];
        const reversed = [...forward].reverse();
        expect(decideThreadForLocation({ candidates: forward, locationId: LAKESIDE })).toEqual(
            decideThreadForLocation({ candidates: reversed, locationId: LAKESIDE }),
        );
    });
});

describe("the organization-level conversation", () => {
    it("an unlocated message reuses the unlocated conversation — today's behaviour, unchanged", () => {
        const d = decideThreadForLocation({
            candidates: [thread("t-org", null)],
            locationId: null,
        });
        expect(d).toEqual({ kind: "use", threadId: "t-org" });
    });

    it("nothing existing means create, with no location", () => {
        expect(decideThreadForLocation({ candidates: [], locationId: null })).toEqual({
            kind: "create",
            locationId: null,
        });
    });

    it("an unlocated message never joins a located conversation", () => {
        // If it did, the located thread's location would become a lie and the
        // reply would go out from the wrong identity.
        const d = decideThreadForLocation({
            candidates: [thread("t-river", RIVERSIDE)],
            locationId: null,
        });
        expect(d).toEqual({ kind: "create", locationId: null });
    });

    it("an unlocated message never DOWNGRADES a located conversation", () => {
        const d = decideThreadForLocation({
            candidates: [thread("t-river", RIVERSIDE)],
            locationId: null,
        });
        expect(d.kind).not.toBe("adopt");
        expect(d.kind).not.toBe("use");
    });
});

describe("location later becoming known — adopt, do not split", () => {
    it("stamps the existing unlocated conversation instead of starting a second", () => {
        const d = decideThreadForLocation({
            candidates: [thread("t-existing", null)],
            locationId: RIVERSIDE,
        });
        expect(d).toEqual({ kind: "adopt", threadId: "t-existing", locationId: RIVERSIDE });
    });

    it("adoption is upward only — a located conversation is never re-pointed", () => {
        // Riverside exists, no unlocated candidate: Lakeside must create, never
        // adopt Riverside. Re-pointing would move a family's history sideways.
        const d = decideThreadForLocation({
            candidates: [thread("t-river", RIVERSIDE)],
            locationId: LAKESIDE,
        });
        expect(d.kind).toBe("create");
    });

    it("prefers the exact location over adopting, when both are available", () => {
        const d = decideThreadForLocation({
            candidates: [thread("t-unlocated", null), thread("t-river", RIVERSIDE)],
            locationId: RIVERSIDE,
        });
        expect(d).toEqual({ kind: "use", threadId: "t-river" });
    });

    it("is idempotent — replaying the same message after adoption uses the thread", () => {
        const first = decideThreadForLocation({
            candidates: [thread("t-existing", null)],
            locationId: RIVERSIDE,
        });
        expect(first.kind).toBe("adopt");
        // After the adoption is written, the same decision runs again on the
        // updated row. Replay must not create a second conversation.
        const replay = decideThreadForLocation({
            candidates: [thread("t-existing", RIVERSIDE)],
            locationId: RIVERSIDE,
        });
        expect(replay).toEqual({ kind: "use", threadId: "t-existing" });
    });
});

describe("blank and whitespace are the same thing as absent", () => {
    it("treats empty-string location as unlocated on both sides", () => {
        expect(decideThreadForLocation({ candidates: [thread("t", "")], locationId: "" })).toEqual({
            kind: "use",
            threadId: "t",
        });
        expect(decideThreadForLocation({ candidates: [thread("t", null)], locationId: "   " })).toEqual({
            kind: "use",
            threadId: "t",
        });
    });

    it("undefined is unlocated, not a distinct third state", () => {
        expect(decideThreadForLocation({ candidates: [thread("t", null)], locationId: undefined })).toEqual({
            kind: "use",
            threadId: "t",
        });
    });
});

describe("where each direction gets its location", () => {
    it("inbound takes the receiving identity's binding location, and nothing else", () => {
        expect(resolveInboundThreadLocation({ receivingBindingLocationId: RIVERSIDE })).toBe(RIVERSIDE);
        expect(resolveInboundThreadLocation({ receivingBindingLocationId: null })).toBeNull();
        expect(resolveInboundThreadLocation({ receivingBindingLocationId: "  " })).toBeNull();
    });

    it("outbound takes the originating operational context", () => {
        expect(resolveOutboundThreadLocation({ contextLocationId: LAKESIDE })).toBe(LAKESIDE);
        expect(resolveOutboundThreadLocation({ contextLocationId: undefined })).toBeNull();
    });
});


describe("inbound must not adopt — the defect certification found", () => {
    it("a location-addressed message does NOT capture the organization conversation", () => {
        // A family wrote to riverside@. Their existing organization-level thread
        // was adopted into Riverside, and their NEXT message to the general
        // address was then filed at Riverside too. Inbound therefore never adopts.
        const d = decideThreadForLocation({
            candidates: [thread("t-org", null)],
            locationId: RIVERSIDE,
            adopt: false,
        });
        expect(d).toEqual({ kind: "create", locationId: RIVERSIDE });
    });

    it("outbound still adopts — the send context is the only location evidence there", () => {
        const d = decideThreadForLocation({
            candidates: [thread("t-org", null)],
            locationId: RIVERSIDE,
            adopt: true,
        });
        expect(d.kind).toBe("adopt");
    });

    it("adoption is the default, so only inbound has to opt out", () => {
        const d = decideThreadForLocation({ candidates: [thread("t", null)], locationId: RIVERSIDE });
        expect(d.kind).toBe("adopt");
    });
});

describe("correlation may not move a message across locations", () => {
    it("a Riverside conversation cannot absorb an organization-addressed reply", () => {
        expect(
            correlationUsableForLocation({
                correlatedThreadLocationId: RIVERSIDE,
                messageLocationId: null,
            }),
        ).toBe(false);
    });

    it("nor can an organization conversation absorb a Riverside reply", () => {
        expect(
            correlationUsableForLocation({
                correlatedThreadLocationId: null,
                messageLocationId: RIVERSIDE,
            }),
        ).toBe(false);
    });

    it("nor may one location's conversation take another's", () => {
        expect(
            correlationUsableForLocation({
                correlatedThreadLocationId: RIVERSIDE,
                messageLocationId: LAKESIDE,
            }),
        ).toBe(false);
    });

    it("correlation within the same location is exactly what threading is for", () => {
        expect(
            correlationUsableForLocation({
                correlatedThreadLocationId: RIVERSIDE,
                messageLocationId: RIVERSIDE,
            }),
        ).toBe(true);
        expect(
            correlationUsableForLocation({ correlatedThreadLocationId: null, messageLocationId: null }),
        ).toBe(true);
    });
});
