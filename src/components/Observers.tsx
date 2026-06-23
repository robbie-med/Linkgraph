/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  Eye,
  Plus,
  Trash2,
  Database,
  ArrowRight,
  ShieldAlert,
  Compass,
  AlertTriangle,
  FolderOpen,
  Info,
  CheckCircle,
  X,
  Play
} from "lucide-react";
import {
  DecryptedDatabase,
  Entity,
  EntityType,
  DomainId,
  RecordStatus,
  Dataset,
  Relationship,
  RelationType,
  PathRole,
  PersistenceType,
  Directionality,
  ActionType
} from "../types";
import { logAuditEvent } from "../utils/database";
import { buildObserverSubgraph, findShortestBadPath } from "../utils/analysis";

interface ObserversProps {
  db: DecryptedDatabase;
  masterKey: CryptoKey | null;
  onUpdateDb: (updatedDb: DecryptedDatabase) => void;
  setActiveTab: (tab: string) => void;
}

export default function Observers({ db, masterKey, onUpdateDb, setActiveTab }: ObserversProps) {
  const [selectedObserverId, setSelectedObserverId] = useState<string>("");
  const [isDatasetModalOpen, setIsDatasetModalOpen] = useState(false);

  // New Dataset Form States
  const [datasetType, setDatasetType] = useState("Carrier CDR");
  const [sourceSystem, setSourceSystem] = useState("");
  const [retentionClass, setRetentionClass] = useState("Statutory 5-years");
  const [containsSensitive, setContainsSensitive] = useState(true);
  const [recordCount, setRecordCount] = useState(100);

  // Observer reachability results
  const [exposurePaths, setExposurePaths] = useState<any[]>([]);
  const [hasRunAnalysis, setHasRunAnalysis] = useState(false);

  const observersList = db.entities.filter(
    (e) => e.status === RecordStatus.Active && (e.entity_type === EntityType.Observer || e.domain_id === DomainId.OBSERVER)
  );

  const handleCreateDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedObserverId || !sourceSystem) return;

    const now = new Date().toISOString();
    const datasetId = `ds-${Math.random().toString(36).substr(2, 9)}`;

    const newDataset: Dataset = {
      id: datasetId,
      entity_id: selectedObserverId, // Owned by selected observer
      dataset_type: datasetType,
      source_system: sourceSystem,
      retention_class: retentionClass,
      contains_sensitive_metadata: containsSensitive,
      record_count: recordCount,
      created_at: now,
      updated_at: now
    };

    // Also establish the explicit retention/access relationship edge!
    const relId = `r-ds-${Math.random().toString(36).substr(2, 9)}`;
    const newRel: Relationship = {
      id: relId,
      source_entity_id: selectedObserverId,
      target_entity_id: datasetId,
      relation_type: RelationType.retains,
      directionality: Directionality.Directed,
      path_role: PathRole.Access,
      confidence: 5,
      intentional: true,
      decision: ActionType.Keep,
      persistence: PersistenceType.Durable,
      evidence_strength: 5,
      created_at: now,
      updated_at: now,
      created_by: "local_user",
      status: RecordStatus.Active
    };

    const updatedDatasets = [...db.datasets, newDataset];
    const updatedRelationships = [...db.relationships, newRel];

    const updatedDb = {
      ...db,
      datasets: updatedDatasets,
      relationships: updatedRelationships
    };

    await logAuditEvent(updatedDb, "create", "dataset", datasetId, null, newDataset, masterKey || undefined);
    await logAuditEvent(updatedDb, "create", "relationship", relId, null, newRel, masterKey || undefined);

    onUpdateDb(updatedDb);
    setIsDatasetModalOpen(false);
    setSourceSystem("");
    // Re-run exposure if an observer is active
    if (selectedObserverId) {
      handleRunExposureAnalysis(selectedObserverId);
    }
  };

  const handleRunExposureAnalysis = (obsId: string) => {
    if (!obsId) return;

    // Run Dijkstra path calculations from the observer node to every protected node in the system
    const protectedTargets = db.entities.filter((e) => e.protected && e.status === RecordStatus.Active);
    const pathsFound: any[] = [];

    protectedTargets.forEach((target) => {
      const pathResult = findShortestBadPath(db, obsId, obsId, target.id, {
        timeWindow: "current",
        confidenceThreshold: 1
      });

      if (pathResult) {
        pathsFound.push({
          target,
          path: pathResult
        });
      }
    });

    setExposurePaths(pathsFound);
    setHasRunAnalysis(true);
  };

  const handleSelectObserver = (obsId: string) => {
    setSelectedObserverId(obsId);
    setHasRunAnalysis(false);
    setExposurePaths([]);
    if (obsId) {
      handleRunExposureAnalysis(obsId);
    }
  };

  const handleDeleteDataset = async (dsId: string) => {
    const confirm = window.confirm("Are you sure you want to delete this dataset? This will also sever observer access edges.");
    if (!confirm) return;

    const ds = db.datasets.find((d) => d.id === dsId);
    const updatedDatasets = db.datasets.filter((d) => d.id !== dsId);
    const updatedRelationships = db.relationships.filter(
      (r) => !(r.source_entity_id === selectedObserverId && r.target_entity_id === dsId)
    );

    const updatedDb = {
      ...db,
      datasets: updatedDatasets,
      relationships: updatedRelationships
    };

    await logAuditEvent(updatedDb, "delete", "dataset", dsId, ds, null, masterKey || undefined);
    onUpdateDb(updatedDb);
    if (selectedObserverId) {
      handleRunExposureAnalysis(selectedObserverId);
    }
  };

  return (
    <div id="observers-page" className="flex-1 overflow-y-auto p-8 bg-slate-900 text-slate-100 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Page Header */}
        <div className="flex justify-between items-center pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <Eye className="w-8 h-8 text-cyan-400" />
              Observer Knowledge Graph
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Analyze what entities (AT&T, Google, Employers, Data Brokers) can access, query, or infer from datasets legitimately available to them.
            </p>
          </div>
          <button
            id="goto-create-observer-btn"
            onClick={() => setActiveTab("entities")}
            className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold uppercase tracking-wider text-slate-300 hover:text-white hover:bg-slate-900 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4 text-cyan-400" />
            Create Observer Node
          </button>
        </div>

        {/* Double column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Selector and Reachability Analysis */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-base font-bold text-white mb-4">Select Observer Perspective</h2>
              <div className="flex gap-4 mb-6">
                <select
                  id="observer-select"
                  value={selectedObserverId}
                  onChange={(e) => handleSelectObserver(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500 text-slate-200 text-sm"
                >
                  <option value="">Choose an active observer...</option>
                  {observersList.map((obs) => (
                    <option key={obs.id} value={obs.id}>{obs.display_label}</option>
                  ))}
                </select>
                <button
                  id="run-observer-analysis-btn"
                  onClick={() => handleRunExposureAnalysis(selectedObserverId)}
                  disabled={!selectedObserverId}
                  className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-2 shrink-0"
                >
                  <Play className="w-4 h-4" />
                  Analyze Reachability
                </button>
              </div>

              {/* Analysis outputs */}
              {hasRunAnalysis && (
                <div className="space-y-6 pt-6 border-t border-slate-900">
                  <h3 className="text-sm font-bold text-slate-300">Reachable Targets & Exploitation Paths ({exposurePaths.length})</h3>
                  
                  {exposurePaths.length === 0 ? (
                    <div className="p-8 bg-slate-900/40 border border-dashed border-slate-800 rounded-xl text-slate-500 text-sm text-center">
                      <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                      Zero exposure. This observer cannot query, retain, or infer any of your protected core entities!
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {exposurePaths.map(({ target, path }) => (
                        <div key={target.id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-slate-200 text-sm">{target.display_label}</span>
                            <span className="text-2xs font-mono bg-red-950 text-red-400 border border-red-900 px-2 py-0.5 rounded-full uppercase font-bold">
                              Cost: {path.totalCost}
                            </span>
                          </div>

                          {/* Render the hops step-by-step */}
                          <div className="flex flex-wrap items-center gap-2 font-mono text-2xs text-slate-400 pt-2 border-t border-slate-800/50">
                            {path.steps.map((step: any, sIdx: number) => (
                              <React.Fragment key={step.nodeId}>
                                {sIdx > 0 && <span className="text-slate-600">→</span>}
                                <div className="px-2 py-1 bg-slate-950 border border-slate-800 rounded flex flex-col items-center">
                                  <span className="font-bold text-slate-300">{step.label}</span>
                                  {step.edgeType && (
                                    <span className="text-indigo-400 text-3xs mt-0.5">{step.edgeType}</span>
                                  )}
                                </div>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Datasets Accessible by selected observer */}
          <div className="space-y-6">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Database className="w-5 h-5 text-indigo-400" />
                  Accessible Datasets
                </h3>
                {selectedObserverId && (
                  <button
                    id="add-dataset-btn"
                    onClick={() => setIsDatasetModalOpen(true)}
                    className="p-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-cyan-400 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Datasets (Billing records, Call Detail Records (CDR), Contacts) are primary avenues of observer access.
              </p>

              {!selectedObserverId ? (
                <div className="text-center py-8 text-slate-600 text-xs font-mono italic">
                  Select an observer to view their accessible datasets.
                </div>
              ) : (
                <div className="space-y-4">
                  {db.datasets.filter((ds) => ds.entity_id === selectedObserverId).length === 0 ? (
                    <div className="text-center py-6 text-slate-600 text-xs">No datasets cataloged for this observer.</div>
                  ) : (
                    db.datasets.filter((ds) => ds.entity_id === selectedObserverId).map((ds) => (
                      <div key={ds.id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl relative hover:border-slate-700 transition-colors">
                        <button
                          id={`delete-ds-${ds.id}`}
                          onClick={() => handleDeleteDataset(ds.id)}
                          className="absolute top-4 right-4 text-slate-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-2xs font-bold font-mono text-cyan-400 uppercase tracking-wide block mb-1">
                          {ds.dataset_type}
                        </span>
                        <h4 className="text-sm font-bold text-slate-200 mb-2">{ds.source_system}</h4>
                        <div className="space-y-1 font-mono text-3xs text-slate-500">
                          <p>Retention: {ds.retention_class}</p>
                          <p>Record Count: {ds.record_count}</p>
                          <p>Sensitive Metadata: {ds.contains_sensitive_metadata ? "YES" : "NO"}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Create Dataset Modal */}
        {isDatasetModalOpen && (
          <div id="dataset-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-8 shadow-2xl relative">
              <button
                id="close-dataset-modal"
                onClick={() => setIsDatasetModalOpen(false)}
                className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-400" />
                Add Observer Dataset
              </h2>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Record a collection of communications, subscriptions, billing trails, or logs managed by this observer.
              </p>

              <form onSubmit={handleCreateDataset} className="space-y-5 text-sm">
                <div>
                  <label htmlFor="ds-type" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Dataset Type
                  </label>
                  <select
                    id="ds-type"
                    value={datasetType}
                    onChange={(e) => setDatasetType(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500 text-slate-200 text-xs font-mono"
                  >
                    <option value="Carrier CDR (Call Detail Records)">Carrier CDR</option>
                    <option value="Billing Profiles">Billing profile billing database</option>
                    <option value="Subscriber Identity Records">Subscriber registrations</option>
                    <option value="Harvested Ad-ID / Marketing Data">Marketing harvested data</option>
                    <option value="Public Registrar Records">Public professional register</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="ds-source" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Source System / Registry Name
                  </label>
                  <input
                    id="ds-source"
                    type="text"
                    required
                    placeholder="e.g. AT&T Billing Logs Database, State Register..."
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500 text-slate-200 placeholder-slate-600"
                    value={sourceSystem}
                    onChange={(e) => setSourceSystem(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="ds-retention" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Retention Period
                    </label>
                    <input
                      id="ds-retention"
                      type="text"
                      placeholder="e.g. 7-years statutory"
                      className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none text-slate-200 text-xs"
                      value={retentionClass}
                      onChange={(e) => setRetentionClass(e.target.value)}
                    />
                  </div>

                  <div>
                    <label htmlFor="ds-count" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Record Count Estimate
                    </label>
                    <input
                      id="ds-count"
                      type="number"
                      className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none text-slate-200 text-xs"
                      value={recordCount}
                      onChange={(e) => setRecordCount(parseInt(e.target.value) || 100)}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    id="ds-sensitive-check"
                    type="checkbox"
                    className="w-4 h-4 bg-slate-950 border-slate-800 rounded text-cyan-500 focus:ring-cyan-500"
                    checked={containsSensitive}
                    onChange={(e) => setContainsSensitive(e.target.checked)}
                  />
                  <label htmlFor="ds-sensitive-check" className="text-xs font-semibold text-slate-300">
                    Contains highly sensitive metadata details
                  </label>
                </div>

                <button
                  id="save-dataset-btn"
                  type="submit"
                  className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold uppercase tracking-wider text-xs rounded-xl transition-colors"
                >
                  Record Dataset
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
