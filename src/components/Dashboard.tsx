/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ShieldAlert,
  Users,
  GitCommit,
  ArrowUpRight,
  Eye,
  AlertTriangle,
  History,
  CheckCircle,
  HelpCircle,
  Briefcase
} from "lucide-react";
import { DecryptedDatabase, DomainId, EntityType, RecordStatus, Severity, FindingStatus } from "../types";
import { performBridgeAnalysis, performCrossDomainReport } from "../utils/analysis";

interface DashboardProps {
  db: DecryptedDatabase;
  setActiveTab: (tab: string) => void;
  setSelectedNodeId?: (id: string | null) => void;
}

export default function Dashboard({ db, setActiveTab }: DashboardProps) {
  // Statistics and calculations
  const activeEntities = db.entities.filter((e) => e.status === RecordStatus.Active);
  const activeRelationships = db.relationships.filter((r) => r.status === RecordStatus.Active);
  const protectedNodes = activeEntities.filter((e) => e.protected);
  
  // Findings breakdown
  const openFindings = db.findings.filter((f) => f.status === FindingStatus.Open);
  const criticalFindings = openFindings.filter((f) => f.severity === Severity.Critical);
  const highFindings = openFindings.filter((f) => f.severity === Severity.High);
  const moderateFindings = openFindings.filter((f) => f.severity === Severity.Moderate);
  const lowFindings = openFindings.filter((f) => f.severity === Severity.Low);

  // Bridges
  const bridges = performBridgeAnalysis(db).slice(0, 3);

  // Cross-domain edges (unapproved)
  const crossDomainExposures = performCrossDomainReport(db).slice(0, 3);

  // Unknown communication numbers/emails
  const unknownIdentifiers = db.identifiers.filter((i) => {
    const parentEntity = db.entities.find((e) => e.id === i.entity_id);
    return parentEntity?.domain_id === DomainId.UNKNOWN;
  });

  // Recent imports
  const recentImports = (db.import_batches || []).slice(-3).reverse();

  // Remediation Reviews
  const pendingActions = db.remediation_actions.filter((a) => !a.completed_at).slice(0, 3);

  return (
    <div id="dashboard-page" className="flex-1 overflow-y-auto p-8 bg-slate-900 text-slate-100 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header banner */}
        <div className="flex justify-between items-center pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white font-sans">LinkGraph Analysis</h1>
            <p className="text-sm text-slate-400 mt-1">
              Active Network Analysis: Compartments, Observers, and Relationship Inferences.
            </p>
          </div>
          <div className="flex items-center gap-4 bg-slate-950 px-4 py-2 border border-slate-800 rounded-xl text-xs font-mono">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Local-First Secure
            </span>
            <span className="text-slate-600">|</span>
            <span>{activeEntities.length} Entities</span>
            <span className="text-slate-600">|</span>
            <span>{activeRelationships.length} Relationships</span>
          </div>
        </div>

        {/* Overview Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Findings Status Card */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-2xl -mr-6 -mt-6" />
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">Open Threats</span>
                <span className="text-4xl font-extrabold text-white mt-2 block">{openFindings.length}</span>
              </div>
              <div className="p-3 bg-red-950/40 border border-red-900/30 rounded-xl">
                <ShieldAlert className="w-5 h-5 text-red-400" />
              </div>
            </div>
            <div className="mt-4 flex gap-2 text-xs font-mono">
              <span className="px-1.5 py-0.5 bg-red-950 border border-red-900 text-red-400 rounded">
                {criticalFindings.length} Crit
              </span>
              <span className="px-1.5 py-0.5 bg-orange-950 border border-orange-900 text-orange-400 rounded">
                {highFindings.length} High
              </span>
              <span className="px-1.5 py-0.5 bg-yellow-950 border border-yellow-900 text-yellow-400 rounded">
                {moderateFindings.length} Mod
              </span>
            </div>
          </div>

          {/* Protected Exposure Card */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl -mr-6 -mt-6" />
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">Protected Targets</span>
                <span className="text-4xl font-extrabold text-white mt-2 block">{protectedNodes.length}</span>
              </div>
              <div className="p-3 bg-cyan-950/40 border border-cyan-900/30 rounded-xl">
                <Users className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-400">
              Active protection status applied to sensitive identities.
            </p>
          </div>

          {/* Unknown Identifiers Card */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full blur-2xl -mr-6 -mt-6" />
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">Unknown Contacts</span>
                <span className="text-4xl font-extrabold text-white mt-2 block">{unknownIdentifiers.length}</span>
              </div>
              <div className="p-3 bg-orange-950/40 border border-orange-900/30 rounded-xl">
                <HelpCircle className="w-5 h-5 text-orange-400" />
              </div>
            </div>
            <button
              id="goto-classify-btn"
              onClick={() => setActiveTab("communications")}
              className="mt-4 flex items-center justify-between text-xs text-orange-400 font-semibold hover:text-orange-300 transition-colors group"
            >
              Classify newly imported numbers
              <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>

          {/* Cross Domain Card */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-full blur-2xl -mr-6 -mt-6" />
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">Cross-Domain Risk</span>
                <span className="text-4xl font-extrabold text-white mt-2 block">{crossDomainExposures.length}</span>
              </div>
              <div className="p-3 bg-violet-950/40 border border-violet-900/30 rounded-xl">
                <GitCommit className="w-5 h-5 text-violet-400" />
              </div>
            </div>
            <button
              id="goto-relations-btn"
              onClick={() => setActiveTab("relationships")}
              className="mt-4 flex items-center justify-between text-xs text-violet-400 font-semibold hover:text-violet-300 transition-colors group"
            >
              Review active bridges
              <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>
        </div>

        {/* Bento Grid Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Column 1 & 2 - Core Network Risk & Analysis */}
          <div className="lg:col-span-2 space-y-8">
            {/* Top Findings by Severity */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-500" />
                  Active Threat Vectors & Path Exposures
                </h2>
                <button
                  id="dashboard-view-findings-btn"
                  onClick={() => setActiveTab("findings")}
                  className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  View All Findings
                </button>
              </div>

              {openFindings.length === 0 ? (
                <div className="text-center py-12 bg-slate-900/40 border border-dashed border-slate-800 rounded-xl text-slate-500 text-sm">
                  <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  No open exposure findings. Compartments are isolated successfully.
                </div>
              ) : (
                <div className="space-y-4">
                  {openFindings.slice(0, 4).map((f) => (
                    <div
                      key={f.id}
                      className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl flex items-start gap-4 hover:border-slate-700 transition-all cursor-pointer"
                      onClick={() => setActiveTab("findings")}
                    >
                      <span className={`px-2.5 py-1 text-2xs uppercase tracking-wider font-bold rounded-lg ${
                        f.severity === Severity.Critical ? "bg-red-950 border border-red-900 text-red-400" :
                        f.severity === Severity.High ? "bg-orange-950 border border-orange-900 text-orange-400" :
                        "bg-yellow-950 border border-yellow-900 text-yellow-400"
                      }`}>
                        {f.severity}
                      </span>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-semibold text-slate-200">{f.summary}</p>
                        <p className="text-xs text-slate-500 font-mono">ID: {f.id} | Score: {f.score}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cross Domain Bridges */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <GitCommit className="w-5 h-5 text-violet-400" />
                Unapproved Cross-Domain Compartment Leaks
              </h2>

              {crossDomainExposures.length === 0 ? (
                <div className="text-center py-12 bg-slate-900/40 border border-dashed border-slate-800 rounded-xl text-slate-500 text-sm">
                  No unapproved cross-domain linkages found. Excellent compartment hygiene.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {crossDomainExposures.map((exp) => (
                    <div
                      key={exp.relationship.id}
                      className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl flex flex-col justify-between hover:border-slate-700 transition-all"
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs font-mono text-slate-500 mb-3">
                          <span>Traverse Cost: 3</span>
                          <span className="text-red-400 font-bold uppercase tracking-wide">Risk: {exp.riskScore}</span>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-slate-300">{exp.sourceLabel}</p>
                          <p className="text-xs text-indigo-400 font-mono">── {exp.relationship.relation_type} ──</p>
                          <p className="text-sm font-bold text-slate-300">{exp.targetLabel}</p>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-800/60 flex justify-between items-center text-2xs text-slate-500 font-mono">
                        <span>{exp.sourceDomain}</span>
                        <span>→</span>
                        <span>{exp.targetDomain}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Column 3 - High Leverage Bridges & Metadata Imports */}
          <div className="space-y-8">
            {/* High leverage bridges */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                High-Leverage Bridge Candidates
              </h2>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                High betweenness nodes that serve as core network pathways. Neutralizing these weakens exposure.
              </p>

              <div className="space-y-4">
                {bridges.map((b) => (
                  <div key={b.nodeId} className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-200">{b.label}</span>
                      {b.isArticulationPoint && (
                        <span className="text-2xs bg-red-950 text-red-400 border border-red-900 px-1.5 py-0.5 rounded font-mono uppercase tracking-wide font-bold">
                          Articulation Point
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                      <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/50">
                        <span className="text-2xs text-slate-500 block uppercase font-semibold">Betweenness</span>
                        <span className="text-sm font-extrabold text-cyan-400 mt-1 block">{b.betweenness}%</span>
                      </div>
                      <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/50">
                        <span className="text-2xs text-slate-500 block uppercase font-semibold">Connections</span>
                        <span className="text-sm font-extrabold text-indigo-400 mt-1 block">{b.degree}</span>
                      </div>
                      <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/50">
                        <span className="text-2xs text-slate-500 block uppercase font-semibold">Targets Exposed</span>
                        <span className="text-sm font-extrabold text-orange-400 mt-1 block">{b.reachableProtectedCount}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Upcoming Remediation Reviews */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-500" />
                Pending Remediations
              </h2>

              {pendingActions.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">
                  No outstanding remediation actions assigned.
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingActions.map((act) => (
                    <div key={act.id} className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs flex justify-between items-center">
                      <div>
                        <span className="font-bold text-slate-200 block">{act.description}</span>
                        <span className="text-slate-500 font-mono block mt-1">Due: {act.due_date} | Owner: {act.owner}</span>
                      </div>
                      <span className="px-2 py-0.5 bg-indigo-950 border border-indigo-900 text-indigo-400 rounded-lg capitalize font-mono text-2xs">
                        {act.action_type}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent metadata imports */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <History className="w-5 h-5 text-slate-400" />
                Recent Metadata Batches
              </h2>

              {recentImports.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">
                  No imported batches. Upload carrier logs in Communications.
                </div>
              ) : (
                <div className="space-y-3">
                  {recentImports.map((bat) => (
                    <div key={bat.id} className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs flex justify-between items-center">
                      <div>
                        <span className="font-bold text-slate-200 block">{bat.source_label}</span>
                        <span className="text-slate-500 block font-mono mt-1">{bat.record_count} events | {bat.parser_version}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-lg border text-2xs uppercase font-mono ${
                        bat.status === "success"
                          ? "bg-emerald-950 border-emerald-900 text-emerald-400"
                          : "bg-red-950 border-red-900 text-red-400"
                      }`}>
                        {bat.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
