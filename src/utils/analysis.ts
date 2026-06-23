/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DecryptedDatabase,
  Entity,
  Relationship,
  Identifier,
  Dataset,
  DomainId,
  EntityType,
  RelationType,
  PathRole,
  PersistenceType,
  RecordStatus,
  Severity,
  Finding,
  FindingStatus,
  Directionality,
  CommunicationRollup
} from "../types";
import { DEFAULT_WEIGHTS } from "./database";

/**
 * Interface representing a path step in our shortest path outputs.
 */
export interface PathStep {
  nodeId: string;
  label: string;
  domainId: DomainId;
  edgeType?: string;
  edgeCost?: number;
  explanation?: string;
  confidence?: number;
  isHistorical?: boolean;
}

export interface PathResult {
  steps: PathStep[];
  totalCost: number;
  hopCount: number;
  confidence: number;
  recommendedBreakPoints: string[]; // Node IDs to sever to break the path
}

/**
 * Simple implementation of Priority Queue for Dijkstra's Algorithm.
 */
class PriorityQueue<T> {
  private values: { val: T; priority: number }[] = [];

  enqueue(val: T, priority: number) {
    this.values.push({ val, priority });
    this.sort();
  }

  dequeue(): { val: T; priority: number } | undefined {
    return this.values.shift();
  }

  private sort() {
    this.values.sort((a, b) => a.priority - b.priority);
  }

  isEmpty(): boolean {
    return this.values.length === 0;
  }
}

/**
 * Gets the standard default traversal cost for a relationship type.
 */
export function getRelationCost(rel: Relationship, weights: { [key: string]: number }): number {
  if (rel.base_traversal_cost !== undefined && rel.base_traversal_cost > 0) {
    return rel.base_traversal_cost;
  }
  
  if (rel.persistence === PersistenceType.Historical) {
    return 8; // Historical connections have high traversal costs
  }

  const typeCost = weights[rel.relation_type];
  if (typeCost !== undefined) return typeCost;

  // Defaults per spec
  switch (rel.path_role) {
    case PathRole.Publication: return 1; // Publicly published
    case PathRole.Administration: return 1; // Direct provider/admin
    case PathRole.RecordMembership: return 1; // Accessible dataset
    case PathRole.Access: return 1;
    case PathRole.Inference:
      return rel.confidence <= 2 ? 6 : 4; // Weak vs documented inference
    case PathRole.Association:
    default:
      if (rel.relation_type === RelationType.communicates_with) return 3; // Cross-domain comm overlap
      if (rel.relation_type === RelationType.shares_recovery_with) return 2; // Recovery bridge
      return 9; // Unverified manual association
  }
}

/**
 * Builds the active projection of the graph based on observer capabilities, filter criteria, and time range.
 */
