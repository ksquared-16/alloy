/**
 * The Communications configuration surface, tested at the two places it can do
 * real harm: the secrets boundary, and claiming a readiness the runtime will not
 * honour.
 *
 * The correspondence tests matter most. `evaluateBindingReadiness` is a SECOND
 * opinion about whether a binding works, and a second opinion that drifts from
 * the certified runtime is worse than none — it turns the settings page into a
 * confident liar. So `send === "ready"` is asserted equivalent to
 * `bindingEligibleForOutboundComposer`, and `receive === "ready"` is asserted to
 * imply `bindingAcceptsInbound`, over a generated matrix rather than a handful of
 * chosen rows.
 */

import { describe, expect, it } from "vitest";

import {
    CERTIFICATION_SECRET_REF,
    credentialKeyForSecretRef,
    detectSecretBoundaryViolation,
    findCredentialOption,
    isConnectableChannel,
    listCredentialOptions,
    publicCredentialOption,
    selectCredential,
} from "@/lib/communications/providerCredentialCatalog";
import {
    evaluateBindingReadiness,
    hasBoundCredential,
    readinessLabel,
    receivingDomain,
    sendingDomain,
} from "@/lib/communications/bindingReadiness";
import {
    RECEIVING_ADDRESS_TAKEN_MESSAGE,
    translateBindingConstraintError,
    validateDisplayLabel,
    validateFromEmail,
    validateInboundAddress,
    validateInboundE164,
    validateStatus,
} from "@/lib/communications/bindingConfigInput";
import { bindingEligibleForOutboundComposer, type BindingSummary } from "@/lib/communications/composerChannels";
import { bindingAcceptsInbound, normalizeEmailAddress } from "@/lib/communications/email/inboundEmailRouting";

const PROVISIONED = { RESEND_API_KEY: "re_live_value", TWILIO_AUTH_TOKEN: "twilio_value" };
const BARE = {};

type Row = BindingSummary & { inbound_address?: string | null };

function row(over: Partial<Row> = {}): Row {
    return {
        id: "b1",
        channel: "email",
        provider: "resend",
        status: "active",
        secret_ref: "env:RESEND_API_KEY",
        inbound_address: "hello@northwind.example",
        config: { from_email: "hello@northwind.example" },
        ...over,
    };
}

// ---------------------------------------------------------------------------
// The secrets boundary
// ---------------------------------------------------------------------------

