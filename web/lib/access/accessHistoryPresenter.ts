import { areaForRow, areaMeta } from "@/lib/access/capabilityTaxonomy";
import {
    buildPermissionGridRows,
    levelFromGrantedKeys,
    rowEnforcement,
    type PermissionCatalogEntry,
    type PermissionGridLevel,
} from "@/lib/admin/permissionGrid";

/**
 * The ONE place an access-change event becomes a sentence an operator can read.
 *
 * Three surfaces render history — the organization feed, the user detail and the role detail — and
 * if each composed its own summary they would drift, which is the same failure `M2-13` records for
 * two gates disagreeing about one principal. They all call this.
 *
 * ── WHY THE TAXONOMY RENDERS, RATHER THAN THE DATABASE STORING ──
 *
 * `mutation_events.previous_state` / `new_state` hold the canonical capability SETS. The operator
 * sentence is derived here through `capabilityTaxonomy` / `capabilityMatrix` — the same modules the
 * role editor renders from. That is deliberate: the taxonomy gains keys most weeks, and a summary
 * frozen into the database at write time would slowly stop matching the editor, leaving history and
 * the current-state screen describing the same grant set in two different vocabularies.
 *
 * The cost is that a past event is described in today's grouping. That is the right trade for an
 * audit whose job is to be intelligible now, and it is why raw keys stay available as technical
 * detail rather than being discarded.
 */

export type AccessEventRow = {
    id: string;
    committed_at: string;
    command_key: string;
    subject_id: string;
    subject_type: string;
    previous_state: string | null;
    new_state: string;
    operator_id: string | null;
    origin: string;
    context_payload: Record<string, unknown> | null;
};

export type AccessHistoryDisplayNames = {
    /** `user_id` → person display name. Missing entries fall back truthfully. */
    people: ReadonlyMap<string, string>;
    /** `role_key` → role label. Missing entries fall back truthfully. */
    roles: ReadonlyMap<string, string>;
    /** location id → label, for scope events. */
    locations: ReadonlyMap<string, string>;
};

export type AccessHistoryEntry = {
    eventId: string;
    committedAt: string;
    actorDisplay: string;
    subjectDisplay: string;
    roleDisplay: string | null;
    /** The operator sentence. Never a key, never SQL. */
    summary: string;
    /** Area-level before/after pairs, for surfaces that render a two-column diff. */
    changes: { area: string; from: string; to: string }[];
    origin: string;
    correlationId: string | null;
    /** Progressive disclosure only. */
    technical: {
        commandKey: string;
        subjectType: string;
        subjectId: string;
        previousState: string | null;
        newState: string;
        contextPayload: Record<string, unknown> | null;
    };
};

/**
 * A label for something that may no longer exist.
 *
 * History outlives its subject — proven live: deleting a role does not delete the events that
 * describe it. So resolution is a fallback ladder, never an inner join: the current canonical label
 * if it resolves, otherwise the stable stored identifier, and only then a truthful statement that
 * the thing is gone. Never a fabricated current label, and never dropping the event.
 */
function resolveLabel(
    id: string | null | undefined,
    names: ReadonlyMap<string, string>,
    goneLabel: string
): string {
    if (!id) return goneLabel;
    const current = names.get(id);
    if (current) return current;
    return `${goneLabel} (${id})`;
}

/**
 * The label for whoever made the change.
 *
 * A person who has since left the organization is "Removed user (id)" — the ladder above, and
 * correct. A SYSTEM actor is not that, and calling it that would be a fabrication of exactly the kind
 * this module refuses elsewhere: provisioning, automation and service principals never had a row in
 * the member list to be removed from. So an unresolved actor on a non-operator origin is presented as
 * what it is, and an actor that DOES resolve to a person is still shown as that person — a human
 * acting through the API is a human.
 */
const ORIGIN_ACTOR_WORD: Record<string, string> = {
    system: "System",
    automation: "Automation",
    api: "API client",
};

function resolveActor(
    operatorId: string | null,
    origin: string,
    people: ReadonlyMap<string, string>
): string {
    if (operatorId) {
        const person = people.get(operatorId);
        if (person) return person;
        const word = ORIGIN_ACTOR_WORD[origin];
        if (word) return `${word} (${operatorId})`;
    }
    return resolveLabel(operatorId, people, "Removed user");
}

function splitKeys(state: string | null): string[] {
    if (!state) return [];
    return state.split(",").map((k) => k.trim()).filter(Boolean);
}

/**
 * The operator's three words for a level, which are the role editor's own column headings.
 */
const LEVEL_WORD: Record<PermissionGridLevel, string> = {
    none: "No access",
    read: "View",
    write: "Manage",
};

/**
 * Diff two capability sets at the GRID ROW, not at the area.
 *
 * An area aggregates several rows, so granting `fin.read` alone makes the Financials AREA report
 * `Limited · 1 of 4` — which is the taxonomy telling the truth (W-57: a disagreeing set is never
 * rounded up to Manage or down to View, because both roundings are authority misstatements an
 * operator would act on). Correct, and the wrong sentence for history: the operator changed one
 * capability from No access to View, and "Limited · 1 of 4" describes the area's resulting shape
 * rather than the change they made.
 *
 * So the row supplies the level and the area supplies the name, which is how the editor presents the
 * same fact — "Financials … No access → View".
 */
