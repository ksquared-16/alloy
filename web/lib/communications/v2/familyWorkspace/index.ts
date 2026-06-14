// UI-5A/5B — public exports for the family workspace resolver + contract.
export * from "./types";
export { resolveFamilyCommunicationWorkspace, assembleFamilyWorkspace, type ResolveFamilyWorkspaceOptions, type FamilyCommsRaw } from "./assembleFamilyWorkspaceReexport";
export { loadFamilyWorkspaceData, type RawFamilyWorkspaceData } from "./loadFamilyWorkspaceData";
export { loadFamilyThreadsData } from "./loadFamilyThreadsData";
export { aggregateFamilyThreads, buildTimelineEvents, type RawThreadRow, type RawMessageRow } from "./aggregateFamilyTimeline";
export { tierForRoleType } from "./recipientTierPolicy";
export { buildChannelEligibility } from "./buildChannelEligibility";
export { stubFamilyWorkspaceTail } from "./stubFamilyWorkspaceTail";
export { resolveCustomerIdFromWorkspaceEntry } from "./resolveCustomerIdFromWorkspaceEntry";
export { orchestrateFamilySend, type FamilySendChannel, type FamilySendStatus, type SendRecipientResult, type FamilySendResult, type FamilySendDeps, type FamilySendArgs } from "./orchestrateFamilySend";
export { resolveCustomerScopeFromEntity, entityKind, type EntityScope, type EntityKind } from "./resolveCustomerScopeFromEntity";