describe("credential catalogue — nothing secret crosses the boundary", () => {
    it("never emits secret_ref or the environment variable name", () => {
        const serialized = JSON.stringify(listCredentialOptions(PROVISIONED));
        expect(serialized).not.toContain("secretRef");
        expect(serialized).not.toContain("secret_ref");
        expect(serialized).not.toContain("envVar");
        expect(serialized).not.toContain("RESEND_API_KEY");
        expect(serialized).not.toContain("TWILIO_AUTH_TOKEN");
        expect(serialized).not.toContain("env:");
    });

    it("never emits the credential VALUE, even in the availability probe", () => {
        const serialized = JSON.stringify(listCredentialOptions(PROVISIONED));
        expect(serialized).not.toContain("re_live_value");
        expect(serialized).not.toContain("twilio_value");
        // `available` is a boolean, never a length or a fingerprint.
        for (const option of listCredentialOptions(PROVISIONED)) {
            expect(typeof option.available).toBe("boolean");
        }
    });

    it("reports availability from presence, and lists unprovisioned options anyway", () => {
        const provisioned = listCredentialOptions(PROVISIONED);
        const bare = listCredentialOptions(BARE);
        expect(provisioned.every((o) => o.available)).toBe(true);
        expect(bare.every((o) => !o.available)).toBe(true);
        // An operator must be able to see WHAT to provision.
        expect(bare.length).toBe(provisioned.length);
    });

    it("treats a whitespace-only environment value as not provisioned", () => {
        const [resend] = listCredentialOptions({ RESEND_API_KEY: "   " }).filter((o) => o.channel === "email");
        expect(resend?.available).toBe(false);
    });

    it("is an allow-list — an arbitrary env name is not selectable", () => {
        expect(findCredentialOption("env:DATABASE_URL")).toBeNull();
        expect(findCredentialOption("SUPABASE_SERVICE_ROLE_KEY")).toBeNull();
        expect(findCredentialOption("")).toBeNull();
        expect(findCredentialOption(null)).toBeNull();
        const attempt = selectCredential({ channel: "email", credentialKey: "env:DATABASE_URL", env: PROVISIONED });
        expect(attempt.ok).toBe(false);
        expect(attempt.ok === false && attempt.reason).toBe("unknown_credential");
    });

    it("refuses a credential the deployment has not provisioned", () => {
        const attempt = selectCredential({ channel: "email", credentialKey: "resend_deployment_key", env: BARE });
        expect(attempt.ok).toBe(false);
        expect(attempt.ok === false && attempt.reason).toBe("not_provisioned");
    });

    it("refuses a credential belonging to another channel", () => {
        const attempt = selectCredential({ channel: "sms", credentialKey: "resend_deployment_key", env: PROVISIONED });
        expect(attempt.ok).toBe(false);
        expect(attempt.ok === false && attempt.reason).toBe("channel_mismatch");
    });

    it("resolves an accepted choice to its stored secret_ref, server-side only", () => {
        const attempt = selectCredential({ channel: "email", credentialKey: "resend_deployment_key", env: PROVISIONED });
        expect(attempt.ok).toBe(true);
        expect(attempt.ok === true && attempt.option.secretRef).toBe("env:RESEND_API_KEY");
        expect(attempt.ok === true && attempt.option.provider).toBe("resend");
    });

    it("refuses a body carrying a secret, by field name, before any value is read", () => {
        for (const field of ["api_key", "apiKey", "secret", "secret_ref", "auth_token", "token", "password", "key"]) {
            const violation = detectSecretBoundaryViolation({ channel: "email", [field]: "re_live_abc123" });
            expect(violation, `field ${field} must be refused`).not.toBeNull();
            expect(violation?.field).toBe(field);
            // The rejection must not echo the value back.
            expect(violation?.message).not.toContain("re_live_abc123");
        }
    });

    it("allows the legitimate create body through", () => {
        expect(
            detectSecretBoundaryViolation({
                channel: "email",
                credential_key: "resend_deployment_key",
                inbound_address: "hello@northwind.example",
                from_email: "hello@northwind.example",
                display_label: "Front desk",
                status: "pending_verification",
            }),
        ).toBeNull();
    });

    it("maps a stored ref back to a catalogue key, and admits when it cannot", () => {
        expect(credentialKeyForSecretRef("env:RESEND_API_KEY")).toBe("resend_deployment_key");
        expect(credentialKeyForSecretRef("legacy_global_twilio")).toBe("twilio_legacy_global");
        expect(credentialKeyForSecretRef("unconfigured")).toBeNull();
        expect(credentialKeyForSecretRef("")).toBeNull();
        // Provisioned by a runbook this surface does not manage — null key, but the
        // route still reports credential_configured: true.
        expect(credentialKeyForSecretRef("env:SOME_OTHER_KEY")).toBeNull();
    });

    it("only email and sms are connectable", () => {
        expect(isConnectableChannel("email")).toBe(true);
        expect(isConnectableChannel("SMS")).toBe(true);
        expect(isConnectableChannel("in_app")).toBe(false);
        expect(isConnectableChannel("")).toBe(false);
        expect(isConnectableChannel(null)).toBe(false);
    });

    it("publicCredentialOption is the one seam, and it strips both private fields", () => {
        const option = findCredentialOption("twilio_deployment_token")!;
        const pub = publicCredentialOption(option, PROVISIONED) as Record<string, unknown>;
        expect(Object.keys(pub).sort()).toEqual(
            ["available", "channel", "description", "key", "label", "provider"].sort(),
        );
    });
});

// ---------------------------------------------------------------------------
// Readiness — the two answers, and their correspondence to the runtime
// ---------------------------------------------------------------------------