function capabilityAreaChanges(
    catalog: PermissionCatalogEntry[],
    before: string[],
    after: string[]
): { area: string; from: string; to: string }[] {
    const beforeSet = new Set(before);
    const afterSet = new Set(after);
    const changes: { area: string; from: string; to: string }[] = [];

    for (const row of buildPermissionGridRows(catalog)) {
        // An inert row offers no control in the editor, so a change in it is not a change an
        // operator made through the product.
        if (rowEnforcement(row).inert) continue;
        const from = levelFromGrantedKeys(row, beforeSet);
        const to = levelFromGrantedKeys(row, afterSet);
        if (from === to) continue;
        const area = areaMeta(areaForRow(row))?.label ?? row.groupLabel;
        changes.push({ area, from: LEVEL_WORD[from], to: LEVEL_WORD[to] });
    }
    return changes.sort((a, b) => a.area.localeCompare(b.area));
}

function joinRoles(keys: string[], names: ReadonlyMap<string, string>): string {
    if (!keys.length) return "no roles";
    return keys.map((k) => names.get(k) ?? k).join(" + ");
}

/**
 * Render one event.
 *
 * `catalog` is the capability catalog the role editor uses; passing it in keeps this module free of
 * data access so it can be unit-tested and reused by any surface.
 */
export function presentAccessEvent(
    row: AccessEventRow,
    names: AccessHistoryDisplayNames,
    catalog: PermissionCatalogEntry[]
): AccessHistoryEntry {
    const ctx = (row.context_payload ?? {}) as Record<string, unknown>;
    const correlationId = typeof ctx.correlation_id === "string" ? ctx.correlation_id : null;
    const roleKey = typeof ctx.role_key === "string" ? ctx.role_key : null;

    const actorDisplay = resolveActor(row.operator_id, row.origin, names.people);
    const roleDisplay = roleKey ? (names.roles.get(roleKey) ?? `Deleted role (${roleKey})`) : null;
    const personDisplay =
        row.subject_type === "role"
            ? (roleDisplay ?? "Deleted role")
            : resolveLabel(row.subject_id, names.people, "Removed user");

    let changes: { area: string; from: string; to: string }[] = [];
    let summary: string;

    switch (row.command_key) {
        case "access.role.grants_changed": {
            changes = capabilityAreaChanges(catalog, splitKeys(row.previous_state), splitKeys(row.new_state));
            const first = changes[0];
            summary = first
                ? `${actorDisplay} changed ${personDisplay} — ${first.area} from ${first.from} to ${first.to}` +
                  (changes.length > 1 ? ` and ${changes.length - 1} more` : "")
                : `${actorDisplay} changed ${personDisplay} capabilities`;
            break;
        }
        case "access.role.created":
            summary = `${actorDisplay} created ${personDisplay}`;
            break;
        case "access.role.updated":
            summary = `${actorDisplay} updated ${personDisplay}`;
            changes = [{ area: "Role", from: row.previous_state ?? "", to: row.new_state }];
            break;
        case "access.user.roles_changed": {
            const before = splitKeys(row.previous_state);
            const after = splitKeys(row.new_state);
            // W-17 is stated, not softened: this replaced the set, and saying "added" would be false.
            summary = `${actorDisplay} changed ${personDisplay}'s roles from ${joinRoles(before, names.roles)} to ${joinRoles(after, names.roles)}`;
            changes = [{ area: "Roles", from: joinRoles(before, names.roles), to: joinRoles(after, names.roles) }];
            break;
        }
        case "access.user.removed":
            summary = `${actorDisplay} removed ${personDisplay}'s organization access`;
            changes = [{ area: "Organization access", from: joinRoles(splitKeys(row.previous_state), names.roles), to: "No access" }];
            break;
        case "access.user.scope_changed": {
            const render = (state: string | null) => scopeDisplay(state, names.locations);
            const from = render(row.previous_state);
            const to = render(row.new_state);
            summary = `${actorDisplay} changed ${personDisplay}'s location access from ${from} to ${to}`;
            changes = [{ area: "Location access", from, to }];
            break;
        }
        default:
            summary = `${actorDisplay} changed access for ${personDisplay}`;
    }

    return {
        eventId: row.id,
        committedAt: row.committed_at,
        actorDisplay,
        subjectDisplay: personDisplay,
        roleDisplay,
        summary,
        changes,
        origin: row.origin,
        correlationId,
        technical: {
            commandKey: row.command_key,
            subjectType: row.subject_type,
            subjectId: row.subject_id,
            previousState: row.previous_state,
            newState: row.new_state,
            contextPayload: row.context_payload,
        },
    };
}

/** `dept=all;site=restricted:<id>,<id>` → "Riverside + Lakeside" / "All locations". */
export function scopeDisplay(state: string | null, locations: ReadonlyMap<string, string>): string {
    if (!state) return "Unknown";
    const site = state.split(";").find((p) => p.startsWith("site="));
    if (!site) return "Unknown";
    const value = site.slice("site=".length);
    if (!value.startsWith("restricted")) return "All locations";
    const ids = value.slice("restricted:".length).split(",").map((s) => s.trim()).filter(Boolean);
    if (!ids.length) return "No locations";
    return ids.map((id) => locations.get(id) ?? `Deleted location (${id})`).join(" + ");
}
