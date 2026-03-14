"use client";

import { useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";
import { neutral, derived } from "@/styles/tokens/colors";
import SystemMapNode from "./SystemMapNode";

const nodeTypes = { systemMap: SystemMapNode };

const initialNodes: Node[] = [
  {
    id: "1",
    type: "systemMap",
    position: { x: 100, y: 100 },
    data: { label: "Customer", nodeType: "customer" },
    draggable: true,
  },
  {
    id: "2",
    type: "systemMap",
    position: { x: 280, y: 100 },
    data: { label: "Job", nodeType: "job" },
    draggable: true,
  },
];

const initialEdges: Edge[] = [];

export default function SystemCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  return (
    <div className="w-full h-full" style={{ backgroundColor: neutral.background }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color={neutral.border} />
        <Controls />
        <MiniMap
          nodeColor={neutral.border}
          maskColor={derived.maskOverlay}
          style={{ backgroundColor: neutral.surface }}
        />
      </ReactFlow>
    </div>
  );
}
