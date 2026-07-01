import type { PersonOperatingSectionKey } from "@/lib/admin/person/personDrawerLayoutRuntime";
import type { AdminV2DrawerSurface } from "@/lib/adminV2/runtime/contract/types";

const PARENT_OPERATING_TO_REGISTRY: Partial<Record<PersonOperatingSectionKey, string>> = {
    parent_summary: "parent_summary",
    household: "parent_household",
    household_address: "parent_address",
    employee_status: "parent_employee_status",
};

const CHILD_OPERATING_TO_REGISTRY: Partial<Record<PersonOperatingSectionKey, string>> = {
    child_summary: "child_summary",
    household: "child_household",
};

/** Config-driven visible above-fold section keys for composed payload readiness. */
export function requiredPersonDrawerPayloadSectionKeys(args: {
    surface: Extract<AdminV2DrawerSurface, "parent" | "child">;
    operatingSections: readonly PersonOperatingSectionKey[];
    overviewSectionKeys: readonly string[];
}): string[] {
    const keys = new Set<string>();
    const map = args.surface === "parent" ? PARENT_OPERATING_TO_REGISTRY : CHILD_OPERATING_TO_REGISTRY;

    for (const section of args.operatingSections) {
        const registryKey = map[section];
        if (registryKey) keys.add(registryKey);
    }

    if (args.surface === "parent") {
        keys.add("parent_bos_panel");
    } else {
        keys.add("child_header_chips");
        keys.add("child_bos_panel");
        keys.add("child_medical");
    }

    return [...keys];
}

export function requiredOpportunityDrawerPayloadSectionKeys(inquiryChildrenSectionVisible: boolean): string[] {
    const keys = ["opportunity_lead_summary", "opportunity_bos_right_column"];
    if (inquiryChildrenSectionVisible) keys.push("opportunity_inquiry_children");
    return keys;
}
