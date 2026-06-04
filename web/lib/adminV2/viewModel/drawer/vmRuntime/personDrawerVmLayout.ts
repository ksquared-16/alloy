import type { PersonDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/person/types";
import type { ChildDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/child/types";
import {
    PERSON_LAYOUT_VARIANT_DEFAULTS,
    PERSON_LAYOUT_VARIANT_GENERIC,
    type PersonOperatingSectionKey,
    type ResolvedPersonDrawerLayoutVariant,
} from "@/lib/admin/person/personDrawerLayoutRuntime";

export function layoutVariantFromPersonVm(vm: PersonDrawerViewModel): ResolvedPersonDrawerLayoutVariant {
    const variantKey = vm.layout.variant_key?.trim() || PERSON_LAYOUT_VARIANT_GENERIC;
    const fallback =
        PERSON_LAYOUT_VARIANT_DEFAULTS[variantKey] ??
        PERSON_LAYOUT_VARIANT_DEFAULTS[PERSON_LAYOUT_VARIANT_GENERIC]!;
    return {
        variant_key: variantKey,
        source: "code_default",
        config: {
            ...fallback,
            person_operating_sections: vm.layout.operating_sections as PersonOperatingSectionKey[],
        },
    };
}

export function layoutVariantFromChildVm(vm: ChildDrawerViewModel): ResolvedPersonDrawerLayoutVariant {
    const variantKey = vm.layout.variant_key?.trim() || PERSON_LAYOUT_VARIANT_GENERIC;
    const fallback =
        PERSON_LAYOUT_VARIANT_DEFAULTS[variantKey] ??
        PERSON_LAYOUT_VARIANT_DEFAULTS[PERSON_LAYOUT_VARIANT_GENERIC]!;
    return {
        variant_key: variantKey,
        source: "code_default",
        config: {
            ...fallback,
            person_operating_sections: vm.layout.operating_sections as PersonOperatingSectionKey[],
        },
    };
}
