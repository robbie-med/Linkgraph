/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  GitCommit,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  Tag,
  Calendar,
  X,
  FileCheck,
  AlertTriangle,
  FileText
} from "lucide-react";
import {
  DecryptedDatabase,
  Relationship,
  RelationType,
  Directionality,
  PathRole,
  PersistenceType,
  ActionType,
  RecordStatus,
  DomainId
} from "../types";
import { logAuditEvent, DEFAULT_DOMAINS } from "../utils/database";

interface RelationshipsProps {
  db: DecryptedDatabase;
  masterKey: CryptoKey | null;
  onUpdateDb: (updatedDb: DecryptedDatabase) => void;
}

export default function Relationships({ db, masterKey, onUpdateDb }: RelationshipsProps) {
  const [relationships, setRelationships] = useState<Relationship[]>(db.relationships);

  // Form toggles
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRel, setEditingRel] = useState<Relationship | null>(null);

  // Form field states
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [relationType, setRelationType] = useState<RelationType>(RelationType.uses);
  const [directionality, setDirectionality] = useState<Directionality>(Directionality.Directed);
  const [pathRole, setPathRole] = useState<PathRole>(PathRole.Association);
  const [confidence, setConfidence] = useState(3);
  const [evidenceStrength, setEvidenceStrength] = useState(3);
  const [persistence, setPersistence] = useState<PersistenceType>(PersistenceType.Current);
  const [isIntentional, setIsIntentional] = useState(true);
  const [decision, setDecision] = useState<ActionType | "undecided">("undecided");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");

  const handleSaveRelationship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceId || !targetId) return;

    const now = new Date().toISOString();
    let updatedList = [...relationships];
    let auditAction = "create";
    let targetRelId = editingRel ? editingRel.id : `r-${Math.random().toString(36).substr(2, 9)}`;
    let beforeState = editingRel ? { ...editingRel } : null;

    const newRel: Relationship = {
      id: targetRelId,
      source_entity_id: sourceId,
      target_entity_id: targetId,
      relation_type: relationType,
      directionality,
      path_role: pathRole,
      confidence,
      intentional: isIntentional,
      decision,
      base_traversal_cost: cost ? parseFloat(cost) : undefined,
      persistence,
      evidence_strength: evidenceStrength,
      notes_encrypted: notes,
      created_at: editingRel ? editingRel.created_at : now,
      updated_at: now,
      created_by: "local_user",
      status: RecordStatus.Active
    };

    if (editingRel) {
      updatedList = updatedList.map((r) => (r.id === editingRel.id ? newRel : r));
      auditAction = "update";
    } else {
      updatedList.push(newRel);
    }

    const updatedDb = { ...db, relationships: updatedList };
    await logAuditEvent(updatedDb, auditAction, "relationship", targetRelId, beforeState, newRel, masterKey || undefined);

    setRelationships(updatedList);
    onUpdateDb(updatedDb);
    resetForm();
  };

  const resetForm = () => {
    setEditingRel(null);
    setSourceId("");
    setTargetId("");
    setRelationType(RelationType.uses);
    setDirectionality(Directionality.Directed);
    setPathRole(PathRole.Association);
    setConfidence(3);
    setEvidenceStrength(3);
    setPersistence(PersistenceType.Current);
    setIsIntentional(true);
    setDecision("undecided");
    setCost("");
    setNotes("");
    setIsFormOpen(false);
  };

  const handleEditClick = (rel: Relationship) => {
    setEditingRel(rel);
    setSourceId(rel.source_entity_id);
    setTargetId(rel.target_entity_id);
    setRelationType(rel.relation_type);
    setDirectionality(rel.directionality);
    setPathRole(rel.path_role);
    setConfidence(rel.confidence);
    setEvidenceStrength(rel.evidence_strength);
    setPersistence(rel.persistence);
    setIsIntentional(rel.intentional);
    setDecision(rel.decision);
    setCost(rel.base_traversal_cost ? rel.base_traversal_cost.toString() : "");
    setNotes(rel.notes_encrypted || "");
    setIsFormOpen(true);
  };

  const handleDeleteRelationship = async (relId: string) => {
    const rel = relationships.find((r) => r.id === relId);
    if (!rel) return;

    const confirm = window.confirm("Are you sure you want to remove this relationship link?");
    if (!confirm) return;

    const updatedList = relationships.filter((r) => r.id !== relId);
    const updatedDb = { ...db, relationships: updatedList };
    await logAuditEvent(updatedDb, "delete", "relationship", relId, rel, null, masterKey || undefined);

    setRelationships(updatedList);
    onUpdateDb(updatedDb);
  };

  // Bulk mitigation decisions for cross-domain leaks
  const handleBulkSetDecision = async (relId: string, bulkDecision: ActionType) => {
    const rel = relationships.find((r) => r.id === relId);
    if (!rel) return;

    const beforeState = { ...rel };
    const updatedRel: Relationship = {
      ...rel,
      decision: bulkDecision,
      intentional: bulkDecision === ActionType.Keep, // If keep, we mark as approved/intentional
      updated_at: new Date().toISOString()
    };

    const updatedList = relationships.map((r) => (r.id === relId ? updatedRel : r));
    const updatedDb = { ...db, relationships: updatedList };
    await logAuditEvent(updatedDb, "update", "relationship", relId, beforeState, updatedRel, masterKey || undefined);

    setRelationships(updatedList);
    onUpdateDb(updatedDb);
  };

  // Helper labels
  const getEntityLabel = (id: string) => {
    const ent = db.entities.find((e) => e.id === id);
    return ent ? `${ent.display_label} (${ent.entity_type})` : id;
  };

  const getDomainLabel = (id: DomainId) => {
    const def = DEFAULT_DOMAINS.find((d) => d.id === id);
    return def ? def.label : id;
  };

  // Cross-domain leak list (intentional != true, where source & target belong to different domains)
  const crossDomainLeaks = relationships.filter((rel) => {
    if (rel.status !== RecordStatus.Active || rel.intentional === true) return false;
    const s = db.entities.find((e) => e.id === rel.source_entity_id);
    const t = db.entities.find((e) => e.id === rel.target_entity_id);
    return s && t && s.domain_id !== t.domain_id;
  });

  return (
    <div id="relationships-page" className="flex-1 overflow-y-auto p-8 bg-slate-900 text-slate-100 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Page Header */}
        <div className="flex justify-between items-center pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <GitCommit className="w-8 h-8 text-cyan-400" />
              Graph Relationships
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Construct logical associations, direct access permissions, behavioral patterns, and recovery links.
            </p>
          </div>
          <button
            id="open-create-relation-btn"
            onClick={() => setIsFormOpen(true)}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-xl text-xs font-semibold uppercase tracking-wider text-white transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Relationship
          </button>
        </div>

        {/* Double column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main List of relations */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-lg font-bold text-white mb-4">Active Relationships Projection ({relationships.length})</h2>
            
            <div className="space-y-4">
              {relationships.map((rel) => {
                const sNode = db.entities.find((e) => e.id === rel.source_entity_id);
                const tNode = db.entities.find((e) => e.id === rel.target_entity_id);
                const isLeak = sNode && tNode && sNode.domain_id !== tNode.domain_id && !rel.intentional;

                return (
                  <div
                    id={`relationship-card-${rel.id}`}
                    key={rel.id}
                    className={`p-5 bg-slate-950 border rounded-2xl flex flex-col justify-between hover:border-slate-700 transition-all ${
                      isLeak ? "border-red-900/50 bg-red-950/5" : "border-slate-800/80"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        {/* Source → Relation → Target */}
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-slate-200">{sNode?.display_label || rel.source_entity_id}</span>
                          <ArrowRight className="w-4 h-4 text-cyan-400" />
                          <span className="text-sm font-bold text-slate-200">{tNode?.display_label || rel.target_entity_id}</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-2xs font-mono">
                          <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-cyan-400 capitalize">
                            Type: {rel.relation_type}
                          </span>
                          <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-indigo-400 capitalize">
                            Role: {rel.path_role}
                          </span>
                          <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-slate-400">
                            Confidence: {rel.confidence}/5
                          </span>
                          <span className={`px-2 py-0.5 border rounded uppercase ${
                            rel.intentional ? "bg-emerald-950 border-emerald-900 text-emerald-400" : "bg-red-950 border-red-900 text-red-400"
                          }`}>
                            {rel.intentional ? "Intentional" : "Unintentional"}
                          </span>
                          <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-yellow-400 capitalize">
                            Decision: {rel.decision}
                          </span>
                        </div>
                      </div>

                      {/* Edit/delete actions */}
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          id={`edit-rel-${rel.id}`}
                          onClick={() => handleEditClick(rel)}
                          className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          id={`delete-rel-${rel.id}`}
                          onClick={() => handleDeleteRelationship(rel.id)}
                          className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isLeak && (
                      <div className="mt-4 p-3 bg-red-950/20 border border-red-900/30 rounded-xl text-xs text-red-300 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-mono text-2xs">
                          <AlertTriangle className="w-4 h-4 text-red-400" />
                          Compartment Leak: {getDomainLabel(sNode!.domain_id)} ── {getDomainLabel(tNode!.domain_id)}
                        </span>
                        <div className="flex gap-2">
                          <button
                            id={`bulk-keep-${rel.id}`}
                            onClick={() => handleBulkSetDecision(rel.id, ActionType.Keep)}
                            className="px-2.5 py-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-400 rounded text-3xs font-bold uppercase tracking-wide transition-all"
                          >
                            Mark Approved (Keep)
                          </button>
                          <button
                            id={`bulk-weaken-${rel.id}`}
                            onClick={() => handleBulkSetDecision(rel.id, ActionType.Weaken)}
                            className="px-2.5 py-1 bg-yellow-950 hover:bg-yellow-900 border border-yellow-800 text-yellow-400 rounded text-3xs font-bold uppercase tracking-wide transition-all"
                          >
                            Weaken Link
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Side Bulk mitigation list */}
          <div className="space-y-6">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
                Unresolved Cross-Compartment Leaks ({crossDomainLeaks.length})
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Active edges that link different isolated domains without explicit approval. Mitigate them below.
              </p>

              {crossDomainLeaks.length === 0 ? (
                <div className="text-center py-8 bg-slate-900/40 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
                  All cross-compartment relationships are verified or intentional. Great work!
                </div>
              ) : (
                <div className="space-y-4">
                  {crossDomainLeaks.map((leak) => {
                    const s = db.entities.find((e) => e.id === leak.source_entity_id)!;
                    const t = db.entities.find((e) => e.id === leak.target_entity_id)!;
                    return (
                      <div key={leak.id} className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-200">{s.display_label}</span>
                          <span className="text-slate-500 font-mono">→</span>
                          <span className="font-bold text-slate-200">{t.display_label}</span>
                        </div>
                        <div className="flex items-center justify-between text-3xs text-slate-400 font-mono">
                          <span>{getDomainLabel(s.domain_id)}</span>
                          <span>({leak.relation_type})</span>
                          <span>{getDomainLabel(t.domain_id)}</span>
                        </div>
                        <div className="flex justify-end gap-1.5 pt-2 border-t border-slate-800/60">
                          <button
                            id={`leak-approve-btn-${leak.id}`}
                            onClick={() => handleBulkSetDecision(leak.id, ActionType.Keep)}
                            className="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-900 hover:bg-emerald-900 rounded font-mono text-3xs font-semibold uppercase tracking-wider transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            id={`leak-monitor-btn-${leak.id}`}
                            onClick={() => handleBulkSetDecision(leak.id, ActionType.Monitor)}
                            className="px-2 py-0.5 bg-yellow-950 text-yellow-400 border border-yellow-900 hover:bg-yellow-900 rounded font-mono text-3xs font-semibold uppercase tracking-wider transition-colors"
                          >
                            Monitor
                          </button>
                          <button
                            id={`leak-remove-btn-${leak.id}`}
                            onClick={() => handleBulkSetDecision(leak.id, ActionType.Remove)}
                            className="px-2 py-0.5 bg-red-950 text-red-400 border border-red-900 hover:bg-red-900 rounded font-mono text-3xs font-semibold uppercase tracking-wider transition-colors"
                          >
                            Sever
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Create / Edit Relationship Modal Form */}
        {isFormOpen && (
          <div id="relationship-form-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-8 shadow-2xl relative">
              <button
                id="close-relationship-modal"
                onClick={resetForm}
                className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-xl font-bold text-white mb-6">
                {editingRel ? "Edit Relationship" : "Create New Relationship"}
              </h2>

              <form onSubmit={handleSaveRelationship} className="space-y-5 text-sm">
                
                {/* Source Select */}
                <div className="space-y-1">
                  <label htmlFor="rel-source-select" className="text-xs font-semibold uppercase tracking-wider text-slate-400">Source Node</label>
                  <select
                    id="rel-source-select"
                    required
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500 text-slate-200"
                  >
                    <option value="">Select source...</option>
                    {db.entities.filter((e) => e.status === RecordStatus.Active).map((ent) => (
                      <option key={ent.id} value={ent.id}>{ent.display_label} ({ent.entity_type})</option>
                    ))}
                  </select>
                </div>

                {/* Target Select */}
                <div className="space-y-1">
                  <label htmlFor="rel-target-select" className="text-xs font-semibold uppercase tracking-wider text-slate-400">Target Node</label>
                  <select
                    id="rel-target-select"
                    required
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500 text-slate-200"
                  >
                    <option value="">Select target...</option>
                    {db.entities.filter((e) => e.status === RecordStatus.Active).map((ent) => (
                      <option key={ent.id} value={ent.id}>{ent.display_label} ({ent.entity_type})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="rel-type-select" className="text-xs font-semibold uppercase tracking-wider text-slate-400">Relation Type</label>
                    <select
                      id="rel-type-select"
                      value={relationType}
                      onChange={(e) => setRelationType(e.target.value as RelationType)}
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none text-slate-200 font-mono text-xs capitalize"
                    >
                      {Object.values(RelationType).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="rel-directionality-select" className="text-xs font-semibold uppercase tracking-wider text-slate-400">Directionality</label>
                    <select
                      id="rel-directionality-select"
                      value={directionality}
                      onChange={(e) => setDirectionality(e.target.value as Directionality)}
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none text-slate-200 font-mono text-xs capitalize"
                    >
                      {Object.values(Directionality).map((dir) => (
                        <option key={dir} value={dir}>{dir}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="rel-pathrole-select" className="text-xs font-semibold uppercase tracking-wider text-slate-400">Path Role</label>
                    <select
                      id="rel-pathrole-select"
                      value={pathRole}
                      onChange={(e) => setPathRole(e.target.value as PathRole)}
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none text-slate-200 font-mono text-xs capitalize"
                    >
                      {Object.values(PathRole).map((pr) => (
                        <option key={pr} value={pr}>{pr}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="rel-persistence-select" className="text-xs font-semibold uppercase tracking-wider text-slate-400">Persistence</label>
                    <select
                      id="rel-persistence-select"
                      value={persistence}
                      onChange={(e) => setPersistence(e.target.value as PersistenceType)}
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none text-slate-200 font-mono text-xs capitalize"
                    >
                      {Object.values(PersistenceType).map((pt) => (
                        <option key={pt} value={pt}>{pt}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="rel-confidence" className="text-xs font-semibold uppercase tracking-wider text-slate-400">Confidence</label>
                    <input
                      id="rel-confidence"
                      type="number"
                      min={1}
                      max={5}
                      className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200"
                      value={confidence}
                      onChange={(e) => setConfidence(parseInt(e.target.value) || 3)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="rel-evidence" className="text-xs font-semibold uppercase tracking-wider text-slate-400">Evidence</label>
                    <input
                      id="rel-evidence"
                      type="number"
                      min={1}
                      max={5}
                      className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200"
                      value={evidenceStrength}
                      onChange={(e) => setEvidenceStrength(parseInt(e.target.value) || 3)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="rel-cost" className="text-xs font-semibold uppercase tracking-wider text-slate-400">Override Cost</label>
                    <input
                      id="rel-cost"
                      type="number"
                      placeholder="Default"
                      className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800/60 rounded-xl">
                  <div className="flex items-center gap-2">
                    <input
                      id="rel-intentional-check"
                      type="checkbox"
                      className="w-4 h-4 bg-slate-900 border-slate-800 text-cyan-500 rounded focus:ring-cyan-500"
                      checked={isIntentional}
                      onChange={(e) => setIsIntentional(e.target.checked)}
                    />
                    <label htmlFor="rel-intentional-check" className="text-xs font-semibold text-slate-300">
                      Intentional Connection
                    </label>
                  </div>

                  <select
                    id="rel-decision-select"
                    value={decision}
                    onChange={(e) => setDecision(e.target.value as ActionType | "undecided")}
                    className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 font-mono"
                  >
                    <option value="undecided">Undecided</option>
                    <option value="keep">Keep/Approve</option>
                    <option value="weaken">Weaken</option>
                    <option value="remove">Remove</option>
                    <option value="monitor">Monitor</option>
                  </select>
                </div>

                <button
                  id="save-relationship-btn"
                  type="submit"
                  className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-semibold uppercase tracking-wider text-xs transition-colors"
                >
                  {editingRel ? "Update Link" : "Establish Link"}
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