export function buildObserverSubgraph(
  db: DecryptedDatabase,
  observerId: string | null,
  filters: {
    timeWindow?: string; // "current" or "historical_accum"
    confidenceThreshold?: number; // 1..5
    allowedDomains?: DomainId[];
    allowedTypes?: RelationType[];
  }
): { nodes: Entity[]; edges: Relationship[] } {
  const confidenceMin = filters.confidenceThreshold ?? 1;
  const isHistoricalEnabled = filters.timeWindow === "historical_accum";

  // If no observer is selected, return the default filtered view
  if (!observerId) {
    const activeNodes = db.entities.filter(
      (e) => e.status === RecordStatus.Active && (!filters.allowedDomains || filters.allowedDomains.includes(e.domain_id))
    );
    const nodeIds = new Set(activeNodes.map((n) => n.id));

    const activeEdges = db.relationships.filter((r) => {
      if (r.status !== RecordStatus.Active) return false;
      if (r.confidence < confidenceMin) return false;
      if (r.persistence === PersistenceType.Historical && !isHistoricalEnabled) return false;
      if (!nodeIds.has(r.source_entity_id) || !nodeIds.has(r.target_entity_id)) return false;
      if (filters.allowedTypes && !filters.allowedTypes.includes(r.relation_type)) return false;
      return true;
    });

    return { nodes: activeNodes, edges: activeEdges };
  }

  // OBSERVER-SPECIFIC REACHABILITY TRAVERSAL
  // Observers can only traverse relationships they have explicit access/admin/publication edges to,
  // or that are contained inside datasets they can access.
  const observerNode = db.entities.find((e) => e.id === observerId);
  if (!observerNode) {
    return { nodes: [], edges: [] };
  }

  // 1. Identify accessible datasets for this observer
  // Any dataset where there is an access edge from the observer to the dataset
  const accessibleDatasets = new Set<string>();
  db.relationships.forEach((r) => {
    if (
      r.source_entity_id === observerId &&
      r.relation_type === RelationType.can_access &&
      r.status === RecordStatus.Active
    ) {
      // Find dataset node
      const ds = db.datasets.find((d) => d.id === r.target_entity_id || d.entity_id === r.target_entity_id);
      if (ds) accessibleDatasets.add(ds.id);
    }
  });

  // Also include datasets owned/retained by the observer directly
  db.datasets.forEach((ds) => {
    if (ds.entity_id === observerId) {
      accessibleDatasets.add(ds.id);
    }
  });

  // 2. Filter evidence items that belong to accessible datasets
  const evidencedRelationships = new Set<string>();
  const evidencedEntities = new Set<string>();

  db.evidence_items.forEach((ev) => {
    if (accessibleDatasets.has(ev.dataset_entity_id)) {
      if (ev.relationship_id) evidencedRelationships.add(ev.relationship_id);
      if (ev.entity_id) evidencedEntities.add(ev.entity_id);
    }
  });

  // 3. Define traversal edges
  // Observers can see:
  // - Direct edges from/to themselves (administers, provisions, retains, stores)
  // - Public relationships (linked to a Public Internet observer or containing standard public publication)
  // - Relationships they have direct evidence for in their datasets
  // - Manual unverified associations IF confidence >= threshold
  // - Inferences with confidence >= threshold
  const visibleEdges = db.relationships.filter((r) => {
    if (r.status !== RecordStatus.Active) return false;
    if (r.confidence < confidenceMin) return false;
    if (r.persistence === PersistenceType.Historical && !isHistoricalEnabled) return false;

    // Is it direct observer connection?
    if (r.source_entity_id === observerId || r.target_entity_id === observerId) {
      return true;
    }

    // Is it backed by our accessible datasets?
    if (evidencedRelationships.has(r.id)) {
      return true;
    }

    // Is it a public publication edge?
    if (r.path_role === PathRole.Publication) {
      return true;
    }

    // Is it linked to the Public Internet observer?
    const sourceNode = db.entities.find((e) => e.id === r.source_entity_id);
    const targetNode = db.entities.find((e) => e.id === r.target_entity_id);
    if (
      sourceNode?.domain_id === DomainId.PROFESSIONAL_PUBLIC ||
      targetNode?.domain_id === DomainId.PROFESSIONAL_PUBLIC
    ) {
      return true;
    }

    // If observer has 'can_infer' edge or confidence is high, check if we allow behavior inferences
    if (r.path_role === PathRole.Inference && r.confidence >= Math.max(3, confidenceMin)) {
      return true;
    }

    return false;
  });

  // Filter visible nodes
  const visibleNodeIds = new Set<string>([observerId]);
  visibleEdges.forEach((e) => {
    visibleNodeIds.add(e.source_entity_id);
    visibleNodeIds.add(e.target_entity_id);
  });

  const visibleNodes = db.entities.filter((e) => {
    return visibleNodeIds.has(e.id) && (!filters.allowedDomains || filters.allowedDomains.includes(e.domain_id));
  });

  return { nodes: visibleNodes, edges: visibleEdges };
}

/**
 * Runs Dijkstra's shortest path algorithm on the projected subgraph.
 */
