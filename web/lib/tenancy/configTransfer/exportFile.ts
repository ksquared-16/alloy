/**
 * The reviewable export file (briefing M8): built from the export's read, validated before any import.
 *
 * The file carries configuration only, keyed by export-local `ref`s, never by source ids: rooms name their site by
 * ref. The only identifiers inside it are the Enrollment process's
 * own stage, track and process ids, which the process defines for itself (any other uuid in it is refused).
 * Rows with a P3 §T test-data marker are left behind and listed by label and marker only.
 *
 * The reviewer may delete items (P3 C5's later rooms are OWNER, for example); the import re-validates whatever is
 * left, and the approval binds the reviewed file by its sha256 (`--expect-sha256`). Pure; no I/O.
 */

import {
    CONFIG_EXPORT_FORMAT,
    DEPARTMENT_FIELDS,
    KIND_FIELDS,
    LOCATION_METADATA_KEYS,
    TABLE_CLASSES,
    TRANSFERABLE_KINDS,
    labelMarker,
    refusalReasonForKind,
    rowMarker,
    type TransferableKind,
} from "./allowlist";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = Record<string, unknown>;

export type SiteItem = {
    ref: string;
    label: string;
    is_active: boolean;
    address1: string | null;
    address2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
    metadata: Record<string, Json>;
};
export type RoomItem = { ref: string; site_ref: string; label: string; unit_role: string | null; is_active: boolean; metadata: Record<string, Json> };
export type RoleTypeItem = { ref: string; key: string; label: string; description: string | null; sort_order: number | null; is_active: boolean };
export type EnrollmentProcessItem = {
    ref: string;
    department: { key: string; name: string; description: string | null; sort_order: number | null };
    process: Record<string, Json>;
    derived_work_unit_keys: string[];
};

export type ExportKinds = {
    sites?: SiteItem[];
    rooms?: RoomItem[];
    household_role_types?: RoleTypeItem[];
    enrollment_process?: EnrollmentProcessItem[];
};

export type ExportFile = {
    format: typeof CONFIG_EXPORT_FORMAT;
    source: {
        environment: "local" | "staging";
        host: string;
        project_ref: string | null;
        org_id: string;
        org_name: string;
        exported_at: string;
        /** Local only: the E2 seed's configuration rows were kept although they carry the seed marker. */
        seed_config_kept: boolean;
    };
    kinds: ExportKinds;
    left_behind: Array<{ kind: string; label: string; reason: string }>;
    dropped_metadata_keys: Array<{ ref: string; keys: string[] }>;
    table_classes: typeof TABLE_CLASSES;
};

export type RawExport = {
    org: { id: string; name: string; status: string } | null;
    locations: Array<Obj & { id: string; label: string; location_type: string; parent_location_id: string | null; metadata: Obj | null }>;
    role_types: Array<Obj & { id: string; key: string; label: string; is_system: boolean | null; metadata: Obj | null }>;
    departments: Array<Obj & { id: string; key: string; name: string; builder: Obj | null; metadata_keys: string[] }>;
    work_units: Array<{ department_id: string; key: string }>;
};

const UUID_ANY = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export const slugRef = (s: string) =>
    s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";

