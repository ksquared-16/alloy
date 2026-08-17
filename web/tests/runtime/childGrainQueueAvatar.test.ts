import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { attachChildGrainAvatar } from "@/lib/runtime/provisioning/attachChildGrainAvatar";

/**
 * R-019 — child-grain queue rows must carry the same Person-owned avatar every other placement uses.
 *
 * Two row-context builders exist for the same product placement. `QueueService` uses the
 * OCM-vintage `buildChildGrainQueueRowContext`, which resolves `row_subject.image_url`; the Work
 * View path uses `childQueueRowContext`, which never did. Firefly's Waitlist therefore showed
 * initials for children who have a durable photo.
 *
 * `ChildProvisioningRow` carries `customer_members.id` and no `person_id`, so resolution needs a
 * member -> person hop before the batched photo projection — modelled on
 * `attachChildGrainInquiryProgramFallback`. ONE members read plus ONE projection per page.
 */

const PHOTO = "https://example.test/storage/v1/object/sign/IMG_1438.jpeg?token=a";
const PHOTO_2 = "https://example.test/storage/v1/object/sign/IMG_5380.jpeg?token=b";

const actor = { ok: true } as never;

/** Minimal supabase double: records the tables touched so batching is provable. */
function supabaseWith(members: Array<{ id: string; person_id: string | null }>) {
    const touched: string[] = [];
    const client = {
        from(table: string) {
            touched.push(table);
            const builder: Record<string, unknown> = {
                select: () => builder,
                eq: () => builder,
                in: () => Promise.resolve({ data: members, error: null }),
            };
            return builder;
        },
    };
    return { client: client as never, touched };
}

const row = (subjectId: string, over: Record<string, unknown> = {}) =>
    ({ subjectId, stageKey: "waitlist", statusKey: null, title: "Child", updatedAt: null, ...over }) as never;

vi.mock("@/lib/documents/projectPersonProfilePhotos", () => ({
    projectResolvedProfilePhotosOntoRows: vi.fn(
        async ({ rows }: { rows: Array<Record<string, unknown>> }) =>
            rows.map((r) => ({
                ...r,
                resolved_photo_url:
                    r.person_id === "person-lennon" ? PHOTO : r.person_id === "person-wrigley" ? PHOTO_2 : null,
            })),
    ),
}));

describe("each child receives its own avatar", () => {
    it("resolves member → person → photo onto the row", async () => {
        const { client } = supabaseWith([{ id: "member-lennon", person_id: "person-lennon" }]);
        const out = await attachChildGrainAvatar({
            supabase: client,
            orgId: "org-1",
            actor,
            childRows: [row("member-lennon")],
        });
        expect(out[0]!.avatarImageUrl).toBe(PHOTO);
    });

    it("never hands one child the sibling's photo", async () => {
        const { client } = supabaseWith([
            { id: "member-lennon", person_id: "person-lennon" },
            { id: "member-wrigley", person_id: "person-wrigley" },
        ]);
        const out = await attachChildGrainAvatar({
            supabase: client,
            orgId: "org-1",
            actor,
            childRows: [row("member-lennon"), row("member-wrigley")],
        });
        expect(out[0]!.avatarImageUrl).toBe(PHOTO);
        expect(out[1]!.avatarImageUrl).toBe(PHOTO_2);
        expect(out[0]!.avatarImageUrl).not.toBe(out[1]!.avatarImageUrl);
    });

    it("resolves the whole page in ONE members read — never per row", async () => {
        const { client, touched } = supabaseWith([
            { id: "m1", person_id: "p1" },
            { id: "m2", person_id: "p2" },
            { id: "m3", person_id: "p3" },
        ]);
        await attachChildGrainAvatar({
            supabase: client,
            orgId: "org-1",
            actor,
            childRows: [row("m1"), row("m2"), row("m3")],
        });
        expect(touched.filter((t) => t === "customer_members")).toHaveLength(1);
    });
});

describe("absence is a valid answer, never a leak", () => {
    it("a child with no person_id keeps its row and gets no image", async () => {
        const { client } = supabaseWith([{ id: "member-x", person_id: null }]);
        const out = await attachChildGrainAvatar({
            supabase: client,
            orgId: "org-1",
            actor,
            childRows: [row("member-x")],
        });
        expect(out).toHaveLength(1);
        expect(out[0]!.avatarImageUrl).toBeUndefined();
    });

    it("a person with no photo keeps its row and gets no image", async () => {
        const { client } = supabaseWith([{ id: "member-y", person_id: "person-no-photo" }]);
        const out = await attachChildGrainAvatar({
            supabase: client,
            orgId: "org-1",
            actor,
            childRows: [row("member-y")],
        });
        expect(out[0]!.avatarImageUrl).toBeUndefined();
    });

    it("a denied or absent actor yields no URL and does not read at all", async () => {
        const { client, touched } = supabaseWith([{ id: "member-lennon", person_id: "person-lennon" }]);
        for (const denied of [null, undefined, { ok: false } as never]) {
            const out = await attachChildGrainAvatar({
                supabase: client,
                orgId: "org-1",
                actor: denied,
                childRows: [row("member-lennon")],
            });
            expect(out[0]!.avatarImageUrl).toBeUndefined();
        }
        expect(touched).toHaveLength(0);
    });

    it("a read failure costs the avatar, never the queue", async () => {
        const exploding = {
            from() {
                throw new Error("db down");
            },
        } as never;
        const out = await attachChildGrainAvatar({
            supabase: exploding,
            orgId: "org-1",
            actor,
            childRows: [row("member-lennon")],
        });
        expect(out).toHaveLength(1);
        expect(out[0]!.avatarImageUrl).toBeUndefined();
    });
});

describe("the seam stays canonical", () => {
    const src = (rel: string) =>
        readFileSync(join(process.cwd(), rel), "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^\s*\/\/.*$/gm, "");

    it("emits the SAME property the OCM builder uses — not a parallel queue field", () => {
        const composition = src("lib/runtime/provisioning/childGrainSurfaceComposition.ts");
        expect(composition).toContain("image_url: avatarImageUrl");
        for (const parallel of ["waitlist_avatar_url", "queue_photo_url"]) {
            expect(composition).not.toContain(parallel);
        }
    });

    it("reads through the one canonical adapter and persists nothing", () => {
        const attach = src("lib/runtime/provisioning/attachChildGrainAvatar.ts");
        expect(attach).toContain("resolveIdentityPhotoUrlFromRaw");
        expect(attach).toContain("projectResolvedProfilePhotosOntoRows");
        expect(attach).not.toMatch(/\.update\(|\.upsert\(|\.insert\(/);
    });

    it("leaves the QueueService/OCM path untouched", () => {
        const ocm = src("lib/workUnits/buildChildGrainQueueRowContext.ts");
        expect(ocm).toContain("resolveIdentityPhotoUrlFromRaw(activeInquiryRaw)");
        expect(ocm).not.toContain("attachChildGrainAvatar");
    });
});