describe("readiness is reported separately for send and receive", () => {
    it("an email channel that can send but has no receiving address is NOT simply ready", () => {
        const r = evaluateBindingReadiness(row({ inbound_address: null }));
        expect(r.send.state).toBe("ready");
        expect(r.receive.state).toBe("setup_required");
        expect(r.receive.detail).toMatch(/replies cannot reach Alloy/i);
    });

    it("an email channel with an address but no credential can neither send nor receive", () => {
        const r = evaluateBindingReadiness(row({ secret_ref: "unconfigured" }));
        expect(r.send.state).toBe("setup_required");
        expect(r.receive.state).toBe("setup_required");
        // Receiving is refused because the BODY cannot be retrieved without a key,
        // not merely because ownership is unresolvable.
        expect(r.receive.detail).toMatch(/cannot be retrieved/i);
    });

    it("pending_verification is verification_required — never ready, never green", () => {
        const r = evaluateBindingReadiness(row({ status: "pending_verification" }));
        expect(r.send.state).toBe("verification_required");
        expect(r.receive.state).toBe("verification_required");
        expect(r.receive.detail).toContain("northwind.example");
        expect(r.receive.detail).toMatch(/MX/);
    });

    it("disabled outranks everything, in both directions", () => {
        const r = evaluateBindingReadiness(row({ status: "disabled", secret_ref: "unconfigured", inbound_address: null }));
        expect(r.send.state).toBe("disabled");
        expect(r.receive.state).toBe("disabled");
    });

    it("a provider with no runtime is provider_unavailable, not setup_required", () => {
        const r = evaluateBindingReadiness(row({ provider: "sendgrid" }));
        expect(r.send.state).toBe("provider_unavailable");
        expect(r.receive.state).toBe("provider_unavailable");
        expect(r.send.detail).toContain("resend");
    });

    it("a missing credential outranks pending verification — the more actionable truth wins", () => {
        const r = evaluateBindingReadiness(row({ status: "pending_verification", secret_ref: "unconfigured" }));
        expect(r.send.state).toBe("setup_required");
        expect(r.receive.state).toBe("setup_required");
    });

    it("says plainly when sending falls back to the deployment default address", () => {
        const r = evaluateBindingReadiness(row({ config: {} }));
        expect(r.send.state).toBe("ready");
        expect(r.send.detail).toMatch(/default From address/i);
    });

    it("an SMS channel reports its own two answers", () => {
        const sms = row({
            channel: "sms",
            provider: "twilio",
            secret_ref: "legacy_global_twilio",
            inbound_address: null,
            inbound_to_e164: "+15551234567",
            config: {},
        });
        const r = evaluateBindingReadiness(sms);
        expect(r.send.state).toBe("ready");
        expect(r.receive.state).toBe("ready");
        expect(evaluateBindingReadiness({ ...sms, inbound_to_e164: null }).receive.state).toBe("setup_required");
    });

    it("hasBoundCredential treats empty and unconfigured alike", () => {
        expect(hasBoundCredential(row({ secret_ref: "unconfigured" }))).toBe(false);
        expect(hasBoundCredential(row({ secret_ref: "" }))).toBe(false);
        expect(hasBoundCredential(row({ secret_ref: "   " }))).toBe(false);
        expect(hasBoundCredential(row({ secret_ref: "env:RESEND_API_KEY" }))).toBe(true);
    });

    it("every state has an operator-facing label", () => {
        for (const s of ["ready", "setup_required", "verification_required", "disabled", "provider_unavailable"] as const) {
            expect(readinessLabel(s).length).toBeGreaterThan(0);
        }
    });
});

describe("readiness corresponds to the certified runtimes rather than restating them", () => {
    /** Every combination that could plausibly reach this surface. */
    const MATRIX: Row[] = [];
    for (const channel of ["email", "sms"]) {
        for (const provider of ["resend", "twilio", "sendgrid", ""]) {
            for (const status of ["active", "disabled", "pending_verification"]) {
                for (const secret_ref of ["env:RESEND_API_KEY", "legacy_global_twilio", "unconfigured", ""]) {
                    for (const inbound of ["hello@northwind.example", null]) {
                        MATRIX.push({
                            id: `${channel}-${provider}-${status}-${secret_ref}-${inbound}`,
                            channel,
                            provider,
                            status,
                            secret_ref,
                            inbound_address: channel === "email" ? inbound : null,
                            inbound_to_e164: channel === "sms" && inbound ? "+15551234567" : null,
                            config: {},
                        });
                    }
                }
            }
        }
    }

    it("covers a meaningful matrix", () => {
        expect(MATRIX.length).toBe(2 * 4 * 3 * 4 * 2);
    });

    it("send === ready is exactly what the composer would accept", () => {
        for (const b of MATRIX) {
            const send = evaluateBindingReadiness(b).send.state;
            expect(send === "ready", `binding ${b.id}`).toBe(bindingEligibleForOutboundComposer(b));
        }
    });

    it("receive === ready implies the inbound router would accept ownership (email)", () => {
        for (const b of MATRIX.filter((r) => r.channel === "email")) {
            const receive = evaluateBindingReadiness(b).receive.state;
            if (receive !== "ready") continue;
            expect(
                bindingAcceptsInbound({
                    id: b.id,
                    org_id: "org",
                    channel: String(b.channel),
                    provider: String(b.provider ?? ""),
                    status: String(b.status ?? ""),
                    inbound_address: b.inbound_address ?? null,
                }),
                `binding ${b.id}`,
            ).toBe(true);
        }
    });

    it("no binding is ever reported ready in a direction while its status is disabled", () => {
        for (const b of MATRIX.filter((r) => r.status === "disabled")) {
            const r = evaluateBindingReadiness(b);
            expect(r.send.state).toBe("disabled");
            expect(r.receive.state).toBe("disabled");
        }
    });

    it("every direction on every row carries a non-empty operator sentence", () => {
        for (const b of MATRIX) {
            const r = evaluateBindingReadiness(b);
            expect(r.send.detail.trim().length, `send ${b.id}`).toBeGreaterThan(0);
            expect(r.receive.detail.trim().length, `receive ${b.id}`).toBeGreaterThan(0);
        }
    });
});

