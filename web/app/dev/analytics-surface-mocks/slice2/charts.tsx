"use client";

import type {
    ChartBar,
    ChartSeries,
    ChartStackCategory,
    CohortRow,
    DrillDestination,
    FunnelStage,
    RankedItem,
    TableColumn,
    TableRow,
} from "./types";
import { TONE_BG, TONE_TEXT, tone } from "./tokens";

/**
 * Slice 2 chart renderers — SVG/CSS, presentation only, drill-aware.
 *
 * Charts are not decorative: every meaningful mark accepts a `DrillDestination`
 * and calls `onDrill` when clicked. Axis math is local and deterministic; values
 * are pre-resolved fixtures (no calculation here).
 */

function niceTicks(max: number, count = 4): number[] {
    if (max <= 0) return [0];
    const step = max / count;
    return Array.from({ length: count + 1 }, (_, i) => Math.round(step * i * 10) / 10);
}

type DrillProps = { onDrill?: (d: DrillDestination) => void };

function MarkTitle({ drill }: { drill?: DrillDestination }) {
    return drill ? <title>{drill.label}</title> : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Line chart with x/y axes and clickable points
// ─────────────────────────────────────────────────────────────────────────────

export function LineChart({
    series,
    yMax,
    onDrill,
}: { series: ChartSeries[]; yMax?: number } & DrillProps) {
    const W = 560;
    const H = 220;
    const pad = { l: 40, r: 16, t: 14, b: 30 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const xs = series[0]?.points.map((p) => p.x) ?? [];
    const allY = series.flatMap((s) => s.points.map((p) => p.y));
    const max = yMax ?? Math.max(1, ...allY) * 1.1;
    const ticks = niceTicks(max);

    const xPos = (i: number) => pad.l + (xs.length <= 1 ? plotW / 2 : (i / (xs.length - 1)) * plotW);
    const yPos = (v: number) => pad.t + plotH - (v / max) * plotH;

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Line chart" data-chart="line">
            {ticks.map((t) => (
                <g key={t}>
                    <line x1={pad.l} y1={yPos(t)} x2={W - pad.r} y2={yPos(t)} className="stroke-alloy-stone/15" strokeWidth={1} />
                    <text x={pad.l - 6} y={yPos(t) + 3} textAnchor="end" className="fill-alloy-midnight/45 text-[9px]">{t}</text>
                </g>
            ))}
            {xs.map((x, i) => (
                <text key={x} x={xPos(i)} y={H - 10} textAnchor="middle" className="fill-alloy-midnight/45 text-[9px]">{x}</text>
            ))}
            {series.map((s) => {
                const path = s.points
                    .map((p, i) => `${i === 0 ? "M" : "L"}${xPos(i).toFixed(1)},${yPos(p.y).toFixed(1)}`)
                    .join(" ");
                return (
                    <g key={s.id} className={TONE_TEXT[tone(s.tone)]}>
                        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                        {s.points.map((p, i) => (
                            <circle
                                key={`${s.id}-${p.x}`}
                                cx={xPos(i)}
                                cy={yPos(p.y)}
                                r={4}
                                className={`fill-white stroke-current ${p.drill ? "cursor-pointer" : ""}`}
                                strokeWidth={2}
                                onClick={p.drill && onDrill ? () => onDrill(p.drill!) : undefined}
                                data-chart-mark={p.drill ? "drillable" : undefined}
                            >
                                <MarkTitle drill={p.drill} />
                            </circle>
                        ))}
                    </g>
                );
            })}
        </svg>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Vertical bar chart with y-axis ticks and clickable bars
// ─────────────────────────────────────────────────────────────────────────────

export function BarChart({ bars, onDrill }: { bars: ChartBar[] } & DrillProps) {
    const W = 560;
    const H = 220;
    const pad = { l: 40, r: 12, t: 14, b: 34 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const max = Math.max(1, ...bars.map((b) => b.value)) * 1.1;
    const ticks = niceTicks(max);
    const slot = plotW / bars.length;
    const barW = Math.min(54, slot * 0.6);

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Bar chart" data-chart="bar">
            {ticks.map((t) => (
                <g key={t}>
                    <line x1={pad.l} y1={pad.t + plotH - (t / max) * plotH} x2={W - pad.r} y2={pad.t + plotH - (t / max) * plotH} className="stroke-alloy-stone/15" strokeWidth={1} />
                    <text x={pad.l - 6} y={pad.t + plotH - (t / max) * plotH + 3} textAnchor="end" className="fill-alloy-midnight/45 text-[9px]">{t}</text>
                </g>
            ))}
            {bars.map((b, i) => {
                const h = (b.value / max) * plotH;
                const x = pad.l + i * slot + (slot - barW) / 2;
                const y = pad.t + plotH - h;
                return (
                    <g key={b.label} className={TONE_TEXT[tone(b.tone)]}>
                        <rect
                            x={x}
                            y={y}
                            width={barW}
                            height={Math.max(2, h)}
                            rx={3}
                            className={`fill-current ${b.drill ? "cursor-pointer hover:opacity-80" : ""}`}
                            onClick={b.drill && onDrill ? () => onDrill(b.drill!) : undefined}
                            data-chart-mark={b.drill ? "drillable" : undefined}
                        >
                            <MarkTitle drill={b.drill} />
                        </rect>
                        <text x={x + barW / 2} y={y - 4} textAnchor="middle" className="fill-alloy-midnight/70 text-[9px] font-semibold">{b.formatted ?? b.value}</text>
                        <text x={pad.l + i * slot + slot / 2} y={H - 12} textAnchor="middle" className="fill-alloy-midnight/55 text-[9px]">{b.label}</text>
                    </g>
                );
            })}
        </svg>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stacked / grouped bar chart with clickable segments
// ─────────────────────────────────────────────────────────────────────────────

export function StackedBarChart({
    categories,
    mode = "stacked",
    onDrill,
}: { categories: ChartStackCategory[]; mode?: "stacked" | "grouped" } & DrillProps) {
    const W = 560;
    const H = 230;
    const pad = { l: 40, r: 12, t: 14, b: 34 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const totals = categories.map((c) => c.segments.reduce((s, seg) => s + seg.value, 0));
    const groupedMax = Math.max(1, ...categories.flatMap((c) => c.segments.map((s) => s.value)));
    const max = (mode === "stacked" ? Math.max(1, ...totals) : groupedMax) * 1.1;
    const ticks = niceTicks(max);
    const slot = plotW / categories.length;
    const groupW = Math.min(72, slot * 0.62);

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${mode} bar chart`} data-chart={mode === "stacked" ? "stacked-bar" : "grouped-bar"}>
            {ticks.map((t) => (
                <g key={t}>
                    <line x1={pad.l} y1={pad.t + plotH - (t / max) * plotH} x2={W - pad.r} y2={pad.t + plotH - (t / max) * plotH} className="stroke-alloy-stone/15" strokeWidth={1} />
                    <text x={pad.l - 6} y={pad.t + plotH - (t / max) * plotH + 3} textAnchor="end" className="fill-alloy-midnight/45 text-[9px]">{t}</text>
                </g>
            ))}
            {categories.map((c, ci) => {
                const baseX = pad.l + ci * slot + (slot - groupW) / 2;
                let stackTop = pad.t + plotH;
                const segW = mode === "grouped" ? groupW / c.segments.length : groupW;
                return (
                    <g key={c.label}>
                        {c.segments.map((seg, si) => {
                            const h = (seg.value / max) * plotH;
                            let x: number;
                            let y: number;
                            if (mode === "stacked") {
                                x = baseX;
                                stackTop -= h;
                                y = stackTop;
                            } else {
                                x = baseX + si * segW;
                                y = pad.t + plotH - h;
                            }
                            return (
                                <rect
                                    key={seg.key}
                                    x={x}
                                    y={y}
                                    width={Math.max(2, segW - (mode === "grouped" ? 2 : 0))}
                                    height={Math.max(2, h)}
                                    rx={2}
                                    className={`${TONE_TEXT[tone(seg.tone)]} fill-current ${seg.drill ? "cursor-pointer hover:opacity-80" : ""}`}
                                    onClick={seg.drill && onDrill ? () => onDrill(seg.drill!) : undefined}
                                    data-chart-mark={seg.drill ? "drillable" : undefined}
                                >
                                    <MarkTitle drill={seg.drill} />
                                </rect>
                            );
                        })}
                        <text x={pad.l + ci * slot + slot / 2} y={H - 12} textAnchor="middle" className="fill-alloy-midnight/55 text-[9px]">{c.label}</text>
                    </g>
                );
            })}
        </svg>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Funnel chart with clickable stages
// ─────────────────────────────────────────────────────────────────────────────

export function FunnelChart({ stages, onDrill }: { stages: FunnelStage[] } & DrillProps) {
    const max = Math.max(1, ...stages.map((s) => s.value));
    return (
        <div className="space-y-1.5" data-chart="funnel">
            {stages.map((s) => {
                const width = Math.max(8, Math.round((s.value / max) * 100));
                return (
                    <button
                        key={s.label}
                        type="button"
                        onClick={s.drill && onDrill ? () => onDrill(s.drill!) : undefined}
                        className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left ${s.drill ? "cursor-pointer hover:bg-alloy-stone/10" : ""}`}
                        data-chart-mark={s.drill ? "drillable" : undefined}
                        title={s.drill?.label}
                    >
                        <span className="w-24 shrink-0 truncate text-xs text-alloy-midnight/70">{s.label}</span>
                        <span className="relative h-6 flex-1 overflow-hidden rounded bg-alloy-stone/10">
                            <span className={`block h-full rounded ${TONE_BG[tone(s.tone)]}`} style={{ width: `${width}%` }} />
                        </span>
                        <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-alloy-midnight">{s.formatted ?? s.value}</span>
                        <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-alloy-midnight/45">{s.conversion ?? ""}</span>
                    </button>
                );
            })}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cohort heatmap with clickable cells
// ─────────────────────────────────────────────────────────────────────────────

export function CohortChart({
    columns,
    rows,
    onDrill,
}: { columns: string[]; rows: CohortRow[] } & DrillProps) {
    return (
        <div className="overflow-x-auto" data-chart="cohort">
            <table className="w-full border-separate" style={{ borderSpacing: 3 }}>
                <thead>
                    <tr>
                        <th className="text-left text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45" />
                        {columns.map((c) => (
                            <th key={c} className="px-1 text-center text-[10px] font-medium text-alloy-midnight/45">{c}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.label}>
                            <td className="pr-2 text-right text-[11px] font-medium text-alloy-midnight/70 whitespace-nowrap">{row.label}</td>
                            {row.cells.map((cell, i) => (
                                <td key={i} className="p-0">
                                    <button
                                        type="button"
                                        onClick={cell.drill && onDrill ? () => onDrill(cell.drill!) : undefined}
                                        title={cell.drill?.label}
                                        data-chart-mark={cell.drill ? "drillable" : undefined}
                                        className={`relative flex h-9 w-full min-w-[44px] items-center justify-center rounded ${TONE_TEXT[tone(cell.tone)]} ${cell.drill ? "cursor-pointer" : ""}`}
                                    >
                                        <span className="absolute inset-0 rounded bg-current" style={{ opacity: 0.12 + 0.62 * Math.max(0, Math.min(1, cell.intensity)) }} />
                                        <span className="relative text-[11px] font-semibold tabular-nums text-alloy-midnight/80">{cell.formatted}</span>
                                    </button>
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Data table / report with clickable rows
// ─────────────────────────────────────────────────────────────────────────────

export function DataTable({
    columns,
    rows,
    onDrill,
}: { columns: TableColumn[]; rows: TableRow[] } & DrillProps) {
    return (
        <div className="overflow-x-auto rounded-lg border border-alloy-stone/15" data-chart="table">
            <table className="w-full text-sm">
                <thead className="bg-alloy-stone/[0.06]">
                    <tr>
                        {columns.map((c) => (
                            <th key={c.key} className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/55 ${c.align === "right" ? "text-right" : "text-left"}`}>{c.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr
                            key={row.id}
                            onClick={row.drill && onDrill ? () => onDrill(row.drill!) : undefined}
                            className={`border-t border-alloy-stone/12 ${row.drill ? "cursor-pointer hover:bg-alloy-stone/[0.05]" : ""}`}
                            data-chart-mark={row.drill ? "drillable" : undefined}
                            title={row.drill?.label}
                        >
                            {columns.map((c, ci) => (
                                <td key={c.key} className={`px-3 py-2 text-alloy-midnight/80 ${c.align === "right" ? "text-right tabular-nums" : "text-left"}`}>
                                    {ci === 0 && row.tone ? <span className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${TONE_BG[tone(row.tone)]}`} /> : null}
                                    {row.cells[c.key] ?? ""}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ranked list with bars + drill
// ─────────────────────────────────────────────────────────────────────────────

export function RankedList({ items, onDrill }: { items: RankedItem[] } & DrillProps) {
    const max = Math.max(1, ...items.map((i) => i.value));
    return (
        <ol className="space-y-1.5" data-chart="ranked-list">
            {items.map((item, i) => {
                const width = Math.max(4, Math.round((item.value / max) * 100));
                return (
                    <li key={item.label}>
                        <button
                            type="button"
                            onClick={item.drill && onDrill ? () => onDrill(item.drill!) : undefined}
                            className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left ${item.drill ? "cursor-pointer hover:bg-alloy-stone/10" : ""}`}
                            data-chart-mark={item.drill ? "drillable" : undefined}
                            title={item.drill?.label}
                        >
                            <span className="w-4 shrink-0 text-right text-[11px] font-semibold tabular-nums text-alloy-midnight/40">{i + 1}</span>
                            <span className="w-28 shrink-0 truncate text-xs text-alloy-midnight/75">{item.label}</span>
                            <span className="h-2 flex-1 overflow-hidden rounded-full bg-alloy-stone/12">
                                <span className={`block h-full rounded-full ${TONE_BG[tone(item.tone)]}`} style={{ width: `${width}%` }} />
                            </span>
                            <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-alloy-midnight">{item.formatted}</span>
                        </button>
                    </li>
                );
            })}
        </ol>
    );
}
