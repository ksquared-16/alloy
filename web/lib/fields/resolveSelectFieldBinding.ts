import {
    getOptionSetKeyFromConfig,
    isSelectLikeFieldType,
} from "@/lib/admin/fieldDefinitionOptionSetConfig";

export type SelectFieldBinding = {
    isSelect: boolean;
    option_set_key: string | null;
};

/** Resolve whether a field_definitions row (or equivalent) should render as a select. */
export function resolveSelectFieldBinding(args: {
    field_type: string;
    config?: Record<string, unknown> | null;
    fallbackOptionSetKey?: string | null;
}): SelectFieldBinding {
    const fromConfig = getOptionSetKeyFromConfig(args.config);
    const option_set_key = fromConfig || (args.fallbackOptionSetKey?.trim() ?? "") || null;
    const isSelect = isSelectLikeFieldType(args.field_type) && !!option_set_key;
    return { isSelect, option_set_key: isSelect ? option_set_key : null };
}

export function uniqueOptionSetKeys(keys: Iterable<string | null | undefined>): string[] {
    const out = new Set<string>();
    for (const k of keys) {
        const t = (k ?? "").trim();
        if (t) out.add(t);
    }
    return [...out].sort();
}
