/**
 * Resolve first-class sibling / household child fields for waitlist queue row records.
 */

import type { QueueRowPlacementWaitlistCandidateVm } from "@/lib/ui-v2/workspace-types";

function trimOrEmpty(value: string | null | undefined): string {
    return (value ?? "").trim();
}

function joinUnique(values: string[], separator = " · "): string {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of values) {
        const text = raw.trim();
        if (!text || seen.has(text)) continue;
        seen.add(text);
        out.push(text);
    }
    return out.join(separator);
}

function formatEnrolledSiblingLine(input: {
    childDisplayName: string | null;
    cohortLabel: string | null;
    locationLabel: string | null;
    sameSiteAsCandidate: boolean;
}): string {
    const name = trimOrEmpty(input.childDisplayName);
    const program = trimOrEmpty(input.cohortLabel);
    const location = trimOrEmpty(input.locationLabel);

    if (input.sameSiteAsCandidate) {
        if (name && program) return `${name} — ${program}`;
        if (name) return name;
        return "Enrolled at this location";
    }
    if (name && program && location) return `${name} — ${program} — ${location}`;
    if (name && program) return `${name} — ${program}`;
    if (name) return name;
    return "Enrolled at another location";
}

function formatWaitlistedSiblingLine(input: { childDisplayName: string; cohortLabel: string }): string {
    const name = trimOrEmpty(input.childDisplayName);
    const program = trimOrEmpty(input.cohortLabel);
    if (name && program) return `${name} — ${program}`;
    if (name) return name;
    return "Also waitlisted";
}

export type QueueRowSiblingFieldRecord = {
    "sibling.names": string;
    "sibling.count": string;
    "sibling.enrolled": string;
    "sibling.waitlisted": string;
    "sibling.location": string;
    "sibling.program": string;
    "household.otherChildren": string;
    "waitlist.siblingContext": string;
    "_sibling.hasWaitlisted": boolean;
    "_sibling.hasEnrolled": boolean;
    "_household.hasMultipleChildren": boolean;
};

/** Map waitlist candidate VM → sibling field values + visibility signal paths. */
export function resolveQueueRowSiblingFields(
    waitlist: QueueRowPlacementWaitlistCandidateVm,
): QueueRowSiblingFieldRecord {
    const waitlistedCohorts = waitlist.siblingCohorts ?? [];
    const enrolledSiblings = waitlist.enrolledSiblings ?? [];

    const waitlistedNames = waitlistedCohorts.map((s) => trimOrEmpty(s.childDisplayName)).filter(Boolean);
    const enrolledNames = enrolledSiblings.map((s) => trimOrEmpty(s.childDisplayName)).filter(Boolean);
    const allNames = joinUnique([...waitlistedNames, ...enrolledNames]);

    const waitlistedCount = waitlist.waitlistedSiblingCount ?? waitlistedCohorts.length;
    const enrolledCount = enrolledSiblings.length;
    const contextualSiblingCount = waitlistedCount + enrolledCount;

    const waitlistedPrograms = waitlistedCohorts
        .map((s) => trimOrEmpty(s.cohortLabel))
        .filter(Boolean);
    const enrolledPrograms = enrolledSiblings.map((s) => trimOrEmpty(s.cohortLabel)).filter(Boolean);
    const siblingPrograms = joinUnique([...waitlistedPrograms, ...enrolledPrograms]);

    const siblingLocations = joinUnique(
        enrolledSiblings.map((s) => trimOrEmpty(s.locationLabel)).filter(Boolean),
    );

    const waitlistedLines = waitlistedCohorts
        .map((s) => formatWaitlistedSiblingLine(s))
        .filter(Boolean);
    const enrolledLines = enrolledSiblings.map((s) => formatEnrolledSiblingLine(s)).filter(Boolean);

    const hasWaitlisted = waitlist.hasWaitlistedSibling ?? waitlistedCount > 0;
    const hasEnrolled = waitlist.hasEnrolledSibling ?? enrolledCount > 0;

    const householdOtherCount = waitlist.householdOtherChildCount ?? 0;
    const householdOtherNames = trimOrEmpty(waitlist.householdOtherChildNames);
    const hasMultipleChildren = householdOtherCount > 0;

    let householdOtherChildren = "";
    if (householdOtherNames) {
        householdOtherChildren = householdOtherNames;
    } else if (householdOtherCount === 1) {
        householdOtherChildren = "1 other child";
    } else if (householdOtherCount > 1) {
        householdOtherChildren = `${householdOtherCount} other children`;
    }

    const siblingCountDisplay =
        contextualSiblingCount > 0 ? String(contextualSiblingCount) : "";

    const siblingEnrolledDisplay = enrolledLines.length ? enrolledLines.join(" · ") : hasEnrolled ? "Yes" : "";

    const siblingWaitlistedDisplay =
        waitlistedLines.length ? waitlistedLines.join(" · ") : hasWaitlisted ? "Yes" : "";

    const siblingContextComposite =
        trimOrEmpty(waitlist.siblingContextLines?.[0]) ||
        trimOrEmpty(waitlist.siblingLabel) ||
        "";

    return {
        "sibling.names": allNames,
        "sibling.count": siblingCountDisplay,
        "sibling.enrolled": siblingEnrolledDisplay,
        "sibling.waitlisted": siblingWaitlistedDisplay,
        "sibling.location": siblingLocations,
        "sibling.program": siblingPrograms,
        "household.otherChildren": householdOtherChildren,
        "waitlist.siblingContext": siblingContextComposite,
        "_sibling.hasWaitlisted": hasWaitlisted,
        "_sibling.hasEnrolled": hasEnrolled,
        "_household.hasMultipleChildren": hasMultipleChildren,
    };
}
