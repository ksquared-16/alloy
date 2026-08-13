"use client";

/**
 * Connect or configure one Communications channel.
 *
 * Everything an administrator can change about a channel lives here, in the
 * organization's own words: the identity Alloy sends as, the address or number
 * replies come back to, whether the channel is on, and which one is the default
 * when several exist.
 *
 * The credential is the one thing they choose but never type. The picker offers
 * what the deployment has provisioned and nothing else — see
 * `providerCredentialCatalog.ts`. There is no key field, and adding one would be
 * refused by the route regardless.
 *
 * Errors are shown exactly as the server phrased them. That matters most for the
 * duplicate-address case: the receiving-address index is global across tenants, so
 * the server deliberately says only that the address is taken. Re-wording it here
 * risks inventing detail about another organization.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z } from "@/components/admin/Drawer";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import type { BindingView, ChannelCard, OrgLocation } from "@/lib/communications/organizationCommunicationsModel";
import type { CredentialOption } from "./OrganizationCommunicationsPage";

const BINDINGS = "/api/admin/communications/bindings";

type Props = {
    card: ChannelCard;
    mode: "connect" | "configure";
    /** Null = the organization default identity. Otherwise the location being configured. */
    locationId: string | null;
    locations: OrgLocation[];
    bindings: BindingView[];
    credentialOptions: CredentialOption[];
    onClose: () => void;
    onSaved: () => void | Promise<void>;
};

function fieldLabel(channel: string, key: "identity" | "receiving"): string {
    if (channel === "email") return key === "identity" ? "Send as" : "Replies come back to";
    return key === "identity" ? "Send from" : "Number families text";
}

