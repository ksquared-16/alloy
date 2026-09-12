"use client";

/**
 * Trusted attendance devices — the operator product over the promoted kiosk
 * substrate.
 *
 * ── NO HEALTH, ON PURPOSE ──
 *
 * There is no "online", no "last seen" and no stale-device warning here. The
 * `last_seen_at` column exists and nothing writes it, so every one of those would
 * be an invented fact — and the reassuring version ("healthy") would be the
 * dangerous one. When the write is wired, health belongs here and not before.
 *
 * ── THE SECRET IS SHOWN ONCE ──
 *
 * Registration and rotation return a credential exactly once and it cannot be
 * recovered afterwards. That is why it is presented as a deliberate hand-off step
 * rather than a field on the row: a screen that could re-display it would make
 * the inventory itself a credential leak. The list shows only the last four
 * characters, which identify a tablet without authenticating as one.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import {
    ConfigurationContext,
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    kioskCapabilityLabel,
    type KioskDeviceAdminRow,
} from "@/lib/childcareOperational/attendance/kiosk/kioskDeviceAdministration";

type SiteOption = { id: string; label: string };

function formatWhen(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export default function KioskDevicesConfigurationPage() {
    const [devices, setDevices] = useState<KioskDeviceAdminRow[]>([]);
    const [sites, setSites] = useState<SiteOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const [registerOpen, setRegisterOpen] = useState(false);
    const [newLabel, setNewLabel] = useState("");
    const [newSiteId, setNewSiteId] = useState("");

    /** The one-time credential hand-off. Cleared by the operator, never re-fetchable. */
    const [issued, setIssued] = useState<{ label: string; credential: string } | null>(null);
    const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setError(null);
        try {
            const res = await fetch("/api/admin/attendance/kiosk-devices");
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to load devices");
            setDevices((json.devices ?? []) as KioskDeviceAdminRow[]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load devices.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    useEffect(() => {
        void (async () => {
            try {
                const res = await fetch("/api/admin/locations?location_type=site");
                const json = await res.json().catch(() => ({}));
                const rows = (json.locations ?? json.data ?? []) as { id: string; label?: string | null }[];
                setSites(
                    rows
                        .map((r) => ({ id: r.id, label: String(r.label ?? "").trim() }))
                        .filter((r) => r.id && r.label),
                );
            } catch {
                // A failed site list must not blank the inventory; registration is
                // simply unavailable until it loads.
                setSites([]);
            }
        })();
    }, []);

    const active = useMemo(() => devices.filter((d) => d.status === "active"), [devices]);
    const revoked = useMemo(() => devices.filter((d) => d.status === "revoked"), [devices]);

    const register = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/attendance/kiosk-devices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label: newLabel, site_location_id: newSiteId }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Registration failed");
            setIssued({ label: newLabel.trim(), credential: String(json.credential ?? "") });
            setRegisterOpen(false);
            setNewLabel("");
            setNewSiteId("");
            await reload();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Registration failed.");
        } finally {
            setBusy(false);
        }
    };

    const rotate = async (device: KioskDeviceAdminRow) => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/attendance/kiosk-devices/${encodeURIComponent(device.id)}`, {
                method: "POST",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Rotation failed");
            setIssued({ label: device.label, credential: String(json.credential ?? "") });
            await reload();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Rotation failed.");
        } finally {
            setBusy(false);
        }
    };

    const revoke = async (device: KioskDeviceAdminRow) => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/attendance/kiosk-devices/${encodeURIComponent(device.id)}`, {
                method: "DELETE",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Revoke failed");
            setConfirmRevokeId(null);
            await reload();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Revoke failed.");
        } finally {
            setBusy(false);
        }
    };

    const renderDevice = (device: KioskDeviceAdminRow) => (
        <div
            key={device.id}
            className="flex flex-wrap items-start justify-between gap-3 border-b border-alloy-stone/20 py-3 last:border-b-0"
            data-testid="kiosk-device-row"
            data-device-status={device.status}
        >
            <div className="min-w-0">
                <p className="text-sm font-medium text-alloy-midnight">{device.label}</p>
                <p className="text-[12px] text-alloy-midnight/55">
                    {device.siteName ?? "Site unavailable"}
                    {device.capabilities.length > 0 ?
                        <> · {device.capabilities.map(kioskCapabilityLabel).join(", ")}</>
                    :   null}
                </p>
                <p className="text-[12px] text-alloy-midnight/45">
                    {device.status === "revoked" ?
                        <>Revoked {formatWhen(device.revokedAt)}</>
                    :   <>
                            Registered {formatWhen(device.registeredAt)}
                            {device.rotatedAt ? <> · credential rotated {formatWhen(device.rotatedAt)}</> : null}
                            {device.credentialLastFour ?
                                <> · ends {device.credentialLastFour}</>
                            :   null}
                        </>
                    }
                </p>
            </div>
            {device.status === "active" ?
                <div className="flex flex-wrap items-center gap-2">
                    <ConfigurationSecondaryButton
                        onClick={() => void rotate(device)}
                        data-testid="kiosk-device-rotate"
                    >
                        Replace credential
                    </ConfigurationSecondaryButton>
                    {confirmRevokeId === device.id ?
                        <>
                            <ConfigurationPrimaryButton
                                onClick={() => void revoke(device)}
                                data-testid="kiosk-device-revoke-confirm"
                            >
                                Confirm revoke
                            </ConfigurationPrimaryButton>
                            <ConfigurationSecondaryButton onClick={() => setConfirmRevokeId(null)}>
                                Cancel
                            </ConfigurationSecondaryButton>
                        </>
                    :   <ConfigurationSecondaryButton
                            onClick={() => setConfirmRevokeId(device.id)}
                            data-testid="kiosk-device-revoke"
                        >
                            Revoke
                        </ConfigurationSecondaryButton>
                    }
                </div>
            :   null}
        </div>
    );

    return (
        <div className="flex min-h-0 w-full min-w-0 flex-col">
            <ConfigurationContext
                eyebrow="Attendance"
                title="Devices"
                subtitle="Tablets that record attendance at a site."
                titleIcon={<MonitorSmartphone className="h-4 w-4" aria-hidden />}
                testId="kiosk-devices-context"
                actions={
                    <ConfigurationPrimaryButton
                        onClick={() => setRegisterOpen((v) => !v)}
                        data-testid="kiosk-device-register-open"
                    >
                        Add a device
                    </ConfigurationPrimaryButton>
                }
            />

            <div className="flex flex-col gap-4 p-4">
                {error ?
                    <p className="text-sm text-alloy-ember" data-testid="kiosk-devices-error">
                        {error}
                    </p>
                :   null}

                {issued ?
                    <ConfigWorkspaceCard testId="kiosk-device-credential" title="Set up this device now">
                        <p className="text-sm text-alloy-midnight">
                            Enter this code on <strong>{issued.label}</strong>. It is shown once and cannot be
                            retrieved later — if it is lost, replace the credential to get a new one.
                        </p>
                        <code
                            className="mt-3 block break-all rounded-lg bg-alloy-stone/10 px-3 py-2 font-mono text-sm text-alloy-midnight"
                            data-testid="kiosk-device-credential-value"
                        >
                            {issued.credential}
                        </code>
                        <ConfigurationSecondaryButton
                            className="mt-3"
                            onClick={() => setIssued(null)}
                            data-testid="kiosk-device-credential-dismiss"
                        >
                            I have entered it
                        </ConfigurationSecondaryButton>
                    </ConfigWorkspaceCard>
                :   null}

                {registerOpen ?
                    <ConfigWorkspaceCard testId="kiosk-device-register" title="Add a device">
                        <label className="block text-sm text-alloy-midnight">
                            Device name
                            <input
                                className="mt-1 w-full rounded-lg border border-alloy-stone/30 px-3 py-2 text-sm"
                                placeholder="Front desk tablet"
                                value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                                data-testid="kiosk-device-label-input"
                            />
                        </label>
                        <label className="mt-3 block text-sm text-alloy-midnight">
                            Site
                            <select
                                className="mt-1 w-full rounded-lg border border-alloy-stone/30 px-3 py-2 text-sm"
                                value={newSiteId}
                                onChange={(e) => setNewSiteId(e.target.value)}
                                data-testid="kiosk-device-site-select"
                            >
                                <option value="">Choose a site…</option>
                                {sites.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.label}
                                    </option>
                                ))}
                            </select>
                            <span className="mt-1 block text-[12px] text-alloy-midnight/55">
                                A device records attendance for one site only.
                            </span>
                        </label>
                        <ConfigurationPrimaryButton
                            className="mt-3"
                            disabled={busy || !newLabel.trim() || !newSiteId}
                            onClick={() => void register()}
                            data-testid="kiosk-device-register-submit"
                        >
                            {busy ? "Adding…" : "Add device"}
                        </ConfigurationPrimaryButton>
                    </ConfigWorkspaceCard>
                :   null}

                <ConfigWorkspaceCard testId="kiosk-devices-active" title="In use">
                    {loading ?
                        <p className="text-sm text-alloy-midnight/55">Loading…</p>
                    : active.length === 0 ?
                        <ConfigurationEmptyState
                            title="No devices yet"
                            description="Add a tablet to let staff and families record attendance at a site."
                        />
                    :   active.map(renderDevice)}
                </ConfigWorkspaceCard>

                {revoked.length > 0 ?
                    <ConfigWorkspaceCard testId="kiosk-devices-revoked" title="Revoked">
                        <p className="mb-2 text-[12px] text-alloy-midnight/55">
                            These devices can no longer record attendance. They are kept so past attendance
                            still shows which device recorded it.
                        </p>
                        {revoked.map(renderDevice)}
                    </ConfigWorkspaceCard>
                :   null}
            </div>
        </div>
    );
}