function pick(md: Obj | null | undefined, keys: readonly string[]): { kept: Record<string, Json>; dropped: string[] } {
    const kept: Record<string, Json> = {};
    const dropped: string[] = [];
    for (const [k, v] of Object.entries(md ?? {})) {
        if (keys.includes(k)) kept[k] = v as Json;
        else dropped.push(k);
    }
    return { kept, dropped: dropped.sort() };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/**
 * Every uuid in the process must be an id the process itself defines (a value under an `id` key, or the active
 * process id). Anything else would be a source row id (a department, work unit, location, user) riding along.
 */
export function foreignUuidsInProcess(process: unknown): string[] {
    const defined = new Set<string>();
    const seen: string[] = [];
    const walk = (v: unknown, key: string | null) => {
        if (typeof v === "string") {
            if (key === "id") defined.add(v.toLowerCase());
            for (const m of v.match(UUID_ANY) ?? []) seen.push(m.toLowerCase());
        } else if (Array.isArray(v)) v.forEach((x) => walk(x, null));
        else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
    };
    walk(process, null);
    return [...new Set(seen.filter((u) => !defined.has(u)))].sort();
}

export type BuildExportInput = {
    raw: RawExport;
    kinds: readonly TransferableKind[];
    environment: "local" | "staging";
    host: string;
    projectRef: string | null;
    exportedAt: string;
    keepSeedConfig: boolean;
};

export function buildExportFile(input: BuildExportInput): { ok: true; file: ExportFile } | { ok: false; error: string } {
    const { raw, kinds } = input;
    if (!raw.org) return { ok: false, error: "the org does not exist in the source database" };
    if (input.keepSeedConfig && input.environment !== "local") {
        return { ok: false, error: "--keep-seed-config is local-only: on staging, seed rows are test data (P3 L11)" };
    }
    const opts = { keepSeedConfig: input.keepSeedConfig };
    const left: ExportFile["left_behind"] = [];
    const dropped: ExportFile["dropped_metadata_keys"] = [];
    const out: ExportKinds = {};

    // Sites and rooms (C5). Refs are label-derived; a duplicate label within the org is refused, not guessed.
    const siteRefById = new Map<string, string>();
    const sites: SiteItem[] = [];
    for (const l of raw.locations.filter((x) => x.location_type === "site")) {
        const reason = rowMarker(l as never, opts) ?? labelMarker(l.label);
        if (reason) {
            left.push({ kind: "sites", label: l.label, reason });
            continue;
        }
        const ref = `site:${slugRef(l.label)}`;
        if (sites.some((s) => s.ref === ref)) return { ok: false, error: `two sites share the label "${l.label}"; rename one before exporting` };
        const md = pick(l.metadata, LOCATION_METADATA_KEYS.sites);
        if (md.dropped.length) dropped.push({ ref, keys: md.dropped });
        siteRefById.set(l.id, ref);
        sites.push({
            ref,
            label: l.label,
            is_active: l.is_active !== false,
            address1: str(l.address1),
            address2: str(l.address2),
            city: str(l.city),
            state: str(l.state),
            postal_code: str(l.postal_code),
            country: str(l.country),
            metadata: md.kept,
        });
    }
    const rooms: RoomItem[] = [];
    for (const l of raw.locations.filter((x) => x.location_type === "unit")) {
        const siteRef = l.parent_location_id ? siteRefById.get(l.parent_location_id) : undefined;
        const reason = rowMarker(l as never, opts) ?? labelMarker(l.label) ?? (siteRef ? null : "its site is not exported");
        if (reason) {
            left.push({ kind: "rooms", label: l.label, reason });
            continue;
        }
        const ref = `room:${siteRef!.slice(5)}/${slugRef(l.label)}`;
        if (rooms.some((r) => r.ref === ref)) return { ok: false, error: `two rooms at one site share the label "${l.label}"` };
        const md = pick(l.metadata, LOCATION_METADATA_KEYS.rooms);
        if (md.dropped.length) dropped.push({ ref, keys: md.dropped });
        rooms.push({ ref, site_ref: siteRef!, label: l.label, unit_role: str(l.unit_role), is_active: l.is_active !== false, metadata: md.kept });
    }
    if (kinds.includes("sites")) out.sites = sites;
    if (kinds.includes("rooms")) {
        if (!kinds.includes("sites")) return { ok: false, error: "rooms need sites in the same export" };
        out.rooms = rooms;
    }

    if (kinds.includes("household_role_types")) {
        out.household_role_types = [];
        for (const t of raw.role_types) {
            const reason = rowMarker(t as never, opts) ?? labelMarker(t.key, t.label);
            if (reason) {
                left.push({ kind: "household_role_types", label: t.key, reason });
                continue;
            }
            out.household_role_types.push({
                ref: `role_type:${t.key}`,
                key: t.key,
                label: t.label,
                description: str(t.description),
                sort_order: typeof t.sort_order === "number" ? t.sort_order : null,
                is_active: t.is_active !== false,
            });
        }
    }

    if (kinds.includes("enrollment_process")) {
        out.enrollment_process = [];
        for (const d of raw.departments) {
            const builder = d.builder as { active_process_id?: unknown; processes?: unknown } | null;
            const processes = Array.isArray(builder?.processes) ? (builder!.processes as Obj[]) : [];
            const active = processes.find((p) => p.id === builder?.active_process_id && p.is_active !== false);
            const deptReason = rowMarker({ id: d.id, metadata: null }, opts);
            if (deptReason) {
                left.push({ kind: "enrollment_process", label: d.key, reason: deptReason });
                continue;
            }
            if (!active) {
                left.push({ kind: "enrollment_process", label: d.key, reason: "no active published process" });
                continue;
            }
            const foreign = foreignUuidsInProcess(active);
            if (foreign.length) {
                return { ok: false, error: `the ${d.key} process carries ids it does not define (source row ids?): ${foreign.join(", ")}` };
            }
            const other = d.metadata_keys.filter((k) => k !== "lifecycle_builder_v1");
            const ref = `process:${d.key}/${String(active.key ?? "process")}`;
            if (other.length) dropped.push({ ref, keys: other });
            out.enrollment_process.push({
                ref,
                department: {
                    key: d.key,
                    name: d.name,
                    description: str(d.description),
                    sort_order: typeof d.sort_order === "number" ? d.sort_order : null,
                },
                process: active as Record<string, Json>,
                derived_work_unit_keys: raw.work_units.filter((w) => w.department_id === d.id).map((w) => w.key).sort(),
            });
        }
    }

    return {
        ok: true,
        file: {
            format: CONFIG_EXPORT_FORMAT,
            source: {
                environment: input.environment,
                host: input.host,
                project_ref: input.projectRef,
                org_id: raw.org.id,
                org_name: raw.org.name,
                exported_at: input.exportedAt,
                seed_config_kept: input.keepSeedConfig,
            },
            kinds: out,
            left_behind: left,
            dropped_metadata_keys: dropped,
            table_classes: TABLE_CLASSES,
        },
    };
}

// ── validation: the import's gate ────────────────────────────────────────────

const TOP_KEYS = ["format", "source", "kinds", "left_behind", "dropped_metadata_keys", "table_classes"];

function exactKeys(o: unknown, allowed: readonly string[], where: string, errors: string[]): o is Obj {
    if (!o || typeof o !== "object" || Array.isArray(o)) {
        errors.push(`${where}: not an object`);
        return false;
    }
    const extra = Object.keys(o).filter((k) => !allowed.includes(k));
    const missing = allowed.filter((k) => !(k in (o as Obj)));
    if (extra.length) errors.push(`${where}: fields outside the allowlist: ${extra.join(", ")}`);
    if (missing.length) errors.push(`${where}: missing fields: ${missing.join(", ")}`);
    return true;
}

function noUuids(v: unknown, where: string, errors: string[]): void {
    const text = JSON.stringify(v);
    const found = text.match(UUID_ANY);
    if (found) errors.push(`${where}: carries an id (${found[0]}); items are keyed by ref, never by source id`);
}

/**
 * Everything the import requires of a file, before it reads the target. Refuses: another format; any kind outside
 * the allowlist (with its reason); any field outside a kind's field list; location metadata keys outside the kept
 * set; any uuid outside the process's own ids; refs that do not resolve; duplicate refs.
 */
export function validateExportFile(raw: unknown): { ok: true; file: ExportFile } | { ok: false; errors: string[] } {
    const errors: string[] = [];
    if (!exactKeys(raw, TOP_KEYS, "file", errors)) return { ok: false, errors };
    const f = raw as Obj;
    if (f.format !== CONFIG_EXPORT_FORMAT) errors.push(`file: format is ${JSON.stringify(f.format)}, expected ${CONFIG_EXPORT_FORMAT}`);
    const src = f.source as Obj;
    exactKeys(src, ["environment", "host", "project_ref", "org_id", "org_name", "exported_at", "seed_config_kept"], "source", errors);
    const kinds = (f.kinds ?? {}) as Obj;
    if (!kinds || typeof kinds !== "object" || Array.isArray(kinds)) return { ok: false, errors: [...errors, "kinds: not an object"] };
    for (const k of Object.keys(kinds)) {
        const reason = refusalReasonForKind(k);
        if (reason) errors.push(`kinds.${k}: refused — ${reason}`);
    }
    const refs = new Set<string>();
    const addRef = (ref: unknown, where: string) => {
        if (typeof ref !== "string" || !ref) errors.push(`${where}: ref missing`);
        else if (refs.has(ref)) errors.push(`${where}: duplicate ref ${ref}`);
        else refs.add(ref);
    };
    for (const kind of TRANSFERABLE_KINDS) {
        const items = kinds[kind];
        if (items === undefined) continue;
        if (!Array.isArray(items)) {
            errors.push(`kinds.${kind}: not a list`);
            continue;
        }
        items.forEach((item, i) => {
            const where = `kinds.${kind}[${i}]`;
            if (!exactKeys(item, KIND_FIELDS[kind], where, errors)) return;
            const it = item as Obj;
            addRef(it.ref, where);
            if (kind === "sites" || kind === "rooms") {
                const extra = Object.keys((it.metadata ?? {}) as Obj).filter((k) => !LOCATION_METADATA_KEYS[kind].includes(k));
                if (extra.length) errors.push(`${where}.metadata: keys outside the allowlist: ${extra.join(", ")}`);
            }
            if (typeof it.label === "string" && labelMarker(it.label)) errors.push(`${where}: label carries a test-data marker (${labelMarker(it.label)})`);
            if (kind === "enrollment_process") {
                exactKeys(it.department, DEPARTMENT_FIELDS, `${where}.department`, errors);
                noUuids(it.department, `${where}.department`, errors);
                const foreign = foreignUuidsInProcess(it.process);
                if (foreign.length) errors.push(`${where}.process: ids the process does not define: ${foreign.join(", ")}`);
            } else {
                noUuids(it, where, errors);
            }
        });
    }
    const siteRefs = new Set(((kinds.sites as Obj[] | undefined) ?? []).map((s) => s.ref));
    ((kinds.rooms as Obj[] | undefined) ?? []).forEach((r, i) => {
        if (!siteRefs.has(r.site_ref)) errors.push(`kinds.rooms[${i}]: site_ref ${String(r.site_ref)} is not a site in this file`);
    });
    return errors.length ? { ok: false, errors } : { ok: true, file: raw as unknown as ExportFile };
}

/** Item counts per kind, for the plan, the log and the §5.6 check. */
export function exportCounts(file: ExportFile): Record<string, number> {
    return Object.fromEntries(TRANSFERABLE_KINDS.filter((k) => file.kinds[k]).map((k) => [k, file.kinds[k]!.length]));
}
