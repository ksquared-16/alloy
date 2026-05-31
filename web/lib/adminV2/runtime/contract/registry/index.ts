import type { AdminV2DrawerSurface } from "@/lib/adminV2/runtime/contract/types";
import type { AdminV2DrawerSectionContract } from "@/lib/adminV2/runtime/contract/drawerSectionContract";
import { CHILD_DRAWER_SECTION_REGISTRY } from "@/lib/adminV2/runtime/contract/registry/childDrawerSections";
import { OPPORTUNITY_DRAWER_SECTION_REGISTRY } from "@/lib/adminV2/runtime/contract/registry/opportunityDrawerSections";
import { PARENT_DRAWER_SECTION_REGISTRY } from "@/lib/adminV2/runtime/contract/registry/parentDrawerSections";

export { CHILD_DRAWER_SECTION_REGISTRY } from "@/lib/adminV2/runtime/contract/registry/childDrawerSections";
export { OPPORTUNITY_DRAWER_SECTION_REGISTRY } from "@/lib/adminV2/runtime/contract/registry/opportunityDrawerSections";
export { PARENT_DRAWER_SECTION_REGISTRY } from "@/lib/adminV2/runtime/contract/registry/parentDrawerSections";

const BY_SURFACE: Record<AdminV2DrawerSurface, readonly AdminV2DrawerSectionContract[]> = {
    opportunity: OPPORTUNITY_DRAWER_SECTION_REGISTRY,
    parent: PARENT_DRAWER_SECTION_REGISTRY,
    child: CHILD_DRAWER_SECTION_REGISTRY,
    generic: [],
};

export function drawerSectionRegistryForSurface(
    surface: AdminV2DrawerSurface
): readonly AdminV2DrawerSectionContract[] {
    return BY_SURFACE[surface] ?? [];
}

export const ALL_ADMINV2_DRAWER_SECTION_REGISTRY: readonly AdminV2DrawerSectionContract[] = [
    ...OPPORTUNITY_DRAWER_SECTION_REGISTRY,
    ...PARENT_DRAWER_SECTION_REGISTRY,
    ...CHILD_DRAWER_SECTION_REGISTRY,
];
