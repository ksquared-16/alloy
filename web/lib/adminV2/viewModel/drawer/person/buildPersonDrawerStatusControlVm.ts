import {
    appendLegacyPersonStatusOption,
    filterPersonStatusDefinitionsForDrawerProfile,
    resolvePersonStatusLabelForProfile,
    type PersonStatusOptionRow,
    type PersonStatusProfileKey,
} from "@/lib/admin/person/personStatusApplicability";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import type { StatusControlVm, StatusOptionVm } from "@/lib/adminV2/viewModel/drawer/types";

function trimOrNull(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
}

function mapOptionRows(rows: PersonStatusOptionRow[], profile?: PersonStatusProfileKey | null): StatusOptionVm[] {
    return rows
        .filter((r) => r.is_active !== false)
        .map((r) => ({
            status_key: r.status_key,
            label:
                profile ?
                    resolvePersonStatusLabelForProfile(r, profile)
                :   trimOrNull(r.status_label) ?? r.status_key,
            sort_order: r.sort_order ?? 0,
        }))
        .sort((a, b) =>
            a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.label.localeCompare(b.label)
        );
}

/** Person/child drawer header status — filtered `persons.status_key` options only. */
export function buildPersonDrawerStatusControlVm(params: {
    record: Record<string, unknown>;
    statusDefs: StatusDefinitionRow[];
    statusProfile?: PersonStatusProfileKey | null;
}): StatusControlVm {
    const statusKey = trimOrNull(params.record.status_key);
    const matchedDef = statusKey ?
        params.statusDefs.find((d) => d.status_key === statusKey)
    :   undefined;
    const label =
        matchedDef && params.statusProfile ?
            resolvePersonStatusLabelForProfile(matchedDef, params.statusProfile)
        :   trimOrNull(params.record._status_display) ?? statusKey ?? "—";

    const activeRows: PersonStatusOptionRow[] = (
        params.statusProfile ?
            filterPersonStatusDefinitionsForDrawerProfile(params.statusDefs, params.statusProfile)
        :   params.statusDefs.filter((d) => d.is_active)
    ).map((d) => ({
            status_key: d.status_key,
            status_label: d.status_label,
            sort_order: d.sort_order,
            is_active: d.is_active,
            metadata: d.metadata,
        }));

    const withLegacy = appendLegacyPersonStatusOption(activeRows, statusKey, label);
    const options = mapOptionRows(withLegacy, params.statusProfile);

    if (options.length === 0 && !statusKey) {
        return { renderAs: "hidden" };
    }

    if (options.length >= 2) {
        return {
            renderAs: "dropdown",
            status_key: statusKey ?? "",
            label,
            options,
        };
    }

    return {
        renderAs: "readonly_pill",
        label,
        status_key: statusKey ?? undefined,
    };
}
