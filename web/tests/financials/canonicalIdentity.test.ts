/**
 * A CHILD LOOKS LIKE THEMSELVES ON EVERY SURFACE.
 *
 * The rule that makes that true is about WHERE the image is resolved, not about which component
 * draws it. A resolved photo URL is authorized per actor per request, so:
 *
 *   · the view-model builder holds a service-role client and no actor — resolving there would
 *     either leak an unauthorized reference or bake a signed URL into a cached model;
 *   · a component cannot mint one at all;
 *   · and `photo_url`, the stored reference, is null on every child in the tenant, so reading it
 *     instead of `resolved_photo_url` makes every avatar fall back to initials while looking
 *     exactly like a working implementation.
 *
 * So the builder carries `personId`, the route that holds the actor projects the photo through the
 * SHARED document helper, and the components render what they are given.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const code = (rel: string) =>
    read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const VM = "lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM.ts";
const ROUTE = "app/api/admin/financials/card/route.ts";
const CARD = "components/admin/focusPanel/cards/FinancialsCard.tsx";
const DISCOUNT = "app/adminV2/financials/FinancialsDiscountPanel.tsx";

describe("the canonical authority is reused, not reimplemented", () => {
    it("the route projects photos through the shared document helper", () => {
        const route = code(ROUTE);
        expect(route).toContain("projectResolvedProfilePhotosOntoRows");
        expect(route, "with a real actor, because authorization is per actor")
            .toContain("documentActorFromAdminParts");
    });

    it("Financials builds no avatar resolver of its own", () => {
        /* §7: no minting in components, no Financials resolver, no persisted signed URL. */
        for (const rel of [VM, CARD, DISCOUNT]) {
            const src = code(rel);
            expect(src, `${rel} does not sign URLs`).not.toMatch(/createSignedUrl|getSignedUrl/);
            expect(src, `${rel} does not read the storage path itself`).not.toMatch(/profile_photo_document_id/);
        }
    });

    it("the view model carries identity but never the resolved image", () => {
        /*
         * A signed URL in a cached view model outlives its authorization. The builder carries the
         * KEY and leaves the image null for the actor-aware layer to fill.
         */
        const vm = code(VM);
        expect(vm, "the canonical key travels").toMatch(/personId: personIdByMember\.get/);
        expect(vm, "and the image is left for the route").toMatch(/imageUrl: null as string \| null/);
        expect(vm, "the builder resolves no photo").not.toContain("projectResolvedProfilePhotos");
    });

    it("resolved_photo_url is what is read, never the raw reference", () => {
        /*
         * `photo_url` is the stored document reference and is null on every child in the tenant.
         * Preferring it is how a surface ends up showing initials for a child who has a photo —
         * and looking correct while doing it.
         */
        const route = code(ROUTE);
        expect(route).toContain("resolved_photo_url");
        expect(route, "the raw reference is not a shortcut").not.toMatch(/\bphoto_url\b(?!.*resolved)/);
    });
});

describe("one child's identity cannot become another's", () => {
    it("the image is looked up by the child's own id, never by position", () => {
        /*
         * A list resolved by index puts one sibling's face on another the first time the two lists
         * are ordered differently — and they are ordered by different things: subjects by enrolment,
         * discount rows by the policies that reached them.
         */
        const card = code(CARD);
        expect(card).toMatch(
            /childImageFor=\{\([\s\S]{0,120}find\(\(sub\) => sub\.customerMemberId === customerMemberId\)[\s\S]{0,40}imageUrl/,
        );
        expect(card, "and the name is keyed the same way")
            .toMatch(/childLabelFor=\{[\s\S]{0,200}sub\.customerMemberId === customerMemberId/);
    });

    it("the panel renders identity it is given and resolves none", () => {
        const panel = code(DISCOUNT);
        expect(panel, "supplied by the host").toMatch(/childImageFor\?:/);
        expect(panel, "and carried per child").toMatch(/imageUrl: childImageFor\?\.\(/);
        expect(panel, "the panel fetches no identity").not.toMatch(/fetch\([^)]*person/i);
    });

    it("a child with no photo falls through to the canonical avatar", () => {
        const panel = code(DISCOUNT);
        expect(panel).toContain("IdentityAvatar");
        expect(panel, "null is passed rather than a substitute").toMatch(/imageUrl=\{child\.imageUrl\}/);
    });

    it("a responsible adult is not given a child's avatar", () => {
        /*
         * The Responsibility card names PARTIES — adults on the account. Handing it the child
         * image lookup would put a child's face on their guardian, which is a different person
         * and a worse error than showing initials.
         */
        const card = code(CARD);
        const at = card.indexOf('if (overlay === "responsibility_admin"');
        const block = card.slice(at, at + 2200);
        expect(block, "the responsibility card receives no child image resolver")
            .not.toContain("childImageFor");
    });
});
