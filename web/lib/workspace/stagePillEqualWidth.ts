/** Equal-width stage pill grid — width derived from longest label + count padding. */
export function computeEqualStagePillGrid(labels: readonly string[]): {
    pillCount: number;
    gridTemplateColumns: string;
} {
    const normalized = labels.length ? labels : ["Stage"];
    const longest = Math.max(...normalized.map((label) => label.trim().length), 5);
    const widthCh = longest + 4;
    const pillCount = normalized.length;
    return {
        pillCount,
        gridTemplateColumns: `repeat(${pillCount}, minmax(${widthCh}ch, ${widthCh}ch))`,
    };
}
