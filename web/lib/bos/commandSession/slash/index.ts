export {
    BOS_SLASH_SESSION_ADAPTER_KEYS,
    isBosSlashComposerQuery,
    queryBosSlashCatalog,
    type QueryBosSlashCatalogInput,
} from "@/lib/bos/commandSession/slash/queryBosSlashCatalog";
export { resolveBosProcessEffectiveCommandKeys } from "@/lib/bos/commandSession/slash/resolveBosProcessEffectiveCommandKeys";
export {
    bosProcessEffectiveCommandKeysFromDepartmentMetadata,
    pickActiveLifecycleProcess,
} from "@/lib/bos/commandSession/slash/bosProcessEffectiveCommandKeysFromMetadata";
