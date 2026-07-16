"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import TourAvailabilitySettingsClient from "@/app/adminV2/settings/tours/availability/TourAvailabilitySettingsClient";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";

function ConcernSurface({
    title,
    consequence,
    status,
    action,
    children,
    testId,
}: {
    title: string;
    consequence: string;
    status: string;
    action?: ReactNode;
    children?: ReactNode;
    testId: string;
}) {
    return (
        <section className="process-config-setup-card p-4" data-testid={testId}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="config-typo-meta uppercase tracking-[0.14em]">Location-owned configuration</p>
                    <h2 className="config-typo-workspace-title mt-1">{title}</h2>
                    <p className="config-typo-sublabel mt-1 max-w-2xl">{consequence}</p>
                </div>
                <span className="rounded-full border border-alloy-forge/12 bg-alloy-stone/10 px-2 py-1 text-[11px] text-alloy-midnight/60">
                    {status}
                </span>
            </div>
            {action ?
                <div className="mt-4">{action}</div>
            :   null}
            {children ?
                <div className="mt-4 border-t border-alloy-forge/10 pt-4">{children}</div>
            :   null}
        </section>
    );
}

export function LocationToursPanel({ locationId, locationLabel }: { locationId: string; locationLabel: string }) {
    return (
        <ConcernSurface
            title="Tours"
            consequence="Decide when families can visit and how each booking window works."
            status="Availability & booking"
            testId="locations-tours-surface"
        >
            <TourAvailabilitySettingsClient locationId={locationId} locationLabel={locationLabel} embedded />
        </ConcernSurface>
    );
}

export function LocationPlacementPanel({
    rooms,
    onReviewRooms,
}: {
    rooms: LocationHierarchyRow[];
    onReviewRooms: () => void;
}) {
    const activeRooms = rooms.filter((room) => room.is_active !== false);
    return (
        <ConcernSurface
            title="Placement"
            consequence="Review the rooms available for placement and the priority policy used when demand exceeds space."
            status={`${activeRooms.length} participating ${activeRooms.length === 1 ? "room" : "rooms"}`}
            testId="locations-placement-surface"
            action={
                <div className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border border-alloy-forge/10 p-3">
                            <p className="config-typo-meta">Participating rooms</p>
                            <p className="mt-1 text-lg font-medium text-alloy-midnight">{activeRooms.length}</p>
                            <p className="config-typo-sublabel mt-1">
                                Active rooms at this location are available to placement workflows.
                            </p>
                        </div>
                        <div className="rounded-lg border border-alloy-forge/10 p-3">
                            <p className="config-typo-meta">Priority</p>
                            <p className="mt-1 text-sm font-medium text-alloy-midnight/80">Enrollment policy</p>
                            <p className="config-typo-sublabel mt-1">
                                Priority is owned by the enrollment process, so this location does not duplicate it.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="text-xs font-medium text-[#007d68]"
                        onClick={onReviewRooms}
                        data-testid="locations-placement-review-rooms"
                    >
                        Review participating rooms
                    </button>
                </div>
            }
        />
    );
}

type IdentityRow = {
    id: string;
    channel: string;
    display_name: string | null;
    verification_state: string | null;
};

