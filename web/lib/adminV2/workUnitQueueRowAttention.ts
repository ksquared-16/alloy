/** True when queue row payload carries an active operational needs-attention reason. */
export function queueRowHasOperationalAttention(row: Record<string, unknown>): boolean {
    return Boolean((row as { _needs_attention?: boolean })._needs_attention);
}