describe("domains are derived, never a second source of truth", () => {
    it("receiving domain comes from the address", () => {
        expect(receivingDomain("Hello@Northwind.Example")).toBe("northwind.example");
        expect(receivingDomain("Front Desk <hello@northwind.example>")).toBe("northwind.example");
        expect(receivingDomain(null)).toBeNull();
        expect(receivingDomain("not-an-address")).toBeNull();
    });

    it("sending domain comes from the From address", () => {
        expect(sendingDomain("no-reply@mail.northwind.example")).toBe("mail.northwind.example");
        expect(sendingDomain("")).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe("operator input is validated the way the runtime reads it", () => {
    it("stores a receiving address exactly as inbound routing normalizes it", () => {
        for (const raw of ["Hello@Northwind.Example", "  hello@northwind.example  ", "Desk <Hello@Northwind.Example>"]) {
            const v = validateInboundAddress(raw);
            expect(v.ok).toBe(true);
            // The unique index is on lower(inbound_address) and ownership compares
            // normalized forms — storing anything else is unroutable.
            expect(v.ok === true && v.value).toBe(normalizeEmailAddress(raw));
        }
    });

    it("blank means cleared, not invalid", () => {
        for (const raw of [null, undefined, "", "   "]) {
            const v = validateInboundAddress(raw);
            expect(v.ok === true && v.value).toBeNull();
        }
    });

    it("rejects an address that is not an address", () => {
        for (const raw of ["hello", "hello@", "@northwind.example", "hello@localhost", 42]) {
            expect(validateInboundAddress(raw).ok, String(raw)).toBe(false);
        }
    });

    it("rejects a From address carrying a display name", () => {
        const v = validateFromEmail("Northwind Front Desk <hello@northwind.example>");
        expect(v.ok).toBe(false);
        // Because the same value mints <alloy.{id}@{domain}>, which correlation
        // matches on — a display-name form produces an unmatched Message-ID.
        expect(v.ok === false && v.error.message).toMatch(/without a display name/i);
    });

    it("accepts and normalizes a plain From address", () => {
        const v = validateFromEmail("  Hello@Northwind.Example ");
        expect(v.ok === true && v.value).toBe("hello@northwind.example");
    });

    it("validates E.164 and forgives human punctuation", () => {
        const v = validateInboundE164("+1 (555) 123-4567");
        expect(v.ok === true && v.value).toBe("+15551234567");
        for (const bad of ["5551234567", "+0555123", "+", "abc"]) {
            expect(validateInboundE164(bad).ok, bad).toBe(false);
        }
    });

    it("labels are trimmed, bounded, and empty becomes null", () => {
        const v = validateDisplayLabel("  Front desk  ");
        expect(v.ok === true && v.value).toBe("Front desk");
        const blank = validateDisplayLabel("   ");
        expect(blank.ok === true && blank.value).toBeNull();
        const long = validateDisplayLabel("x".repeat(500));
        expect(long.ok === true && long.value?.length).toBe(200);
    });

    it("status is restricted to the stored vocabulary", () => {
        expect(validateStatus("active").ok).toBe(true);
        expect(validateStatus("PENDING_VERIFICATION").ok).toBe(true);
        expect(validateStatus("enabled").ok).toBe(false);
        expect(validateStatus(undefined).ok).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Collision — global uniqueness, told safely
// ---------------------------------------------------------------------------

describe("a receiving-address collision is explained without naming the other tenant", () => {
    const collision = {
        code: "23505",
        message:
            'duplicate key value violates unique constraint "communication_bindings_inbound_address_uq"',
        details: "Key (provider, channel, lower(inbound_address))=(resend, email, hello@northwind.example) already exists.",
    };

    it("returns 409 and the exact operator-safe sentence", () => {
        const t = translateBindingConstraintError(collision);
        expect(t).not.toBeNull();
        expect(t?.status).toBe(409);
        expect(t?.message).toBe(RECEIVING_ADDRESS_TAKEN_MESSAGE);
    });

    it("leaks neither the constraint name nor the conflicting value", () => {
        const t = translateBindingConstraintError(collision);
        expect(t?.message).not.toContain("communication_bindings_inbound_address_uq");
        expect(t?.message).not.toContain("hello@northwind.example");
        expect(t?.message).not.toContain("duplicate key");
        expect(t?.message.toLowerCase()).not.toContain("org");
    });

    it("handles the SMS number constraint too", () => {
        const t = translateBindingConstraintError({
            code: "23505",
            message: 'duplicate key value violates unique constraint "communication_bindings_org_inbound_to_uq"',
        });
        expect(t?.status).toBe(409);
        expect(t?.message).toMatch(/receiving number/i);
    });

    it("an unrecognised unique violation is still a conflict, still described in our words", () => {
        const t = translateBindingConstraintError({
            code: "23505",
            message: 'duplicate key value violates unique constraint "some_other_uq"',
            details: "Key (x)=(secret-ish) already exists.",
        });
        expect(t?.status).toBe(409);
        expect(t?.message).not.toContain("some_other_uq");
        expect(t?.message).not.toContain("secret-ish");
    });

    it("returns null for anything that is not a unique violation, so callers cannot guess", () => {
        expect(translateBindingConstraintError({ code: "23503", message: "foreign key" })).toBeNull();
        expect(translateBindingConstraintError({ code: null, message: "permission denied" })).toBeNull();
        expect(translateBindingConstraintError({})).toBeNull();
    });
});


/**
 * The certification-only credential must be exactly that. If it ever became
 * selectable outside a certification run it would be a way to create a channel
 * that looks connected and cannot send — so the boundary is asserted, not assumed.
 */
describe("the certification credential is unreachable outside certification", () => {
    const CERT_ENV = { ALLOY_CERTIFICATION: "1" };

    it("does not appear in the catalogue of a normal deployment", () => {
        const normal = listCredentialOptions(PROVISIONED).map((o) => o.key);
        expect(normal).not.toContain("certification_email");
        expect(normal).not.toContain("certification_sms");
    });

    it("cannot be selected in a normal deployment, even by exact key", () => {
        for (const key of ["certification_email", "certification_sms"]) {
            const attempt = selectCredential({ channel: key.endsWith("sms") ? "sms" : "email", credentialKey: key, env: PROVISIONED });
            expect(attempt.ok, `${key} must be unknown outside certification`).toBe(false);
            expect(attempt.ok === false && attempt.reason).toBe("unknown_credential");
        }
    });

    it("IS selectable in a certification run — which is the point", () => {
        const attempt = selectCredential({ channel: "email", credentialKey: "certification_email", env: CERT_ENV });
        expect(attempt.ok).toBe(true);
        expect(attempt.ok === true && attempt.option.secretRef).toBe(CERTIFICATION_SECRET_REF);
    });

    it("its secret_ref is NOT an env reference and NOT a known sentinel", () => {
        // Both resolvers treat an unknown convention as "no secret", so this
        // cannot authenticate to a provider even if real keys are present.
        expect(CERTIFICATION_SECRET_REF.startsWith("env:")).toBe(false);
        expect(CERTIFICATION_SECRET_REF).not.toBe("legacy_global_twilio");
        expect(CERTIFICATION_SECRET_REF).not.toBe("unconfigured");
    });

    it("still emits no credential material when certification is on", () => {
        const serialized = JSON.stringify(listCredentialOptions(CERT_ENV));
        expect(serialized).not.toContain("secretRef");
        expect(serialized).not.toContain(CERTIFICATION_SECRET_REF);
        expect(serialized).not.toContain("env:");
    });

    it("the real deployment credentials are unaffected by the certification flag", () => {
        const both = listCredentialOptions({ ...PROVISIONED, ALLOY_CERTIFICATION: "1" });
        expect(both.find((o) => o.key === "resend_deployment_key")?.available).toBe(true);
        expect(both.find((o) => o.key === "certification_email")?.available).toBe(true);
    });
});