export function LocationCommunicationsPanel({ locationId }: { locationId: string }) {
    const [identities, setIdentities] = useState<IdentityRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        void fetch(`/api/admin/communications/identities?location_id=${encodeURIComponent(locationId)}`, {
            credentials: "include",
        })
            .then(async (response) => {
                const json = (await response.json().catch(() => ({}))) as {
                    identities?: IdentityRow[];
                };
                if (!cancelled && response.ok) setIdentities(json.identities ?? []);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [locationId]);

    const channelSummary = useMemo(() => {
        const channels = new Set(identities.map((identity) => identity.channel));
        if (channels.size === 0) return "Sender identity not set";
        return [...channels].map((channel) => channel.toUpperCase()).join(" & ");
    }, [identities]);

    return (
        <ConcernSurface
            title="Communications"
            consequence="Review the sender identity and delivery channels families recognize for this location."
            status={loading ? "Checking sender identity…" : channelSummary}
            testId="locations-communications-surface"
            action={
                <div className="space-y-3">
                    {identities.length > 0 ?
                        <ul className="divide-y divide-alloy-forge/10 rounded-lg border border-alloy-forge/10">
                            {identities.map((identity) => (
                                <li key={identity.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                    <div>
                                        <p className="text-sm font-medium text-alloy-midnight/80">
                                            {identity.display_name ?? `${identity.channel.toUpperCase()} sender`}
                                        </p>
                                        <p className="config-typo-meta">{identity.channel.toUpperCase()}</p>
                                    </div>
                                    <span className="config-typo-meta">
                                        {identity.verification_state === "verified" ? "Verified" : "Review"}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    :   null}
                    <p className="config-typo-sublabel">
                        Location sender assignment is shown from the canonical communications identity system.
                    </p>
                </div>
            }
        />
    );
}

type MemberRow = {
    user_id: string;
    email: string | null;
    display_name: string | null;
    role_keys: string[];
    department_scope: "all" | "restricted";
    department_ids: string[];
    site_scope: "all" | "restricted";
    site_location_ids: string[];
};

export function LocationAccessPanel({ locationId }: { locationId: string }) {
    const [members, setMembers] = useState<MemberRow[]>([]);
    const [siteLocationIds, setSiteLocationIds] = useState<string[]>([]);
    const [editing, setEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [authorized, setAuthorized] = useState(false);
    const [savingUserId, setSavingUserId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const loadMembers = useCallback(async (cancelled?: () => boolean) => {
        const response = await fetch("/api/admin/settings/users-roles/members", {
            credentials: "include",
        });
        const json = (await response.json().catch(() => ({}))) as {
            members?: MemberRow[];
            site_locations?: { id: string }[];
            error?: string;
        };
        if (cancelled?.()) return;
        setAuthorized(response.ok);
        if (response.ok) {
            setMembers(json.members ?? []);
            setSiteLocationIds((json.site_locations ?? []).map((site) => site.id));
            setError(null);
        } else {
            setMembers([]);
            setSiteLocationIds([]);
            setError(json.error ?? "Location access is unavailable.");
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        let cancelled = false;
        void loadMembers(() => cancelled);
        return () => {
            cancelled = true;
        };
    }, [loadMembers, locationId]);

    const membersWithAccess = members.filter(
        (member) => member.site_scope === "all" || member.site_location_ids.includes(locationId),
    );
    const adminCount = membersWithAccess.filter((member) => member.role_keys.includes("admin")).length;

    const updateLocationAccess = async (member: MemberRow, grant: boolean) => {
        const currentlyHasAccess = member.site_scope === "all" || member.site_location_ids.includes(locationId);
        if (currentlyHasAccess === grant) return;

        const nextSiteIds =
            grant ? [...new Set([...member.site_location_ids, locationId])]
            : member.site_scope === "all" ? siteLocationIds.filter((id) => id !== locationId)
            : member.site_location_ids.filter((id) => id !== locationId);

        if (nextSiteIds.length === 0) {
            setError(
                "A team member cannot be restricted to no locations. Grant another location before removing this one.",
            );
            return;
        }

        setSavingUserId(member.user_id);
        setError(null);
        try {
            const response = await fetch(`/api/admin/users/${encodeURIComponent(member.user_id)}/access-scope`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    department_scope: member.department_scope,
                    site_scope: "restricted",
                    department_ids: member.department_scope === "restricted" ? member.department_ids : [],
                    site_location_ids: nextSiteIds,
                }),
            });
            const json = (await response.json().catch(() => ({}))) as { error?: string };
            if (!response.ok) throw new Error(json.error ?? "Location access could not be saved.");
            await loadMembers();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Location access could not be saved.");
        } finally {
            setSavingUserId(null);
        }
    };

    return (
        <ConcernSurface
            title="Access"
            consequence="See who can operate this location and adjust location access without leaving the workspace."
            status={
                loading ? "Loading team…"
                : authorized ?
                    `${membersWithAccess.length} team members`
                :   "Permission required"
            }
            testId="locations-access-surface"
            action={
                <div className="space-y-3">
                    {error ?
                        <p
                            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                            role="alert"
                        >
                            {error}
                        </p>
                    :   null}
                    <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border border-alloy-forge/10 p-3">
                            <p className="config-typo-meta">Team with access</p>
                            <p className="mt-1 text-lg font-medium text-alloy-midnight">{membersWithAccess.length}</p>
                        </div>
                        <div className="rounded-lg border border-alloy-forge/10 p-3">
                            <p className="config-typo-meta">Administrators</p>
                            <p className="mt-1 text-lg font-medium text-alloy-midnight">{adminCount}</p>
                        </div>
                    </div>
                    {membersWithAccess.length > 0 ?
                        <ul className="divide-y divide-alloy-forge/10">
                            {membersWithAccess.slice(0, 5).map((member) => (
                                <li key={member.user_id} className="flex items-center justify-between gap-3 py-2">
                                    <span className="text-sm text-alloy-midnight/75">
                                        {member.display_name ?? member.email ?? "Team member"}
                                    </span>
                                    <span className="config-typo-meta">{member.role_keys.join(", ") || "Member"}</span>
                                </li>
                            ))}
                        </ul>
                    :   null}
                    {authorized ?
                        <button
                            type="button"
                            className="text-xs font-medium text-[#007d68]"
                            onClick={() => setEditing((current) => !current)}
                            data-testid="locations-access-configure"
                        >
                            {editing ? "Close access editor" : "Manage location access"}
                        </button>
                    :   null}
                    {editing ?
                        <ul className="divide-y divide-alloy-forge/10 rounded-lg border border-alloy-forge/10">
                            {members.map((member) => {
                                const hasAccess =
                                    member.site_scope === "all" || member.site_location_ids.includes(locationId);
                                return (
                                    <li
                                        key={member.user_id}
                                        className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
                                    >
                                        <div>
                                            <p className="text-sm font-medium text-alloy-midnight/80">
                                                {member.display_name ?? member.email ?? "Team member"}
                                            </p>
                                            <p className="config-typo-meta">
                                                {member.role_keys.join(", ") || "Member"} ·{" "}
                                                {member.site_scope === "all" ? "All locations" : "Selected locations"}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            className="rounded-md border border-alloy-forge/15 px-2.5 py-1.5 text-xs font-medium text-[#007d68] disabled:opacity-50"
                                            disabled={savingUserId === member.user_id}
                                            onClick={() => void updateLocationAccess(member, !hasAccess)}
                                        >
                                            {savingUserId === member.user_id ?
                                                "Saving…"
                                            : hasAccess ?
                                                "Remove"
                                            :   "Add"}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    :   null}
                </div>
            }
        />
    );
}