export function findShortestBadPath(
  db: DecryptedDatabase,
  observerId: string | null,
  sourceId: string, // could be an entity ID or domain ID representation
  targetId: string, // could be an entity ID or domain ID representation
  filters: {
    timeWindow?: string;
    confidenceThreshold?: number;
    maxInferenceLevel?: number;
  }
): PathResult | null {
  // Build subgraph
  const { nodes, edges } = buildObserverSubgraph(db, observerId, {
    timeWindow: filters.timeWindow,
    confidenceThreshold: filters.confidenceThreshold
  });

  const weights = db.settings?.weights || DEFAULT_WEIGHTS;

  // We support routing from specific nodes. If a domain is selected as source/target,
  // we find any active node belonging to that domain as candidate.
  // To keep it clean, let's allow finding paths between any nodes in the subgraph.
  const adjacencyList: { [nodeId: string]: { targetId: string; edge: Relationship; cost: number }[] } = {};
  
  nodes.forEach((n) => {
    adjacencyList[n.id] = [];
  });

  edges.forEach((edge) => {
    const cost = getRelationCost(edge, weights);
    
    // Add directed edge
    if (adjacencyList[edge.source_entity_id]) {
      adjacencyList[edge.source_entity_id].push({
        targetId: edge.target_entity_id,
        edge,
        cost
      });
    }

    // Add back edge if bidirectional
    if (edge.directionality === Directionality.Bidirectional) {
      if (adjacencyList[edge.target_entity_id]) {
        adjacencyList[edge.target_entity_id].push({
          targetId: edge.source_entity_id,
          edge,
          cost
        });
      }
    }
  });

  // Dijkstra's Algorithm
  const distances: { [nodeId: string]: number } = {};
  const previous: { [nodeId: string]: { nodeId: string; edge: Relationship; cost: number } | null } = {};
  const pq = new PriorityQueue<string>();

  nodes.forEach((n) => {
    distances[n.id] = Infinity;
    previous[n.id] = null;
  });

  if (distances[sourceId] === undefined) {
    return null; // Source not in visible subgraph
  }

  distances[sourceId] = 0;
  pq.enqueue(sourceId, 0);

  while (!pq.isEmpty()) {
    const current = pq.dequeue();
    if (!current) break;
    const currentNodeId = current.val;

    if (currentNodeId === targetId) {
      // Reconstruct path
      const steps: PathStep[] = [];
      let tempId = targetId;

      while (tempId !== sourceId) {
        const prevInfo = previous[tempId];
        if (!prevInfo) break;

        const node = db.entities.find((e) => e.id === tempId)!;
        steps.unshift({
          nodeId: tempId,
          label: node.display_label,
          domainId: node.domain_id,
          edgeType: prevInfo.edge.relation_type,
          edgeCost: prevInfo.cost,
          confidence: prevInfo.edge.confidence,
          isHistorical: prevInfo.edge.persistence === PersistenceType.Historical,
          explanation: `${prevInfo.edge.relation_type} (${prevInfo.edge.path_role})`
        });

        tempId = prevInfo.nodeId;
      }

      // Add source node step at front
      const sourceNode = db.entities.find((e) => e.id === sourceId)!;
      steps.unshift({
        nodeId: sourceId,
        label: sourceNode.display_label,
        domainId: sourceNode.domain_id
      });

      // Recommended break points: nodes along path with highest traverse contribution or lowest sensitivity
      const recommendedBreakPoints = steps
        .filter((s, idx) => idx > 0 && idx < steps.length - 1) // exclude source & target
        .map((s) => s.nodeId);

      // Average confidence along path
      const edgeSteps = steps.filter((s) => s.edgeCost !== undefined);
      const avgConfidence = edgeSteps.length > 0 
        ? Math.round(edgeSteps.reduce((acc, curr) => acc + (curr.confidence || 3), 0) / edgeSteps.length)
        : 5;

      return {
        steps,
        totalCost: distances[targetId],
        hopCount: steps.length - 1,
        confidence: avgConfidence,
        recommendedBreakPoints
      };
    }

    if (distances[currentNodeId] === Infinity) {
      break;
    }

    const neighbors = adjacencyList[currentNodeId] || [];
    for (const neighbor of neighbors) {
      const alt = distances[currentNodeId] + neighbor.cost;
      if (alt < distances[neighbor.targetId]) {
        distances[neighbor.targetId] = alt;
        previous[neighbor.targetId] = {
          nodeId: currentNodeId,
          edge: neighbor.edge,
          cost: neighbor.cost
        };
        pq.enqueue(neighbor.targetId, alt);
      }
    }
  }

  return null; // Path not found
}

/**
 * Bridge Analysis: Calculates degree, betweenness centrality, and articulation points.
 */
export interface BridgeMetrics {
  nodeId: string;
  label: string;
  domainId: DomainId;
  degree: number;
  betweenness: number;
  isArticulationPoint: boolean;
  reachableProtectedCount: number;
}