export default function CommunicationsChannelDialog({
    card,
    mode,
    locationId,
    locations,
    bindings,
    credentialOptions,
    onClose,
    onSaved,
}: Props) {
    const isEmail = card.channel === "email";

    // Scope the dialog to what is being configured: one location's identity, or
    // the organization default. Without this, editing Riverside would silently
    // load the organization's binding and overwrite it.
    const scopedBindings = bindings.filter((b) =>
        locationId ? (b.location_id ?? null) === locationId : !(b.location_id ?? null),
    );
    const connecting = mode === "connect" || scopedBindings.length === 0;
    const locationLabel = locationId ? (locations.find((l) => l.id === locationId)?.label ?? "this location") : null;

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Connect form
    const [credentialKey, setCredentialKey] = useState("");
    const [label, setLabel] = useState("");
    const [fromEmail, setFromEmail] = useState("");
    const [inboundAddress, setInboundAddress] = useState("");
    const [inboundNumber, setInboundNumber] = useState("");

    // Configure form — one binding at a time, defaulting to the channel's face.
    const [editingId, setEditingId] = useState<string | null>(
        locationId ? (scopedBindings[0]?.id ?? null) : card.primaryBindingId,
    );
    const editing = useMemo(
        () => scopedBindings.find((b) => b.id === editingId) ?? scopedBindings[0] ?? null,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [bindings, editingId, locationId],
    );

    const [editFrom, setEditFrom] = useState("");
    const [editInbound, setEditInbound] = useState("");
    const [editNumber, setEditNumber] = useState("");
    const [editLabel, setEditLabel] = useState("");
    const [editEnabled, setEditEnabled] = useState(true);
    const [editPrimary, setEditPrimary] = useState(false);

    useEffect(() => {
        const first = credentialOptions.find((c) => c.available) ?? credentialOptions[0];
        setCredentialKey(first?.key ?? "");
    }, [credentialOptions]);

    useEffect(() => {
        if (!editing) return;
        setEditFrom(editing.from_email ?? "");
        setEditInbound(editing.inbound_address ?? "");
        setEditNumber(editing.inbound_to_e164 ?? "");
        setEditLabel(editing.display_label ?? "");
        setEditEnabled(String(editing.status ?? "").toLowerCase() !== "disabled");
        setEditPrimary(Boolean(editing.is_primary));
    }, [editing]);

    const chosenCredential = credentialOptions.find((c) => c.key === credentialKey) ?? null;

    async function submit(url: string, method: "POST" | "PATCH", payload: Record<string, unknown>) {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(url, {
                method,
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? `Could not save (${res.status})`);
            await onSaved();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save");
        } finally {
            setBusy(false);
        }
    }

    const doConnect = () =>
        submit(BINDINGS, "POST", {
            channel: card.channel,
            credential_key: credentialKey,
            location_id: locationId,
            display_label: label.trim() || null,
            status: "pending_verification",
            ...(isEmail
                ? { from_email: fromEmail.trim() || null, inbound_address: inboundAddress.trim() || null }
                : { inbound_to_e164: inboundNumber.trim() || null }),
        });

    const doSave = () => {
        if (!editing) return;
        submit(`${BINDINGS}/${encodeURIComponent(editing.id)}`, "PATCH", {
            display_label: editLabel.trim() || null,
            status: editEnabled ? "active" : "disabled",
            is_primary: editPrimary,
            ...(isEmail
                ? { from_email: editFrom.trim() || null, inbound_address: editInbound.trim() || null }
                : { inbound_to_e164: editNumber.trim() || null }),
        });
    };

    /**
     * Return this location to the organization identity.
     *
     * Clearing `location_id` rather than deleting the binding is deliberate: the
     * receiving address stays claimed by this tenant (the global uniqueness index
     * still protects it) and the conversation history that referenced it stays
     * intact. Deleting would free the address for another organization to claim
     * and orphan every message that named it.
     */
    const doRemoveOverride = () => {
        if (!editing) return;
        submit(`${BINDINGS}/${encodeURIComponent(editing.id)}`, "PATCH", { location_id: null });
    };

    if (typeof document === "undefined") return null;

    // PORTALED TO BODY, at the platform's nested-overlay z.
    //
    // A plain `z-[120]` was not enough and the reason is the classic one: this
    // dialog renders inside the workspace, so its z-index competes only within
    // that stacking context. The floating BOS assistant is portaled to `body`, so
    // it sat above the dialog regardless — certification caught the dialog's own
    // Close button being unclickable, which is the same "button does nothing"
    // failure this platform has hit before with nested portals.
    //
    // `ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z` is the existing constant for
    // exactly this, already used by the Processing dialogs.
    return createPortal(
        <div
            style={{ zIndex: ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z }}
            className="fixed inset-0 flex items-center justify-center bg-alloy-midnight/35 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`${connecting ? "Connect" : "Configure"} ${card.channelLabel}`}
            data-testid="communications-channel-dialog"
        >
            <div className="max-h-[88vh] w-full max-w-lg overflow-auto rounded-xl border border-alloy-stone/30 bg-white shadow-xl">
                <header className="flex items-baseline justify-between gap-2 border-b border-alloy-stone/25 px-4 py-3">
                    <div>
                        <h2 className="config-typo-workspace-title">
                            {locationLabel
                                ? `${locationLabel} — ${card.channelLabel}`
                                : connecting
                                  ? `Connect ${card.channelLabel}`
                                  : `${card.channelLabel} — organization default`}
                        </h2>
                        <p className="mt-0.5 text-[11px] text-alloy-midnight/55">
                            Alloy never asks for an API key — choose a credential this deployment already provides.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="rounded p-1 text-alloy-midnight/50 hover:bg-alloy-stone/10"
                        data-testid="communications-dialog-close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </header>

                <div className="space-y-3 px-4 py-3 text-[12px]">
                    {connecting ? (
                        <>
                            {/*
                              * WHAT AM I CONNECTING TO? An administrator must be able
                              * to answer that before clicking, without reading code or
                              * asking an engineer. Provider, the named connection, and
                              * whether choosing it makes real external delivery
                              * possible — stated plainly, with no credential detail.
                              */}
                            <dl
                                className="rounded-md border border-alloy-stone/25 bg-alloy-stone/[0.04] px-2.5 py-2 text-[11px]"
                                data-testid="communications-dialog-connection-summary"
                            >
                                <div className="flex justify-between gap-2">
                                    <dt className="text-alloy-midnight/50">Provider</dt>
                                    <dd className="font-medium text-alloy-midnight/85">
                                        {card.providerLabel ?? (isEmail ? "Resend" : "Twilio")}
                                    </dd>
                                </div>
                                <div className="mt-0.5 flex justify-between gap-2">
                                    <dt className="text-alloy-midnight/50">Connection</dt>
                                    <dd
                                        className="min-w-0 truncate font-medium text-alloy-midnight/85"
                                        data-testid="communications-dialog-connection-name"
                                    >
                                        {chosenCredential?.label ?? "None available"}
                                    </dd>
                                </div>
                                <div className="mt-0.5 flex justify-between gap-2">
                                    <dt className="text-alloy-midnight/50">Real messages</dt>
                                    <dd
                                        className={
                                            chosenCredential?.externalSendCapable
                                                ? "font-semibold text-amber-900"
                                                : "font-medium text-alloy-midnight/70"
                                        }
                                        data-testid="communications-dialog-external-capability"
                                    >
                                        {chosenCredential
                                            ? chosenCredential.externalSendCapable
                                                ? "Yes — can send to real people"
                                                : "No — cannot leave this environment"
                                            : "—"}
                                    </dd>
                                </div>
                            </dl>

                            {credentialOptions.length === 0 || !credentialOptions.some((c) => c.available) ? (
                                <p
                                    className="rounded-md border border-alloy-ember/30 bg-alloy-ember/[0.06] px-2.5 py-2 text-[11px] leading-snug text-alloy-ember"
                                    data-testid="communications-dialog-no-connection"
                                >
                                    <strong>No approved connection is available.</strong> This deployment has no{" "}
                                    {isEmail ? "email" : "SMS"} provider connection configured, so this channel cannot be
                                    completed here. An administrator must configure one for the deployment first.
                                </p>
                            ) : null}

                            <Field label="Credential">
                                <select
                                    value={credentialKey}
                                    onChange={(e) => setCredentialKey(e.target.value)}
                                    className="config-input w-full rounded border border-alloy-stone/30 px-2 py-1.5 text-[12px]"
                                    data-testid="communications-dialog-credential"
                                >
                                    {credentialOptions.length === 0 ? <option value="">None available</option> : null}
                                    {credentialOptions.map((c) => (
                                        <option key={c.key} value={c.key} disabled={!c.available}>
                                            {c.label}
                                            {c.available ? "" : " — not available yet"}
                                        </option>
                                    ))}
                                </select>
                                {chosenCredential ? (
                                    <Hint>
                                        {chosenCredential.description}
                                        {chosenCredential.available ? null : (
                                            <strong className="text-alloy-ember">
                                                {" "}
                                                Ask your administrator to add this to the deployment first.
                                            </strong>
                                        )}
                                    </Hint>
                                ) : null}
                            </Field>

                            <Field label="Name (optional)">
                                <input
                                    value={label}
                                    onChange={(e) => setLabel(e.target.value)}
                                    placeholder="Front desk"
                                    className="config-input w-full rounded border border-alloy-stone/30 px-2 py-1.5 text-[12px]"
                                    data-testid="communications-dialog-label"
                                />
                            </Field>

                            {isEmail ? (
                                <>
                                    <Field label={fieldLabel("email", "identity")}>
                                        <input
                                            type="email"
                                            value={fromEmail}
                                            onChange={(e) => setFromEmail(e.target.value)}
                                            placeholder="hello@yourschool.org"
                                            className="config-input w-full rounded border border-alloy-stone/30 px-2 py-1.5 font-mono text-[12px]"
                                            data-testid="communications-dialog-from"
                                        />
                                        <Hint>Leave blank to use the default sending address.</Hint>
                                    </Field>
                                    <Field label={fieldLabel("email", "receiving")}>
                                        <input
                                            type="email"
                                            value={inboundAddress}
                                            onChange={(e) => setInboundAddress(e.target.value)}
                                            placeholder="families@yourschool.org"
                                            className="config-input w-full rounded border border-alloy-stone/30 px-2 py-1.5 font-mono text-[12px]"
                                            data-testid="communications-dialog-inbound"
                                        />
                                        <Hint>This address needs its mail routed to Alloy&apos;s provider.</Hint>
                                    </Field>
                                </>
                            ) : (
                                <Field label={fieldLabel("sms", "receiving")}>
                                    <input
                                        type="tel"
                                        value={inboundNumber}
                                        onChange={(e) => setInboundNumber(e.target.value)}
                                        placeholder="+15551234567"
                                        className="config-input w-full rounded border border-alloy-stone/30 px-2 py-1.5 font-mono text-[12px]"
                                        data-testid="communications-dialog-number"
                                    />
                                </Field>
                            )}

                            <p className="text-[11px] text-alloy-midnight/55">
                                The channel is connected as <strong>not yet verified</strong> — nothing is sent or received until the
                                provider side is confirmed. This page reports when sending and receiving each start working.
                            </p>
                        </>
                    ) : (
                        <>
                            {scopedBindings.length > 1 ? (
                                <Field label="Which one">
                                    <select
                                        value={editing?.id ?? ""}
                                        onChange={(e) => setEditingId(e.target.value)}
                                        className="config-input w-full rounded border border-alloy-stone/30 px-2 py-1.5 text-[12px]"
                                        data-testid="communications-dialog-which"
                                    >
                                        {scopedBindings.map((b) => (
                                            <option key={b.id} value={b.id}>
                                                {b.display_label ||
                                                    b.from_email ||
                                                    b.inbound_address ||
                                                    b.inbound_to_e164 ||
                                                    card.channelLabel}
                                                {b.is_primary ? " (default)" : ""}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            ) : null}

                            <Field label="Name">
                                <input
                                    value={editLabel}
                                    onChange={(e) => setEditLabel(e.target.value)}
                                    className="config-input w-full rounded border border-alloy-stone/30 px-2 py-1.5 text-[12px]"
                                    data-testid="communications-dialog-edit-label"
                                />
                            </Field>

                            {isEmail ? (
                                <>
                                    <Field label={fieldLabel("email", "identity")}>
                                        <input
                                            type="email"
                                            value={editFrom}
                                            onChange={(e) => setEditFrom(e.target.value)}
                                            placeholder="Using the default sending address"
                                            className="config-input w-full rounded border border-alloy-stone/30 px-2 py-1.5 font-mono text-[12px]"
                                            data-testid="communications-dialog-edit-from"
                                        />
                                    </Field>
                                    <Field label={fieldLabel("email", "receiving")}>
                                        <input
                                            type="email"
                                            value={editInbound}
                                            onChange={(e) => setEditInbound(e.target.value)}
                                            placeholder="families@yourschool.org"
                                            className="config-input w-full rounded border border-alloy-stone/30 px-2 py-1.5 font-mono text-[12px]"
                                            data-testid="communications-dialog-edit-inbound"
                                        />
                                    </Field>
                                </>
                            ) : (
                                <Field label={fieldLabel("sms", "receiving")}>
                                    <input
                                        type="tel"
                                        value={editNumber}
                                        onChange={(e) => setEditNumber(e.target.value)}
                                        className="config-input w-full rounded border border-alloy-stone/30 px-2 py-1.5 font-mono text-[12px]"
                                        data-testid="communications-dialog-edit-number"
                                    />
                                </Field>
                            )}

                            <label className="flex items-center gap-2" data-testid="communications-dialog-enabled-row">
                                <input
                                    type="checkbox"
                                    checked={editEnabled}
                                    onChange={(e) => setEditEnabled(e.target.checked)}
                                    data-testid="communications-dialog-enabled"
                                />
                                <span className="text-[12px] text-alloy-midnight/75">Channel is switched on</span>
                            </label>

                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={editPrimary}
                                    onChange={(e) => setEditPrimary(e.target.checked)}
                                    data-testid="communications-dialog-primary"
                                />
                                <span className="text-[12px] text-alloy-midnight/75">
                                    Use this as the default {card.channelLabel} identity
                                </span>
                            </label>
                        </>
                    )}

                    {error ? (
                        <p className="rounded border border-alloy-ember/30 bg-alloy-ember/[0.06] px-2.5 py-2 text-[12px] text-alloy-ember"
                           role="alert"
                           data-testid="communications-dialog-error">
                            {error}
                        </p>
                    ) : null}
                </div>

                <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-alloy-stone/25 px-4 py-3">
                    {locationId && !connecting && editing ? (
                        <button
                            type="button"
                            onClick={() => void doRemoveOverride()}
                            disabled={busy}
                            className="mr-auto text-[11px] font-semibold text-alloy-ember hover:underline disabled:opacity-50"
                            data-testid="communications-dialog-remove-override"
                        >
                            Use the organization identity instead
                        </button>
                    ) : null}
                    <ConfigurationSecondaryButton onClick={onClose} disabled={busy}>
                        Cancel
                    </ConfigurationSecondaryButton>
                    <ConfigurationPrimaryButton
                        onClick={() => void (connecting ? doConnect() : doSave())}
                        disabled={busy || (connecting && !(chosenCredential?.available ?? false))}
                        data-testid="communications-dialog-submit"
                    >
                        {busy ? "Saving…" : connecting ? `Connect ${card.channelLabel}` : "Save changes"}
                    </ConfigurationPrimaryButton>
                </footer>
            </div>
        </div>,
        document.body,
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-0.5 block text-[11px] font-medium text-alloy-midnight/55">{label}</span>
            {children}
        </label>
    );
}

function Hint({ children }: { children: React.ReactNode }) {
    return <span className="mt-0.5 block text-[11px] leading-snug text-alloy-midnight/52">{children}</span>;
}
