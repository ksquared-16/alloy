"use client";

/**
 * The status grammar for Integrations, written once.
 *
 * The collection and the installation detail were each spelling out their own version of "Active ·
 * Needs attention", which is how two surfaces end up disagreeing about the same connection. State
 * and health are separate facts and are drawn as separate badges: a connection can be perfectly
 * active and still have nothing to reach, and an operator needs to see which of those is wrong.
 */

import type { ReactNode } from "react";

export type Capability = {
    scope: string;
    title: string;
    detail: string;
    access: "read" | "write";
    recognised: boolean;
};

export type Credential = {
    id: string;
    lastFour: string | null;
    createdAt: string | null;
    lastUsedAt: string | null;
    rotationOverlapUntil: string | null;
    status: "active" | "rotating" | "revoked";
};

export type Installation = {
    id: string;
    applicationName: string;
    applicationId: string;
    publisher: string | null;
    state: "active" | "suspended" | "revoked";
    boundaryMode: "org_wide" | "locations";
    locationCount: number;
    /** Which Locations, when the boundary is restricted — so an editor can prefill from it. */
    locationIds?: string[];
    grantedScopes: string[];
    capabilities: Capability[];
    credential: Credential | null;
    health: { state: string; reasons: string[] };
    lastActivityAt: string | null;
    recentRequests: number;
    recentFailures: number;
};

export const STATE_COPY: Record<Installation["state"], string> = {
    active: "Active",
    suspended: "Suspended",
    revoked: "Disconnected",
};

export const HEALTH_COPY: Record<string, string> = {
    healthy: "Healthy",
    needs_attention: "Needs attention",
    inactive: "Inactive",
    no_recent_activity: "No recent activity",
};

type Tone = "positive" | "attention" | "neutral" | "muted";

const TONE_CLASS: Record<Tone, string> = {
    positive: "border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.08] text-[#007d68]",
    attention: "border-alloy-ember/25 bg-alloy-ember/[0.07] text-alloy-ember",
    neutral: "border-alloy-blue/20 bg-alloy-blue/[0.06] text-alloy-blue",
    muted: "border-alloy-forge/12 bg-alloy-stone/70 text-alloy-midnight/55",
};

export function Badge({
    tone,
    children,
    testId,
}: {
    tone: Tone;
    children: ReactNode;
    testId?: string;
}) {
    return (
        <span
            data-testid={testId}
            className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${TONE_CLASS[tone]}`}
        >
            {children}
        </span>
    );
}

export function StateBadge({ state, testId }: { state: Installation["state"]; testId?: string }) {
    return (
        <Badge tone={state === "active" ? "positive" : state === "suspended" ? "attention" : "muted"} testId={testId}>
            {STATE_COPY[state]}
        </Badge>
    );
}

export function HealthBadge({ health, testId }: { health: string; testId?: string }) {
    const tone: Tone =
        health === "healthy" ? "positive"
        : health === "needs_attention" ? "attention"
        : "muted";
    return (
        <Badge tone={tone} testId={testId}>
            {HEALTH_COPY[health] ?? health}
        </Badge>
    );
}

/** Where this connection may reach, in one operator sentence. */
export function accessSummary(installation: Pick<Installation, "boundaryMode" | "locationCount">): string {
    if (installation.boundaryMode === "org_wide") return "All locations";
    if (installation.locationCount === 0) return "No locations — can reach nothing";
    return `${installation.locationCount} selected location${installation.locationCount === 1 ? "" : "s"}`;
}

/** Credential state as a short phrase, or the absence of one stated plainly. */
export function credentialSummary(credential: Credential | null): string {
    if (!credential) return "No credential issued";
    if (credential.status === "revoked") return "Credential revoked";
    if (credential.status === "rotating") return "Credential rotating";
    return credential.lastFour ? `Credential active · ends ${credential.lastFour}` : "Credential active";
}

/** A credential is actionable unless it has been revoked — the server's own predicate. */
export function isCredentialActive(credential: Credential | null): boolean {
    return credential != null && credential.status !== "revoked";
}

export function activitySummary(installation: Installation): string {
    if (!installation.lastActivityAt) return "No requests in the last 7 days";
    const failures =
        installation.recentFailures > 0 ? `, ${installation.recentFailures} failed` : "";
    return `${installation.recentRequests} request${installation.recentRequests === 1 ? "" : "s"} in the last 7 days${failures}`;
}

export function formatTimestamp(value: string | null): string {
    if (!value) return "—";
    return value.slice(0, 16).replace("T", " ");
}