export function performBridgeAnalysis(db: DecryptedDatabase): BridgeMetrics[] {
  const activeNodes = db.entities.filter((e) => e.status === RecordStatus.Active);
  const activeEdges = db.relationships.filter(
    (r) => r.status === RecordStatus.Active && r.persistence !== PersistenceType.Historical
  );

  const adjacency: { [id: string]: Set<string> } = {};
  activeNodes.forEach((n) => {
    adjacency[n.id] = new Set();
  });

  activeEdges.forEach((e) => {
    if (adjacency[e.source_entity_id] && adjacency[e.target_entity_id]) {
      adjacency[e.source_entity_id].add(e.target_entity_id);
      adjacency[e.target_entity_id].add(e.source_entity_id); // undirected projection for bridges
    }
  });

  // 1. Degree Centrality
  const degrees: { [id: string]: number } = {};
  activeNodes.forEach((n) => {
    degrees[n.id] = adjacency[n.id].size;
  });

  // 2. Betweenness Centrality (Brandes' algorithm helper for speed and correctness)
  const betweenness: { [id: string]: number } = {};
  activeNodes.forEach((n) => {
    betweenness[n.id] = 0;
  });

  activeNodes.forEach((s) => {
    const stack: string[] = [];
    const P: { [id: string]: string[] } = {};
    const sigma: { [id: string]: number } = {};
    const d: { [id: string]: number } = {};
    
    activeNodes.forEach((w) => {
      P[w.id] = [];
      sigma[w.id] = 0;
      d[w.id] = -1;
    });

    sigma[s.id] = 1;
    d[s.id] = 0;

    const queue: string[] = [s.id];

    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);

      adjacency[v].forEach((w) => {
        if (d[w] < 0) {
          queue.push(w);
          d[w] = d[v] + 1;
        }
        if (d[w] === d[v] + 1) {
          sigma[w] += sigma[v];
          P[w].push(v);
        }
      });
    }

    const delta: { [id: string]: number } = {};
    activeNodes.forEach((w) => {
      delta[w.id] = 0;
    });

    while (stack.length > 0) {
      const w = stack.pop()!;
      P[w].forEach((v) => {
        delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      });
      if (w !== s.id) {
        betweenness[w] += delta[w];
      }
    }
  });

  // Normalize betweenness
  const nNodes = activeNodes.length;
  const denom = (nNodes - 1) * (nNodes - 2);
  activeNodes.forEach((node) => {
    betweenness[node.id] = denom > 0 ? (betweenness[node.id] / denom) * 100 : 0;
  });

  // 3. Articulation Points using Tarjan's bridge-finding algorithm
  const isArticulation: { [id: string]: boolean } = {};
  const visited: { [id: string]: boolean } = {};
  const disc: { [id: string]: number } = {};
  const low: { [id: string]: number } = {};
  const parent: { [id: string]: string | null } = {};
  let time = 0;

  activeNodes.forEach((node) => {
    isArticulation[node.id] = false;
    visited[node.id] = false;
    parent[node.id] = null;
  });

  function dfsArticulation(u: string) {
    let children = 0;
    visited[u] = true;
    disc[u] = low[u] = ++time;

    adjacency[u].forEach((v) => {
      if (!visited[v]) {
        children++;
        parent[v] = u;
        dfsArticulation(v);

        low[u] = Math.min(low[u], low[v]);

        // Case 1: u is root of DFS tree and has two or more children
        if (parent[u] === null && children > 1) {
          isArticulation[u] = true;
        }
        // Case 2: u is not root and low value of one of its child is more than discovery value of u
        if (parent[u] !== null && low[v] >= disc[u]) {
          isArticulation[u] = true;
        }
      } else if (v !== parent[u]) {
        low[u] = Math.min(low[u], disc[v]);
      }
    });
  }

  activeNodes.forEach((node) => {
    if (!visited[node.id]) {
      dfsArticulation(node.id);
    }
  });

  // 4. Reachable protected nodes
  // Simple BFS per node to see how many protected=true nodes are reachable
  function getReachableProtected(startId: string): number {
    const q: string[] = [startId];
    const seen = new Set<string>([startId]);
    let count = 0;

    while (q.length > 0) {
      const curr = q.shift()!;
      const currNode = db.entities.find((e) => e.id === curr);
      if (currNode?.protected && curr !== startId) {
        count++;
      }

      adjacency[curr].forEach((n) => {
        if (!seen.has(n)) {
          seen.add(n);
          q.push(n);
        }
      });
    }
    return count;
  }

  return activeNodes.map((n) => ({
    nodeId: n.id,
    label: n.display_label,
    domainId: n.domain_id,
    degree: degrees[n.id] || 0,
    betweenness: Math.round(betweenness[n.id] * 10) / 10,
    isArticulationPoint: isArticulation[n.id] || false,
    reachableProtectedCount: getReachableProtected(n.id)
  })).sort((a, b) => b.betweenness - a.betweenness || b.degree - a.degree);
}

