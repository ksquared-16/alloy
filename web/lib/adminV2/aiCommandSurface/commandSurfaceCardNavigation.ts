export type CommandSurfaceCardClickEvent = {
    preventDefault: () => void;
    stopPropagation: () => void;
};

/** Ensures nested links/buttons receive clicks inside the command-surface footer thread. */
export const COMMAND_SURFACE_INTERACTIVE_CARD_CLASS = "relative z-[1] pointer-events-auto";

/**
 * Navigates from an action card control without the parent command surface swallowing the click.
 */
export function handleCommandSurfaceCardNavigate(
    event: CommandSurfaceCardClickEvent,
    href: string | null | undefined,
    navigate: (href: string) => void
): void {
    const trimmed = href?.trim();
    if (!trimmed) return;
    event.preventDefault();
    event.stopPropagation();
    navigate(trimmed);
}
