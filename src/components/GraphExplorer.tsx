/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Network,
  Compass,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Lock,
  Unlock,
  AlertTriangle,
  GitCommit,
  Info,
  Calendar,
  X,
  Play
} from "lucide-react";
import {
  DecryptedDatabase,
  Entity,
  Relationship,
  DomainId,
  EntityType,
  RelationType,
  PersistenceType,
  RecordStatus,
  PathRole
} from "../types";
import { buildObserverSubgraph, findShortestBadPath, performBridgeAnalysis } from "../utils/analysis";
import { DEFAULT_DOMAINS } from "../utils/database";

const getDomainLabel = (id: DomainId) => {
  const def = DEFAULT_DOMAINS.find((d) => d.id === id);
  return def ? def.label : id;
};

interface GraphExplorerProps {
  db: DecryptedDatabase;
  onUpdateDb: (updatedDb: DecryptedDatabase) => void;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
}

interface NodePosition {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  entity: Entity;
  size: number;
}

export default function GraphExplorer({ db, selectedNodeId, setSelectedNodeId }: GraphExplorerProps) {
  // Graph Projection Filters
  const [selectedObserverId, setSelectedObserverId] = useState<string>("");
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [selectedTargetId, setSelectedTargetId] = useState<string>("");
  const [timeWindow, setTimeWindow] = useState<"current" | "historical_accum">("current");
  const [confidenceMin, setConfidenceMin] = useState<number>(1);
  const [allowedDomains, setAllowedDomains] = useState<DomainId[]>(Object.values(DomainId));

  // Layout positions
  const [nodes, setNodes] = useState<NodePosition[]>([]);
  const [edges, setEdges] = useState<Relationship[]>([]);
  const [shortestPathNodes, setShortestPathNodes] = useState<string[]>([]);

  // Pan / Zoom State
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Detail drawers
  const [selectedEdge, setSelectedEdge] = useState<Relationship | null>(null);

  // Re-run projection on filter changes
  useEffect(() => {
    // 1. Get filtered subgraph
    const { nodes: subNodes, edges: subEdges } = buildObserverSubgraph(db, selectedObserverId || null, {
      timeWindow,
      confidenceThreshold: confidenceMin,
      allowedDomains
    });

    setEdges(subEdges);

    // 2. Compute Node Size based on centralities (bridges)
    const centralities = performBridgeAnalysis(db);
    const nodeSizes = new Map<string, number>();
    subNodes.forEach((n) => {
      const bridgeInfo = centralities.find((c) => c.nodeId === n.id);
      const centWeight = bridgeInfo ? bridgeInfo.betweenness + bridgeInfo.degree * 2 : 0;
      nodeSizes.set(n.id, Math.max(12, Math.min(30, 12 + centWeight)));
    });

    // 3. Initialize layout positions in a circle, then run simple force repulsion
    let initialPositions: NodePosition[] = subNodes.map((node, idx) => {
      const angle = (idx / subNodes.length) * 2 * Math.PI;
      const radius = 150 + Math.random() * 50;
      return {
        id: node.id,
        x: 400 + Math.cos(angle) * radius,
        y: 300 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        entity: node,
        size: nodeSizes.get(node.id) || 15
      };
    });

    // Simple 40-step Force Directed Simulation in JS for perfect layout spacing!
    const width = 800;
    const height = 600;

    for (let iter = 0; iter < 45; iter++) {
      // Pull to center
      initialPositions.forEach((n) => {
        n.vx += (width / 2 - n.x) * 0.01;
        n.vy += (height / 2 - n.y) * 0.01;
      });

      // Repel nodes from each other
      for (let i = 0; i < initialPositions.length; i++) {
        for (let j = i + 1; j < initialPositions.length; j++) {
          const n1 = initialPositions[i];
          const n2 = initialPositions[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.hypot(dx, dy) || 1;
          const minDist = n1.size + n2.size + 85;

          if (dist < minDist) {
            const force = (minDist - dist) * 0.08;
            const rx = (dx / dist) * force;
            const ry = (dy / dist) * force;

            n1.vx -= rx;
            n1.vy -= ry;
            n2.vx += rx;
            n2.vy += ry;
          }
        }
      }

      // Link attraction forces
      subEdges.forEach((edge) => {
        const n1 = initialPositions.find((n) => n.id === edge.source_entity_id);
        const n2 = initialPositions.find((n) => n.id === edge.target_entity_id);
        if (n1 && n2) {
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.hypot(dx, dy) || 1;
          const desiredDist = 120;
          const force = (dist - desiredDist) * 0.015;

          const rx = (dx / dist) * force;
          const ry = (dy / dist) * force;

          n1.vx += rx;
          n1.vy += ry;
          n2.vx -= rx;
          n2.vy -= ry;
        }
      });

      // Update positions with damping
      initialPositions.forEach((n) => {
        n.x += n.vx;
        n.y += n.vy;
        n.vx *= 0.8;
        n.vy *= 0.8;

        // Keep boundary constraints
        n.x = Math.max(n.size + 10, Math.min(width - n.size - 10, n.x));
        n.y = Math.max(n.size + 10, Math.min(height - n.size - 10, n.y));
      });
    }

    setNodes(initialPositions);

    // 4. Calculate Shortest Bad Path if selectors are enabled
    if (selectedSourceId && selectedTargetId) {
      const pathResult = findShortestBadPath(db, selectedObserverId || null, selectedSourceId, selectedTargetId, {
        timeWindow,
        confidenceThreshold: confidenceMin
      });
      if (pathResult) {
        setShortestPathNodes(pathResult.steps.map((s) => s.nodeId));
      } else {
        setShortestPathNodes([]);
      }
    } else {
      setShortestPathNodes([]);
    }

  }, [db, selectedObserverId, selectedSourceId, selectedTargetId, timeWindow, confidenceMin, allowedDomains]);

  // Drag and drop / pan handlers
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // If we clicked directly on a node/edge, don't drag the whole stage
    const target = e.target as SVGElement;
    if (target.closest(".node-group") || target.closest(".edge-line")) return;

    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoom = (direction: "in" | "out") => {
    setZoom((prev) => (direction === "in" ? Math.min(2.5, prev + 0.15) : Math.max(0.4, prev - 0.15)));
  };

  const resetStage = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedNodeId(null);
    setSelectedEdge(null);
  };

  const getDomainColor = (id: DomainId) => {
    const def = DEFAULT_DOMAINS.find((d) => d.id === id);
    return def ? def.color : "#64748b";
  };

  // Node Shape generator based on EntityType
  const renderNodeShape = (node: NodePosition) => {
    const color = getDomainColor(node.entity.domain_id);
    const size = node.size;
    const isSelected = selectedNodeId === node.id;
    const isPathNode = shortestPathNodes.includes(node.id);

    const highlightBorder = isSelected 
      ? "stroke-cyan-400 stroke-3 animate-pulse" 
      : isPathNode 
        ? "stroke-orange-400 stroke-2.5" 
        : "stroke-slate-900 stroke-1.5";

    switch (node.entity.entity_type) {
      case EntityType.Person:
        return (
          <circle
            cx={0}
            cy={0}
            r={size}
            fill={color}
            className={`${highlightBorder} cursor-pointer hover:opacity-90 transition-all`}
          />
        );
      case EntityType.Organization:
      case EntityType.Observer:
        // Hexagon/Square
        return (
          <rect
            x={-size}
            y={-size}
            width={size * 2}
            height={size * 2}
            rx={4}
            fill={color}
            className={`${highlightBorder} cursor-pointer hover:opacity-90 transition-all`}
          />
        );
      case EntityType.PhoneNumber:
      case EntityType.SIM:
        // Diamond
        const half = size * 1.3;
        return (
          <polygon
            points={`0,-${half} ${half},0 0,${half} -${half},0`}
            fill={color}
            className={`${highlightBorder} cursor-pointer hover:opacity-90 transition-all`}
          />
        );
      case EntityType.Device:
      default:
        // Rounded Square
        return (
          <rect
            x={-size}
            y={-size}
            width={size * 2}
            height={size * 2}
            rx={size * 0.4}
            fill={color}
            className={`${highlightBorder} cursor-pointer hover:opacity-90 transition-all`}
          />
        );
    }
  };

  const activeNodeInfo = db.entities.find((e) => e.id === selectedNodeId);
  const activeNodeIdentifiers = db.identifiers.filter((i) => i.entity_id === selectedNodeId);

  return (
    <div id="graph-explorer-page" className="flex-1 overflow-hidden h-screen flex bg-slate-900 text-slate-100 font-sans">
      
      {/* Filters sidebar (Left inside the explorer stage) */}
      <div className="w-80 bg-slate-950 border-r border-slate-800 p-5 flex flex-col justify-between h-full shrink-0">
        <div className="space-y-6 overflow-y-auto">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-900">
            <SlidersHorizontal className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-white">Projection Controls</h2>
          </div>

          {/* Observer Selector */}
          <div className="space-y-1">
            <label htmlFor="exp-observer-select" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Observer Lens</label>
            <select
              id="exp-observer-select"
              value={selectedObserverId}
              onChange={(e) => setSelectedObserverId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl focus:outline-none text-xs text-slate-300"
            >
              <option value="">-- Complete Graph View --</option>
              {db.entities.filter((e) => e.status === RecordStatus.Active && (e.entity_type === EntityType.Observer || e.domain_id === DomainId.OBSERVER)).map((obs) => (
                <option key={obs.id} value={obs.id}>{obs.display_label}</option>
              ))}
            </select>
          </div>

          {/* Shortest Bad Path Controls */}
          <div className="p-3.5 bg-slate-900/40 border border-slate-800/60 rounded-xl space-y-4">
            <span className="text-2xs font-bold uppercase tracking-wider text-orange-400 block">Path Exposure Query</span>
            
            <div className="space-y-1">
              <label htmlFor="exp-source-select" className="text-3xs font-semibold uppercase tracking-wider text-slate-500">Source Entity</label>
              <select
                id="exp-source-select"
                value={selectedSourceId}
                onChange={(e) => setSelectedSourceId(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-3xs text-slate-300 focus:outline-none"
              >
                <option value="">-- Choose source... --</option>
                {db.entities.filter((e) => e.status === RecordStatus.Active).map((ent) => (
                  <option key={ent.id} value={ent.id}>{ent.display_label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="exp-target-select" className="text-3xs font-semibold uppercase tracking-wider text-slate-500">Protected Target</label>
              <select
                id="exp-target-select"
                value={selectedTargetId}
                onChange={(e) => setSelectedTargetId(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-3xs text-slate-300 focus:outline-none"
              >
                <option value="">-- Choose target... --</option>
                {db.entities.filter((e) => e.protected && e.status === RecordStatus.Active).map((ent) => (
                  <option key={ent.id} value={ent.id}>{ent.display_label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Temporal constraints */}
          <div className="space-y-1">
            <label htmlFor="exp-temporal-select" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Time Projection</label>
            <select
              id="exp-temporal-select"
              value={timeWindow}
              onChange={(e) => setTimeWindow(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none"
            >
              <option value="current">Current Connections Only</option>
              <option value="historical_accum">Historical Accumulation Projection</option>
            </select>
          </div>

          {/* Confidence threshold slider */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-xs text-slate-500">
              <span className="font-semibold uppercase tracking-wider">Min Confidence</span>
              <span className="font-mono">{confidenceMin}/5</span>
            </div>
            <input
              id="exp-confidence-slider"
              type="range"
              min={1}
              max={5}
              className="w-full accent-cyan-500"
              value={confidenceMin}
              onChange={(e) => setConfidenceMin(parseInt(e.target.value))}
            />
          </div>

          {/* Domain filtering toggles */}
          <div className="space-y-1.5 pt-4 border-t border-slate-900">
            <span className="text-3xs font-bold uppercase tracking-wider text-slate-500 block mb-2">Toggle Compartments</span>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-2">
              {DEFAULT_DOMAINS.map((domain) => {
                const isChecked = allowedDomains.includes(domain.id);
                return (
                  <label key={domain.id} className="flex items-center gap-2.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 bg-slate-900 border-slate-800 text-cyan-500 rounded"
                      checked={isChecked}
                      onChange={() => {
                        if (isChecked) {
                          setAllowedDomains(allowedDomains.filter((d) => d !== domain.id));
                        } else {
                          setAllowedDomains([...allowedDomains, domain.id]);
                        }
                      }}
                    />
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: domain.color }} />
                    <span className="truncate">{domain.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Dynamic Legend */}
        <div className="pt-4 border-t border-slate-900 text-3xs font-mono text-slate-600 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-slate-800 rounded-full border border-slate-600 block shrink-0" />
            <span>Circle: Person</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-slate-800 rounded border border-slate-600 block shrink-0" />
            <span>Square: Org / Observer</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-2 bg-slate-800 transform rotate-45 border border-slate-600 block shrink-0" />
            <span>Diamond: SIM / Identifier</span>
          </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 h-full relative flex flex-col justify-between">
        {/* Navigation / controls overlays */}
        <div className="absolute top-6 left-6 z-10 flex gap-2">
          <button
            id="zoom-in-btn"
            onClick={() => handleZoom("in")}
            className="p-2.5 bg-slate-950/90 border border-slate-800/80 hover:border-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            id="zoom-out-btn"
            onClick={() => handleZoom("out")}
            className="p-2.5 bg-slate-950/90 border border-slate-800/80 hover:border-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            id="recenter-btn"
            onClick={resetStage}
            className="p-2.5 bg-slate-950/90 border border-slate-800/80 hover:border-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* SVG Drawing Canvas */}
        <svg
          id="graph-canvas"
          className="w-full h-full cursor-grab active:cursor-grabbing bg-slate-950 select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Main transformation group for panning/zooming */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            
            {/* Draw Edges / Connections */}
            {edges.map((edge) => {
              const n1 = nodes.find((n) => n.id === edge.source_entity_id);
              const n2 = nodes.find((n) => n.id === edge.target_entity_id);
              if (!n1 || !n2) return null;

              const isHistorical = edge.persistence === PersistenceType.Historical;
              const isInference = edge.path_role === PathRole.Inference;
              const isPathEdge = shortestPathNodes.includes(edge.source_entity_id) && shortestPathNodes.includes(edge.target_entity_id);
              const isSelected = selectedEdge?.id === edge.id;

              let strokeCol = isPathEdge 
                ? "#f97316" 
                : isSelected 
                  ? "#22d3ee" 
                  : "#475569";
              
              if (isHistorical && !isPathEdge) {
                strokeCol = "#334155"; // faded out
              }

              return (
                <g key={edge.id} className="edge-line">
                  {/* Glowing background line for highlight bad paths */}
                  {isPathEdge && (
                    <line
                      x1={n1.x}
                      y1={n1.y}
                      x2={n2.x}
                      y2={n2.y}
                      stroke="#ea580c"
                      strokeWidth={8}
                      strokeOpacity={0.25}
                      strokeLinecap="round"
                    />
                  )}

                  <line
                    x1={n1.x}
                    y1={n1.y}
                    x2={n2.x}
                    y2={n2.y}
                    stroke={strokeCol}
                    strokeWidth={isSelected ? 3 : isPathEdge ? 2.5 : 1.5}
                    strokeDasharray={isInference ? "4,4" : undefined}
                    strokeOpacity={isHistorical ? 0.35 : 0.8}
                    className="cursor-pointer hover:stroke-cyan-400 hover:stroke-2 transition-all"
                    onClick={() => {
                      setSelectedEdge(edge);
                      setSelectedNodeId(null);
                    }}
                  />
                </g>
              );
            })}

            {/* Draw Nodes */}
            {nodes.map((node) => {
              const isSelected = selectedNodeId === node.id;
              const isPathNode = shortestPathNodes.includes(node.id);

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={() => {
                    setSelectedNodeId(node.id);
                    setSelectedEdge(null);
                  }}
                  className="node-group cursor-pointer select-none"
                >
                  {renderNodeShape(node)}
                  <text
                    y={node.size + 14}
                    textAnchor="middle"
                    fill={isSelected ? "#22d3ee" : isPathNode ? "#f97316" : "#cbd5e1"}
                    className="text-3xs font-semibold pointer-events-none select-none font-sans"
                  >
                    {node.entity.display_label}
                  </text>
                </g>
              );
            })}

          </g>
        </svg>

        {/* Detailed Drawers / Information Panel (Renders on the bottom overlapping if selected) */}
        {activeNodeInfo && (
          <div id="node-detail-drawer" className="absolute bottom-6 left-6 right-6 bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-2xl flex justify-between items-start z-10 font-sans animate-slide-up">
            <div className="space-y-4 flex-1">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full animate-ping" style={{ backgroundColor: getDomainColor(activeNodeInfo.domain_id) }} />
                <h3 className="text-base font-bold text-white">{activeNodeInfo.display_label}</h3>
                <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-3xs font-mono capitalize">
                  {activeNodeInfo.entity_type}
                </span>
                <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-3xs font-mono">
                  Sensitivity: {activeNodeInfo.sensitivity}/10
                </span>
              </div>

              {/* Connected identifier lists */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-2xs font-bold uppercase tracking-wider text-slate-500 block mb-2">Attached Secure Keys / Identifiers</span>
                  {activeNodeIdentifiers.length === 0 ? (
                    <span className="text-xs text-slate-600 font-mono italic">No attached path identifiers.</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {activeNodeIdentifiers.map((i) => (
                        <span key={i.id} className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-xl text-3xs font-mono text-slate-300">
                          {i.identifier_type}: {i.normalized_value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <span className="text-2xs font-bold uppercase tracking-wider text-slate-500 block mb-2">Security Compartment</span>
                  <p className="text-xs text-slate-400">
                    Belongs to the <strong className="text-slate-300">{getDomainLabel(activeNodeInfo.domain_id)}</strong> domain. Isolated context verified at startup.
                  </p>
                </div>
              </div>
            </div>

            <button
              id="close-node-drawer-btn"
              onClick={() => setSelectedNodeId(null)}
              className="p-1 text-slate-500 hover:text-white transition-colors ml-4"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {selectedEdge && (
          <div id="edge-detail-drawer" className="absolute bottom-6 left-6 right-6 bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-2xl flex justify-between items-start z-10 font-sans animate-slide-up">
            <div className="space-y-4 flex-1">
              <div className="flex items-center gap-3 text-sm font-bold text-white">
                <span>{db.entities.find((e) => e.id === selectedEdge.source_entity_id)?.display_label}</span>
                <span className="text-indigo-400 font-mono text-xs">─── [{selectedEdge.relation_type}] ───</span>
                <span>{db.entities.find((e) => e.id === selectedEdge.target_entity_id)?.display_label}</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 text-center text-xs font-mono">
                <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800/80">
                  <span className="text-3xs text-slate-500 block uppercase font-semibold">Path Role</span>
                  <span className="text-xs font-bold mt-1 block capitalize text-cyan-400">{selectedEdge.path_role}</span>
                </div>
                <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800/80">
                  <span className="text-3xs text-slate-500 block uppercase font-semibold">Persistence</span>
                  <span className="text-xs font-bold mt-1 block capitalize text-indigo-400">{selectedEdge.persistence}</span>
                </div>
                <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800/80">
                  <span className="text-3xs text-slate-500 block uppercase font-semibold">Confidence</span>
                  <span className="text-xs font-bold mt-1 block text-slate-300">{selectedEdge.confidence}/5</span>
                </div>
                <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800/80">
                  <span className="text-3xs text-slate-500 block uppercase font-semibold">Approved State</span>
                  <span className={`text-xs font-bold mt-1 block uppercase ${
                    selectedEdge.intentional ? "text-emerald-400" : "text-red-400"
                  }`}>
                    {selectedEdge.intentional ? "Intentional" : "Flagged Leak"}
                  </span>
                </div>
              </div>
            </div>

            <button
              id="close-edge-drawer-btn"
              onClick={() => setSelectedEdge(null)}
              className="p-1 text-slate-500 hover:text-white transition-colors ml-4"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