/**
 * Finds all active cross-domain relationships where intentional != true.
 */
export interface CrossDomainExposure {
  relationship: Relationship;
  sourceLabel: string;
  sourceDomain: DomainId;
  targetLabel: string;
  targetDomain: DomainId;
  riskScore: number;
}

export function performCrossDomainReport(db: DecryptedDatabase): CrossDomainExposure[] {
  const activeRels = db.relationships.filter(
    (r) => r.status === RecordStatus.Active && r.intentional !== true
  );

  const exposures: CrossDomainExposure[] = [];

  activeRels.forEach((rel) => {
    const sNode = db.entities.find((e) => e.id === rel.source_entity_id);
    const tNode = db.entities.find((e) => e.id === rel.target_entity_id);

    if (sNode && tNode && sNode.domain_id !== tNode.domain_id) {
      // Calculate a relative risk score based on proximity, confidence, and protection
      let risk = rel.confidence * 10;
      if (sNode.protected || tNode.protected) risk += 30;
      if (sNode.sensitivity > 7 || tNode.sensitivity > 7) risk += 20;
      if (rel.persistence === PersistenceType.Durable) risk += 10;

      exposures.push({
        relationship: rel,
        sourceLabel: sNode.display_label,
        sourceDomain: sNode.domain_id,
        targetLabel: tNode.display_label,
        targetDomain: tNode.domain_id,
        riskScore: risk
      });
    }
  });

  return exposures.sort((a, b) => b.riskScore - a.riskScore);
}

/**
 * Communication Triage: Calculates interaction, reciprocity, unknown-contact, and recency scores.
 */
export function triageCommunicationRollups(db: DecryptedDatabase): CommunicationRollup[] {
  const rollups = db.communication_rollups || [];
  
  return rollups.map((rollup) => {
    const calls = rollup.calls_in + rollup.calls_out;
    const sms = rollup.sms_in + rollup.sms_out;
    const mms = rollup.mms_in + rollup.mms_out;
    const duration = rollup.total_duration_seconds;
    const activeDays = rollup.distinct_active_days;

    // Log-normalized helper
    const logNorm = (val: number, maxExpected: number) => {
      if (val <= 0) return 0;
      return Math.min(100, Math.round((Math.log1p(val) / Math.log1p(maxExpected)) * 100));
    };

    // Formulate scores per spec:
    // 25% log-normalized total calls (max expected 200)
    const callScore = logNorm(calls, 200) * 0.25;
    // 25% log-normalized total SMS/MMS (max expected 500)
    const smsScore = logNorm(sms + mms, 500) * 0.25;
    // 20% log-normalized call duration (max expected 18000s / 5 hours)
    const durScore = logNorm(duration, 18000) * 0.20;
    // 15% distinct active days (max expected 30)
    const daysScore = logNorm(activeDays, 30) * 0.15;
    // 10% recency decay (based on days since last seen)
    const daysSinceLast = Math.max(0, (Date.now() - new Date(rollup.last_seen).getTime()) / (1000 * 60 * 60 * 24));
    const recencyDecay = Math.max(0, Math.round(100 * Math.exp(-daysSinceLast / 14))) * 0.10;
    // 5% reciprocity
    const inTotal = rollup.calls_in + rollup.sms_in + rollup.mms_in;
    const outTotal = rollup.calls_out + rollup.sms_out + rollup.mms_out;
    const total = inTotal + outTotal;
    const reciprocityRatio = total > 0 ? 1 - Math.abs(inTotal - outTotal) / total : 0;
    const reciprocityScore = Math.round(reciprocityRatio * 100) * 0.05;

    const interactionStrength = Math.round(callScore + smsScore + durScore + daysScore + recencyDecay + reciprocityScore);

    // Cross-domain score (if identifiers belong to entities in different domains)
    let crossDomainCount = 0;
    const sIdent = db.identifiers.find((i) => i.id === rollup.source_identifier_id);
    const pIdent = db.identifiers.find((i) => i.id === rollup.peer_identifier_id);
    if (sIdent && pIdent) {
      const sEnt = db.entities.find((e) => e.id === sIdent.entity_id);
      const pEnt = db.entities.find((e) => e.id === pIdent.entity_id);
      if (sEnt && pEnt && sEnt.domain_id !== pEnt.domain_id) {
        crossDomainCount = 1;
      }
    }

    return {
      ...rollup,
      interaction_strength_score: interactionStrength,
      reciprocity_score: Math.round(reciprocityRatio * 100),
      cross_domain_count: crossDomainCount
    };
  }).sort((a, b) => b.interaction_strength_score - a.interaction_strength_score);
}

