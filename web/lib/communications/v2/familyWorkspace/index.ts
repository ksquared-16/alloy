// UI-5A — public exports for the family workspace resolver + contract.
export * from "./types";
export { resolveFamilyCommunicationWorkspace, assembleFamilyWorkspace, type ResolveFamilyWorkspaceOptions } from "./resolveFamilyCommunicationWorkspace";
export { loadFamilyWorkspaceData, type RawFamilyWorkspaceData } from "./loadFamilyWorkspaceData";
export { tierForRoleType } from "./recipientTierPolicy";
export { buildChannelEligibility } from "./buildChannelEligibility";
export { stubFamilyWorkspaceTail } from "./stubFamilyWorkspaceTail";
