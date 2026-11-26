/**
 * The Communications setup experience an administrator actually gets.
 *
 * Two Director findings are certified here, both product gaps rather than bugs.
 *
 * ONE — an administrator could fill in every field this page owns and still be
 * told only "The credential this channel uses is not available in this
 * deployment", the same sentence for sending and receiving, with nothing on the
 * page they could do about it. The connection is now its own reported fact, and
 * when the deployment offers no approved connection at all, the page says so and
 * names who has to act.
 *
 * TWO — schools and rooms rendered as one flat peer list, so "Bears" sat beside
 * its own campus as though they were the same kind of thing. The hierarchy is now
 * canonical: rooms nest under their school and show what they inherit.
 *
 * Certification topology: 2 sites (Riverside, Lakeside), 6 units beneath them.
 * Riverside overrides on both channels; Lakeside deliberately does not, so
 * inheritance is provable rather than assumed.
 */
import { expect, test } from "@playwright/test";

const BINDINGS = "/api/admin/communications/bindings";
const PAGE = "/organization/communications";

type Page = import("@playwright/test").Page;
type Json = Record<string, unknown>;

type Site = { id: string; label: string; rooms: { id: string; label: string }[] };

async function hierarchy(page: Page): Promise<{ sites: Site[]; unparented: unknown[] }> {
    const res = await page.request.get(BINDINGS);
    expect(res.ok()).toBe(true);
    const json = (await res.json()) as Json;
    return json.location_hierarchy as { sites: Site[]; unparented: unknown[] };
}


/**
 * The channel whose card is actually rendering its hierarchy right now.
 *
 * This spec inherits the tenant from `communications-configuration`, which
 * enables and disables channels as part of proving readiness. Hardcoding `email`
 * made these tests fail whenever that spec left email switched off — a fixture
 * dependency masquerading as a hierarchy defect. The hierarchy is a property of
 * any connected channel, so the tests assert it on one, and fail loudly if
 * neither is available.
 */
async function hierarchyChannel(page: Page): Promise<string> {
    await page.goto(PAGE);
    // Wait for the page to FINISH loading before probing. `count()` resolves
    // immediately and does not retry, so probing a page still showing "Loading…"
    // reports zero for every channel — which is how this read as "precondition
    // unmet" when the hierarchy was about to render perfectly well.
    await expect(page.getByTestId("communications-channel-email")).toBeVisible();
    await expect(page.getByTestId("communications-channel-sms")).toBeVisible();

    for (const channel of ["email", "sms"]) {
        const section = page.getByTestId(`communications-${channel}-locations`);
        if (await section.count()) {
            await expect(section).toBeVisible();
            return channel;
        }
    }
    throw new Error("no connected channel renders a school/room hierarchy — precondition genuinely unmet");
}

test.describe("H · the hierarchy is canonical, not a flat list", () => {
    test("H-1 the payload nests rooms under their school", async ({ page }) => {
        const tree = await hierarchy(page);
        expect(tree.sites.length).toBeGreaterThan(0);
        const withRooms = tree.sites.filter((s) => s.rooms.length > 0);
        expect(withRooms.length, "certification tenant must have rooms to prove nesting").toBeGreaterThan(0);
        // The defect: a room appearing as a top-level site.
        const siteIds = new Set(tree.sites.map((s) => s.id));
        for (const site of tree.sites) {
            for (const room of site.rooms) {
                expect(siteIds.has(room.id), `${room.label} is nested AND top-level`).toBe(false);
            }
        }
    });

    test("H-2 every room reaches the page, nested under its own school", async ({ page }) => {
        const tree = await hierarchy(page);
        const ch = await hierarchyChannel(page);

        for (const site of tree.sites) {
            if (!site.rooms.length) continue;
            const toggle = page.getByTestId(`communications-${ch}-school-${site.id}-toggle`);
            await expect(toggle, `${site.label} should offer a rooms toggle`).toBeVisible();
            await toggle.click();
            const rooms = page.getByTestId(`communications-${ch}-school-${site.id}-rooms`);
            await expect(rooms).toBeVisible();
            for (const room of site.rooms) {
                await expect(page.getByTestId(`communications-${ch}-room-${room.id}`)).toBeVisible();
            }
        }
    });

    test("H-3 rooms are collapsed by default, so many rooms stay compact", async ({ page }) => {
        const tree = await hierarchy(page);
        const site = tree.sites.find((s) => s.rooms.length > 0)!;
        const ch = await hierarchyChannel(page);
        // Present in the tree, not rendered until asked for.
        await expect(page.getByTestId(`communications-${ch}-school-${site.id}-rooms`)).toHaveCount(0);
        await expect(page.getByTestId(`communications-${ch}-school-${site.id}`)).toBeVisible();
    });

    test("H-4 a room shows what it inherits, and offers NO control", async ({ page }) => {
        const tree = await hierarchy(page);
        const site = tree.sites.find((s) => s.rooms.length > 0)!;
        const ch = await hierarchyChannel(page);
        await page.getByTestId(`communications-${ch}-school-${site.id}-toggle`).click();

        const room = site.rooms[0]!;
        const identity = page.getByTestId(`communications-${ch}-room-${room.id}-identity`);
        await expect(identity).toBeVisible();
        await expect(identity).toHaveText(/Uses .* identity|Nothing to inherit yet/);

        // The gate: a room must not be given its own identity while the runtime
        // cannot select one room truthfully for an outbound message.
        await expect(page.getByTestId(`communications-${ch}-location-${room.id}-action`)).toHaveCount(0);
    });

    test("H-5 a school still IS configurable — the deepest level that is", async ({ page }) => {
        const tree = await hierarchy(page);
        const site = tree.sites[0]!;
        const ch = await hierarchyChannel(page);
        await expect(page.getByTestId(`communications-${ch}-location-${site.id}-action`)).toBeVisible();
    });

    test("H-6 a room inheriting the ORGANIZATION says so; one under an overriding school says the school", async ({
        page,
    }) => {
        const tree = await hierarchy(page);
        const ch = await hierarchyChannel(page);
        for (const site of tree.sites) {
            if (!site.rooms.length) continue;
            await page.getByTestId(`communications-${ch}-school-${site.id}-toggle`).click();
            const schoolIdentity = await page
                .getByTestId(`communications-${ch}-location-${site.id}-identity`)
                .innerText();
            const overrides = !/Uses organization identity/i.test(schoolIdentity);
            const roomText = await page
                .getByTestId(`communications-${ch}-room-${site.rooms[0]!.id}-identity`)
                .innerText();
            if (overrides) {
                // Names the school it follows, not the organization.
                expect(roomText).toMatch(new RegExp(`Uses ${site.label} identity`, "i"));
            } else {
                expect(roomText).toMatch(/Uses organization identity/i);
            }
        }
    });
});