/**
 * Automates finding updates and populates findings table.
 */
export function generateFindings(db: DecryptedDatabase): Finding[] {
  const findings: Finding[] = [];
  const now = new Date().toISOString();

  // 1. Cross-domain findings (intentional = false)
  const crossExposures = performCrossDomainReport(db);
  crossExposures.forEach((exp) => {
    let severity = Severity.Low;
    if (exp.riskScore > 50) severity = Severity.High;
    else if (exp.riskScore > 30) severity = Severity.Moderate;

    findings.push({
      id: `find-cd-${exp.relationship.id}`,
      finding_type: "cross_domain_exposure",
      source_entity_id: exp.relationship.source_entity_id,
      target_entity_id: exp.relationship.target_entity_id,
      severity,
      score: exp.riskScore,
      status: FindingStatus.Open,
      summary: `Active unapproved cross-domain connection between ${exp.sourceLabel} (${exp.sourceDomain}) and ${exp.targetLabel} (${exp.targetDomain}).`,
      created_at: now,
      updated_at: now
    });
  });

  // 2. High centrality bridge candidates
  const bridges = performBridgeAnalysis(db);
  bridges.filter((b) => b.betweenness > 15 || b.degree > 4).forEach((b) => {
    findings.push({
      id: `find-br-${b.nodeId}`,
      finding_type: "unapproved_bridge",
      source_entity_id: b.nodeId,
      target_entity_id: b.nodeId,
      severity: b.isArticulationPoint ? Severity.High : Severity.Moderate,
      score: Math.round(b.betweenness + b.degree * 5),
      status: FindingStatus.Open,
      summary: `Entity "${b.label}" serves as a highly central network bridge. It can expose ${b.reachableProtectedCount} protected nodes.`,
      created_at: now,
      updated_at: now
    });
  });

  // 3. Shortest Bad Paths for critical Observers
  const observers = db.entities.filter((e) => e.entity_type === EntityType.Observer || e.domain_id === DomainId.OBSERVER);
  const protectedNodes = db.entities.filter((e) => e.protected === true);

  observers.forEach((obs) => {
    protectedNodes.forEach((prot) => {
      // Find paths from observer to protected node
      const path = findShortestBadPath(db, obs.id, obs.id, prot.id, {
        timeWindow: "current",
        confidenceThreshold: 1
      });

      if (path && path.totalCost < 15) {
        let severity = Severity.Critical;
        if (path.totalCost > 8) severity = Severity.High;
        else if (path.totalCost > 4) severity = Severity.Moderate;

        findings.push({
          id: `find-path-${obs.id}-${prot.id}`,
          finding_type: "shortest_bad_path",
          observer_entity_id: obs.id,
          source_entity_id: obs.id,
          target_entity_id: prot.id,
          path_json_encrypted: btoa(JSON.stringify(path.steps)), // encoded for detail retrieval
          severity,
          score: Math.round((15 - path.totalCost) * 6.5),
          status: FindingStatus.Open,
          summary: `Reachable exposure path from Observer "${obs.display_label}" to Protected node "${prot.display_label}" (Traverse cost: ${path.totalCost}, Hops: ${path.hopCount}).`,
          created_at: now,
          updated_at: now
        });
      }
    });
  });

  return findings;
}
