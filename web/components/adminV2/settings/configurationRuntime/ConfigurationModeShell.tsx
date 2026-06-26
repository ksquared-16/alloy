/**
 * Shared Configuration Mode layout primitives and Processes shell default.
 * Context → Queue → Workspace → BOS applies across /settings surfaces.
 */
export {
    ConfigurationContext,
    ConfigurationDetailCard,
    ConfigurationPrimaryButton,
    ConfigurationQueue,
    ConfigurationQueueItem,
    ConfigurationShell,
    ConfigurationWorkspace,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";

export { default as ConfigurationPatternPlaceholder } from "@/components/adminV2/settings/configurationRuntime/ConfigurationPatternPlaceholder";

export { default } from "@/components/adminV2/settings/businessProcess/BusinessProcessConfigurationShell";
