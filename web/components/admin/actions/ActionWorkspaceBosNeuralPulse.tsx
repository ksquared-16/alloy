"use client";

import { useEffect, useId, useState } from "react";

/** Household intelligence graph — parent hub with contact + child nodes. */
const NODES = [
    { id: "hub", cx: 50, cy: 42, r: 6, label: "household" },
    { id: "contact", cx: 22, cy: 78, r: 4.5, label: "contact" },
    { id: "child", cx: 78, cy: 78, r: 4.5, label: "child" },
    { id: "lead", cx: 38, cy: 112, r: 4, label: "lead" },
    { id: "record", cx: 62, cy: 112, r: 4, label: "record" },
] as const;

const EDGES: { from: number; to: number; key: string }[] = [
    { from: 0, to: 1, key: "hub-contact" },
    { from: 0, to: 2, key: "hub-child" },
    { from: 1, to: 3, key: "contact-lead" },
    { from: 2, to: 4, key: "child-record" },
    { from: 3, to: 4, key: "lead-record" },
];

type Props = {
    className?: string;
    activePhaseIndex?: number;
};

/** Subtle BOS intelligence pulse — nodes activate, connections light. Presentation only. */
export function ActionWorkspaceBosNeuralPulse({ className = "", activePhaseIndex = 0 }: Props) {
    const glowId = useId();
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const timer = window.setInterval(() => setTick((t) => t + 1), 1200);
        return () => window.clearInterval(timer);
    }, []);

    const activeEdgeIndex = (activePhaseIndex + tick) % EDGES.length;
    const activeNodeIndex = (activePhaseIndex + Math.floor(tick / 2)) % NODES.length;

    return (
        <svg
            viewBox="0 0 100 130"
            className={className}
            aria-hidden
            data-testid="action-workspace-bos-neural-pulse"
        >
            <defs>
                <radialGradient id={glowId} cx="50%" cy="38%" r="65%">
                    <stop offset="0%" stopColor="#00A283" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#00A283" stopOpacity={0} />
                </radialGradient>
            </defs>
            <ellipse cx="50" cy="72" rx="44" ry="50" fill={`url(#${glowId})`} />
            {EDGES.map((edge, i) => {
                const a = NODES[edge.from];
                const b = NODES[edge.to];
                const lit = i === activeEdgeIndex || i === (activeEdgeIndex + 1) % EDGES.length;
                return (
                    <line
                        key={edge.key}
                        x1={a.cx}
                        y1={a.cy}
                        x2={b.cx}
                        y2={b.cy}
                        stroke="#00A283"
                        strokeOpacity={lit ? 0.55 : 0.14}
                        strokeWidth={lit ? 2 : 1.25}
                        className="transition-all duration-700"
                    />
                );
            })}
            {NODES.map((node, i) => {
                const active = i === activeNodeIndex || i === (activeNodeIndex + 1) % NODES.length;
                return (
                    <g key={node.id}>
                        {active ?
                            <circle
                                cx={node.cx}
                                cy={node.cy}
                                r={node.r + 5}
                                fill="#00A283"
                                fillOpacity={0.12}
                                className="animate-pulse"
                                style={{ animationDuration: "2s" }}
                            />
                        :   null}
                        <circle
                            cx={node.cx}
                            cy={node.cy}
                            r={node.r}
                            fill="#00A283"
                            fillOpacity={active ? 0.75 : 0.35}
                            className="transition-all duration-500"
                        />
                    </g>
                );
            })}
        </svg>
    );
}
