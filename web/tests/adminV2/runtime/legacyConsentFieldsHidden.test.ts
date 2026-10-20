/**
 * Identity surfaces never show the legacy consent checkboxes (field_values sms_opt_in, email_opt_in,
 * communication_opt_out, sms_consent, email_consent): no send path reads them. Consent is shown as the
 * person's Communication preferences, from the store every send path enforces.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveIdentityFieldRows, UNENFORCED_LEGACY_CONSENT_FIELD_KEYS } from "@/lib/adminV2/runtime/focusPanel/identity/resolveIdentityFieldRows";

const row = (fieldRef: string, value = "x") =>
    ({ value, policy: "visible", placement: { fieldRef, row: 0, column: 0, hideWhenEmpty: false, width: "full", tier: "details" } }) as never;

describe("legacy consent rows", () => {
    it.each([...UNENFORCED_LEGACY_CONSENT_FIELD_KEYS])("%s is not shown, whatever its reference shape", (key) => {
        const out = resolveIdentityFieldRows([row("person:first_name"), row(`person:${key}`), row(`custom.person.${key}`), row(key)]);
        expect(JSON.stringify(out)).not.toContain(key);
        expect(JSON.stringify(out)).toContain("first_name");
    });

    it("the household contact details host the Communication preferences panel", () => {
        const src = fs.readFileSync(path.join(process.cwd(), "components/admin/focusPanel/cards/HouseholdCard.tsx"), "utf8");
        expect(src).toMatch(/disclosure\.depth === "details" && isEditableHouseholdPersonId\(selectedIdentityRecord\.id\)/);
        expect(src).toContain("<PersonCommunicationPreferencesPanel");
    });
});