test.describe("P · the provider connection is reported as its own fact", () => {
    test("P-1 the card shows a Connection state distinct from send and receive", async ({ page }) => {
        await page.goto(PAGE);
        await expect(page.getByTestId("communications-channel-email")).toBeVisible();
        let asserted = 0;
        for (const channel of ["email", "sms"]) {
            await expect(page.getByTestId(`communications-channel-${channel}`)).toBeVisible();
            const connection = page.getByTestId(`communications-${channel}-provider-connection-state`);
            // A channel this spec inherited as disconnected shows a Connect card
            // instead. That is a legitimate state, not a missing Connection row.
            if (!(await connection.count())) continue;
            await expect(connection).toBeVisible();
            await expect(page.getByTestId(`communications-${channel}-sending-state`)).toBeVisible();
            await expect(page.getByTestId(`communications-${channel}-receiving-state`)).toBeVisible();
            asserted += 1;
        }
        expect(asserted, "no channel reported a Connection state at all").toBeGreaterThan(0);
    });

    test("P-2 sending and receiving never show the same sentence for a blocked connection", async ({ page }) => {
        const res = await page.request.get(BINDINGS);
        const json = (await res.json()) as { bindings?: Json[] };
        for (const b of json.bindings ?? []) {
            const readiness = b.readiness as
                | { send: { detail: string }; receive: { detail: string }; providerConnection: string }
                | undefined;
            if (!readiness) continue;
            if (readiness.providerConnection === "none_approved" || readiness.providerConnection === "unavailable") {
                expect(readiness.send.detail).not.toBe(readiness.receive.detail);
            }
        }
    });

    test("P-3 the retired copy is gone from every channel", async ({ page }) => {
        await page.goto(PAGE);
        await expect(page.getByTestId("communications-channel-email")).toBeVisible();
        const body = await page.locator("body").innerText();
        expect(body).not.toMatch(/nothing can be sent or received/i);
        expect(body).not.toMatch(/Ask your administrator to restore it/i);
    });

    test("P-4 no storage or secret vocabulary reaches the page", async ({ page }) => {
        await page.goto(PAGE);
        await expect(page.getByTestId("communications-channel-email")).toBeVisible();
        const body = await page.locator("body").innerText();
        for (const forbidden of ["secret_ref", "env:", "RESEND_API_KEY", "TWILIO_AUTH_TOKEN", "location_id", "parent_location_id"]) {
            expect(body, `${forbidden} must never be shown to an operator`).not.toContain(forbidden);
        }
    });
});

test.describe("E · Email's two identities are explained as different requirements", () => {
    test("E-1 the configure dialog distinguishes sending from receiving, and disclaims mailbox access", async ({
        page,
    }) => {
        await page.goto(PAGE);
        // Wait for the CARD before asking whether the button exists. Counting on a
        // page that has not rendered yet reports zero, and the earlier version of
        // this test skipped itself on that — a skip that looks like a pass.
        await expect(page.getByTestId("communications-channel-email")).toBeVisible();
        const configure = page.getByTestId("communications-configure-email");
        expect(await configure.count(), "email must be connected to configure it").toBeGreaterThan(0);
        await configure.click();

        await expect(page.getByTestId("communications-dialog-edit-from")).toBeVisible();
        await expect(page.getByTestId("communications-dialog-edit-inbound")).toBeVisible();

        const privacy = page.getByTestId("communications-dialog-mailbox-privacy");
        await expect(privacy).toBeVisible();
        const text = await privacy.innerText();
        expect(text).toMatch(/does not read anyone/i);
        expect(text).toMatch(/Gmail|Outlook/);
    });

    test("E-2 the dialog closes normally, above the assistant", async ({ page }) => {
        await page.goto(PAGE);
        await expect(page.getByTestId("communications-channel-email")).toBeVisible();
        await page.getByTestId("communications-configure-email").click();
        await expect(page.getByTestId("communications-dialog-edit-from")).toBeVisible();
        // Scoped to the dialog: the assistant also renders a Close control, and an
        // unscoped role lookup matches both.
        await page.getByTestId("communications-channel-dialog").getByRole("button", { name: "Close" }).click();
        await expect(page.getByTestId("communications-dialog-edit-from")).toHaveCount(0);
    });
});
