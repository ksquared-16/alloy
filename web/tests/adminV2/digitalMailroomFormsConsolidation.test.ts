import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Doctrine enforcement: the Digital Mailroom is the SOLE operator surface for Forms.
 *
 * Forms is a Mailroom capability (Studio for authoring/packet-definitions, Work for
 * submissions/packet-sessions), never a standalone destination. These structural checks fail if
 * anyone reintroduces the retired /admin/forms operator experience or links an operator to it.
 *
 * `process.cwd()` is the `web/` package root under vitest.
 */
const WEB = process.cwd();

/** Recursively collect .ts/.tsx files under a dir. */
function walk(dir: string, acc: string[] = []): string[] {
    if (!existsSync(dir)) return acc;
    for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === ".next" || entry === "__tests__") continue;
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) walk(full, acc);
        else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
    }
    return acc;
}

/** Strip line- and block-comments so we only match real code/links. */
function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
}

describe("Digital Mailroom — Forms consolidation enforcement", () => {
    it("no standalone /admin/forms operator route directory exists", () => {
        expect(existsSync(join(WEB, "app/adminV2/forms"))).toBe(false);
        // legacy-admin forms clients are gone (only the folder-root redirect stub, if any, may remain — assert no page routes)
        const legacyForms = join(WEB, "app/legacy-admin/forms");
        if (existsSync(legacyForms)) {
            const files = walk(legacyForms);
            expect(files, `legacy-admin/forms should have no route/client files, found: ${files.join(", ")}`).toHaveLength(0);
        }
    });

    it("canonicalAdminRoutes no longer exports Forms-destination helpers", () => {
        const src = readFileSync(join(WEB, "lib/admin/canonicalAdminRoutes.ts"), "utf8");
        expect(src).not.toMatch(/export\s+(const|function)\s+ADMIN_FORMS_HREF/);
        expect(src).not.toMatch(/export\s+(const|function)\s+isCanonicalFormsPath/);
    });

    it("the operator sidebar has no standalone Forms nav item", () => {
        const src = readFileSync(join(WEB, "app/adminV2/components/SidebarModalNavItems.tsx"), "utf8");
        expect(src).not.toMatch(/SidebarFormsNavItem/);
        const sidebar = readFileSync(join(WEB, "app/adminV2/components/Sidebar.tsx"), "utf8");
        expect(sidebar).not.toMatch(/SidebarFormsNavItem/);
    });

    it("no operator navigation / route / search code links to /admin/forms or /adminV2/forms", () => {
        // Scan operator app + shared component/lib code (excludes tests, backend /api routes, and comments).
        const roots = [join(WEB, "app/adminV2"), join(WEB, "components"), join(WEB, "lib")];
        const offenders: string[] = [];
        for (const root of roots) {
            for (const file of walk(root)) {
                if (file.includes(`${WEB}/app/api/`)) continue; // backend API paths are preserved
                const code = stripComments(readFileSync(file, "utf8"));
                // Match string-literal operator paths only (quote/backtick + /admin(V2)/forms), not /api/admin/forms.
                const rx = /["'`]\/admin(?:V2)?\/forms(?![\w-])/g;
                if (rx.test(code) && !/\/api\/admin\/forms/.test(code.match(/["'`]\/admin(?:V2)?\/forms[^"'`]*/)?.[0] ?? "")) {
                    // Allow the single inert dead guard in FormsWorkspaceShell (returns null; never routes).
                    if (file.endsWith("components/forms/workspace/FormsWorkspaceShell.tsx")) continue;
                    offenders.push(file.replace(`${WEB}/`, ""));
                }
            }
        }
        expect(offenders, `operator code must not link to /admin/forms — offenders: ${offenders.join(", ")}`).toHaveLength(0);
    });

    it("the Digital Mailroom Studio owns the forms + packet lifecycle (surfaces present)", () => {
        // Studio hosts the authoritative builder and the packet-definition builder.
        expect(existsSync(join(WEB, "app/adminV2/pos/ProcessingFormBuilder.tsx"))).toBe(true);
        expect(existsSync(join(WEB, "app/adminV2/pos/ProcessingFormsStudio.tsx"))).toBe(true);
        expect(existsSync(join(WEB, "app/adminV2/pos/ProcessingPacketsStudio.tsx"))).toBe(true);
        expect(existsSync(join(WEB, "app/adminV2/pos/ProcessingPacketBuilder.tsx"))).toBe(true);
        // The builder composes the form-configuration panels (purpose/outcome/lifecycle/location/existing-record).
        const builder = readFileSync(join(WEB, "app/adminV2/pos/ProcessingFormBuilder.tsx"), "utf8");
        for (const panel of [
            "FormOperationalIntentPicker",
            "FormOutcomeConfigPanel",
            "FormLifecycleUsagePanel",
            "FormLocationShareLinksPanel",
            "FormExistingRecordSendPanel",
        ]) {
            expect(builder, `Studio builder must compose ${panel}`).toMatch(new RegExp(panel));
        }
        // The Studio Packets tab is realized (no longer a deferred placeholder).
        const studio = readFileSync(join(WEB, "app/adminV2/pos/ProcessingFormsStudio.tsx"), "utf8");
        expect(studio).toMatch(/ProcessingPacketsStudio/);
    });

    it("canonical intake + Processing on-ramps are preserved (unchanged)", () => {
        // Public form intake, Create-Lead intake, and packet-session → Processing on-ramps still exist.
        expect(existsSync(join(WEB, "lib/pos/processingIdentity/sources/formIntakeAdapter.ts"))).toBe(true);
        expect(existsSync(join(WEB, "lib/pos/processingIdentity/sources/createLeadIntakeAdapter.ts"))).toBe(true);
        expect(existsSync(join(WEB, "lib/pos/processingCase/maybeOpenProcessingCaseFromPacketCompletionSafe.ts"))).toBe(true);
        // Canonical form APIs preserved.
        expect(existsSync(join(WEB, "app/api/admin/forms"))).toBe(true);
        expect(existsSync(join(WEB, "app/api/public/forms"))).toBe(true);
    });
});
