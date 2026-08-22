/**
 * R1 — profile-photo resolution must not be linear in the number of avatars.
 *
 * `resolveProfilePhotosForActor` takes a SET of people, and its module header has always said it is
 * batched by design. It was not: the body awaited each person in turn. Every person costs two round
 * trips that cannot be merged — a per-document access decision and a storage signing call — so the
 * cost of a page was linear in how many children happened to have a photo. Measured on the
 * certification tenant that pair is ~130 ms, which is ~13 s for a hundred-avatar page, and is what
 * `/api/admin/records/children` at 3.3–4.5 s was made of.
 *
 * ── WHY THIS ASSERTS CONCURRENCY AND NOT DURATION ──
 *
 * A wall-clock assertion would encode the speed of whichever machine ran it and would go green on a
 * fast box even if the serial loop came back. The property that actually matters is structural and
 * is exactly observable: how many resolutions were IN FLIGHT at once. Serial is peak 1. So this
 * asserts peak > 1 (the serialism is gone) and peak <= the declared bound (it did not become an
 * unbounded burst that just moves the queue into the storage API), plus that every person still
 * gets its own authorization decision and its own result.
 */
import { describe, expect, it } from "vitest";

import { resolveProfilePhotosForActor } from "@/lib/documents/profilePhotoPresentation";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const PEOPLE = 20;
/** Mirrors PHOTO_RESOLUTION_CONCURRENCY. A change to the bound should surface here deliberately. */
const DECLARED_BOUND = 8;

const actor = {
    ok: true as const,
    userId: "user-1",
    orgId: ORG,
    role: "admin",
    roleKeys: ["admin"],
    permissionKeys: [],
};

/** Yield to the macrotask queue so overlapping work is genuinely observable. */
const tick = () => new Promise((r) => setTimeout(r, 1));

function trackingClient() {
    let inFlight = 0;
    let peak = 0;
    const accessChecks: string[] = [];
    const signed: string[] = [];

    const enter = () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
    };
    const leave = () => {
        inFlight -= 1;
    };

    const client = {
        from: () => ({
            select: () => ({
                eq: () => ({
                    eq: () => ({
                        maybeSingle: async () => {
                            enter();
                            await tick();
                            // The document id is not threaded through this mock chain, so the count
                            // is what matters: one access decision per person, never fewer.
                            accessChecks.push("access");
                            leave();
                            return {
                                data: {
                                    id: "dddddddd-0000-4000-8000-000000000001",
                                    org_id: ORG,
                                    bucket: "org_documents",
                                    storage_path: "p/x.png",
                                    entity_type: "persons",
                                    entity_id: null,
                                    status: null,
                                },
                                error: null,
                            };
                        },
                    }),
                }),
            }),
        }),
        storage: {
            from: () => ({
                createSignedUrl: async (path: string) => {
                    enter();
                    await tick();
                    signed.push(path);
                    leave();
                    return { data: { signedUrl: `https://storage.invalid/${signed.length}` }, error: null };
                },
            }),
        },
    };

    return { client, accessChecks, signed, peak: () => peak };
}

const people = Array.from({ length: PEOPLE }, (_, i) => ({
    personId: `11111111-0000-4000-8000-${String(i).padStart(12, "0")}`,
    metadata: { profile_photo_document_id: `dddddddd-0000-4000-8000-${String(i).padStart(12, "0")}` },
}));

describe("profile photo resolution is bounded-concurrent, not serial", () => {
    it("overlaps resolutions instead of awaiting one person at a time", async () => {
        const t = trackingClient();

        await resolveProfilePhotosForActor({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: t.client as any,
            actor,
            people,
        });

        // Serial would be exactly 1. This is the assertion the old implementation failed.
        expect(t.peak()).toBeGreaterThan(1);
    });

    it("stays within the declared bound rather than bursting unbounded", async () => {
        const t = trackingClient();

        await resolveProfilePhotosForActor({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: t.client as any,
            actor,
            people,
        });

        expect(t.peak()).toBeLessThanOrEqual(DECLARED_BOUND);
    });

    it("still authorizes every document and returns every person", async () => {
        const t = trackingClient();

        const out = await resolveProfilePhotosForActor({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: t.client as any,
            actor,
            people,
        });

        // Concurrency may not become a shared authorization decision.
        expect(t.accessChecks).toHaveLength(PEOPLE);
        expect(t.signed).toHaveLength(PEOPLE);
        expect(out.size).toBe(PEOPLE);
        for (const person of people) {
            expect(out.get(person.personId)?.photoUrl).toMatch(/^https:\/\/storage\.invalid\//);
        }
    });

    it("a person with no photo reference costs no round trip and still gets an answer", async () => {
        const t = trackingClient();

        const out = await resolveProfilePhotosForActor({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: t.client as any,
            actor,
            people: [{ personId: people[0]!.personId, metadata: {} }],
        });

        expect(t.accessChecks).toHaveLength(0);
        expect(out.get(people[0]!.personId)).toMatchObject({ photoUrl: null, reason: "no_reference" });
    });
});
