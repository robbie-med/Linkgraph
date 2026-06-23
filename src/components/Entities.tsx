/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  Users,
  UserPlus,
  Edit2,
  Trash2,
  Shield,
  Tag,
  AlertTriangle,
  HelpCircle,
  Plus,
  X,
  RefreshCw,
  GitMerge,
  Eye,
  Calendar,
  Lock,
  Unlock,
  Check
} from "lucide-react";
import {
  DecryptedDatabase,
  Entity,
  EntityType,
  DomainId,
  RecordStatus,
  Identifier,
  IdentifierType
} from "../types";
import { logAuditEvent, DEFAULT_DOMAINS } from "../utils/database";
import { encryptIdentifier, decryptIdentifier } from "../utils/crypto";

interface EntitiesProps {
  db: DecryptedDatabase;
  masterKey: CryptoKey | null;
  onUpdateDb: (updatedDb: DecryptedDatabase) => void;
}

export default function Entities({ db, masterKey, onUpdateDb }: EntitiesProps) {
  const [entities, setEntities] = useState<Entity[]>(db.entities);
  const [identifiers, setIdentifiers] = useState<Identifier[]>(db.identifiers);

  // Modal / Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);

  // New Entity Form Field States
  const [displayLabel, setDisplayLabel] = useState("");
  const [entityType, setEntityType] = useState<EntityType>(EntityType.Person);
  const [domainId, setDomainId] = useState<DomainId>(DomainId.PRIVATE_CORE);
  const [sensitivity, setSensitivity] = useState(5);
  const [isProtected, setIsProtected] = useState(false);
  const [notes, setNotes] = useState("");

  // Identifiers adding
  const [newIdVal, setNewIdVal] = useState("");
  const [newIdType, setNewIdType] = useState<IdentifierType>(IdentifierType.Phone);

  // Merge Wizard State
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");

  // Decryption reveal map (for privacy masking / unmasking)
  const [decryptedValues, setDecryptedValues] = useState<{ [id: string]: string }>({});
  const [decryptingIds, setDecryptingIds] = useState<{ [id: string]: boolean }>({});

  const handleRevealIdentifier = async (ident: Identifier) => {
    if (!masterKey) return;
    if (decryptedValues[ident.id]) {
      // Toggle off
      const updated = { ...decryptedValues };
      delete updated[ident.id];
      setDecryptedValues(updated);
      return;
    }

    setDecryptingIds((prev) => ({ ...prev, [ident.id]: true }));
    try {
      let val = "";
      if (ident.display_value_encrypted.startsWith("iv-placeholder:")) {
        val = ident.normalized_value; // Fallback for seeds
      } else {
        val = await decryptIdentifier(ident.display_value_encrypted, masterKey);
      }
      setDecryptedValues((prev) => ({ ...prev, [ident.id]: val }));
    } catch {
      setDecryptedValues((prev) => ({ ...prev, [ident.id]: "Decryption failed" }));
    } finally {
      setDecryptingIds((prev) => ({ ...prev, [ident.id]: false }));
    }
  };

  const handleSaveEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayLabel) return;

    const now = new Date().toISOString();
    let updatedList = [...entities];
    let auditAction = "create";
    let targetId = editingEntity ? editingEntity.id : `e-${Math.random().toString(36).substr(2, 9)}`;
    let beforeState = editingEntity ? { ...editingEntity } : null;

    const notesEnc = masterKey && notes 
      ? (await encryptIdentifier(notes, masterKey)) 
      : notes;

    const newEnt: Entity = {
      id: targetId,
      entity_type: entityType,
      display_label: displayLabel,
      domain_id: domainId,
      sensitivity,
      protected: isProtected,
      status: RecordStatus.Active,
      notes_encrypted: notesEnc,
      created_at: editingEntity ? editingEntity.created_at : now,
      updated_at: now,
      created_by: "local_user"
    };

    if (editingEntity) {
      updatedList = updatedList.map((ent) => (ent.id === editingEntity.id ? newEnt : ent));
      auditAction = "update";
    } else {
      updatedList.push(newEnt);
    }

    const updatedDb = { ...db, entities: updatedList };
    await logAuditEvent(updatedDb, auditAction, "entity", targetId, beforeState, newEnt, masterKey || undefined);
    
    setEntities(updatedList);
    onUpdateDb(updatedDb);
    resetForm();
  };

  const resetForm = () => {
    setEditingEntity(null);
    setDisplayLabel("");
    setEntityType(EntityType.Person);
    setDomainId(DomainId.PRIVATE_CORE);
    setSensitivity(5);
    setIsProtected(false);
    setNotes("");
    setIsFormOpen(false);
  };

  const handleEditClick = (ent: Entity) => {
    setEditingEntity(ent);
    setDisplayLabel(ent.display_label);
    setEntityType(ent.entity_type);
    setDomainId(ent.domain_id);
    setSensitivity(ent.sensitivity);
    setIsProtected(ent.protected);
    setNotes(ent.notes_encrypted || "");
    setIsFormOpen(true);
  };

  const handleArchiveEntity = async (entityId: string) => {
    const ent = entities.find((e) => e.id === entityId);
    if (!ent) return;

    const confirm = window.confirm(`Are you sure you want to archive entity "${ent.display_label}"?`);
    if (!confirm) return;

    const beforeState = { ...ent };
    const updatedEntity: Entity = {
      ...ent,
      status: RecordStatus.Archived,
      updated_at: new Date().toISOString()
    };

    const updatedList = entities.map((e) => (e.id === entityId ? updatedEntity : e));
    const updatedDb = { ...db, entities: updatedList };
    await logAuditEvent(updatedDb, "delete", "entity", entityId, beforeState, updatedEntity, masterKey || undefined);

    setEntities(updatedList);
    onUpdateDb(updatedDb);
  };

  // Identifier actions
  const handleAddIdentifier = async (entityId: string) => {
    if (!newIdVal) return;

    let normalized = newIdVal.trim();
    if (newIdType === IdentifierType.Phone) {
      // Basic E.164 normalization logic
      normalized = normalized.replace(/\s+/g, "").replace(/[^0-9+]/g, "");
      if (!normalized.startsWith("+")) {
        // Assume US country code by default if no '+' present
        normalized = `+1${normalized}`;
      }
    }

    const encryptedVal = masterKey 
      ? await encryptIdentifier(newIdVal, masterKey)
      : `plain:${newIdVal}`;

    const newId: Identifier = {
      id: `id-${Math.random().toString(36).substr(2, 9)}`,
      entity_id: entityId,
      identifier_type: newIdType,
      normalized_value: normalized,
      display_value_encrypted: encryptedVal,
      status: RecordStatus.Active,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const updatedList = [...identifiers, newId];
    const updatedDb = { ...db, identifiers: updatedList };
    await logAuditEvent(updatedDb, "create", "identifier", newId.id, null, newId, masterKey || undefined);

    setIdentifiers(updatedList);
    onUpdateDb(updatedDb);
    setNewIdVal("");
  };

  const handleRemoveIdentifier = async (id: string) => {
    const ident = identifiers.find((i) => i.id === id);
    if (!ident) return;

    const confirm = window.confirm(`Are you sure you want to delete this identifier?`);
    if (!confirm) return;

    const updatedList = identifiers.filter((i) => i.id !== id);
    const updatedDb = { ...db, identifiers: updatedList };
    await logAuditEvent(updatedDb, "delete", "identifier", id, ident, null, masterKey || undefined);

    setIdentifiers(updatedList);
    onUpdateDb(updatedDb);
  };

  // Merge duplicates handler
  const handleMergeEntities = async () => {
    if (!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId) {
      alert("Please select two distinct entities to merge.");
      return;
    }

    const source = entities.find((e) => e.id === mergeSourceId);
    const target = entities.find((e) => e.id === mergeTargetId);
    if (!source || !target) return;

    const confirm = window.confirm(
      `Are you sure you want to MERGE "${source.display_label}" into "${target.display_label}"?\n\nThis will reassign all of its identifiers and relationships to "${target.display_label}", and retire "${source.display_label}".`
    );
    if (!confirm) return;

    const now = new Date().toISOString();

    // Reassign identifiers
    const updatedIdentifiers = identifiers.map((ident) => {
      if (ident.entity_id === source.id) {
        return { ...ident, entity_id: target.id, updated_at: now };
      }
      return ident;
    });

    // Reassign relationships (as source or target)
    const updatedRelationships = db.relationships.map((rel) => {
      let updated = { ...rel };
      let changed = false;
      if (rel.source_entity_id === source.id) {
        updated.source_entity_id = target.id;
        changed = true;
      }
      if (rel.target_entity_id === source.id) {
        updated.target_entity_id = target.id;
        changed = true;
      }
      if (changed) {
        updated.updated_at = now;
      }
      return updated;
    });

    // Retire source entity
    const retiredSource: Entity = {
      ...source,
      status: RecordStatus.Retired,
      updated_at: now
    };

    const updatedEntities = entities.map((e) => {
      if (e.id === source.id) return retiredSource;
      return e;
    });

    const updatedDb = {
      ...db,
      entities: updatedEntities,
      identifiers: updatedIdentifiers,
      relationships: updatedRelationships
    };

    // Log individual audit events
    await logAuditEvent(updatedDb, "update", "entity", target.id, target, { ...target, note: "Merged with duplicate entity" }, masterKey || undefined);
    await logAuditEvent(updatedDb, "delete", "entity", source.id, source, retiredSource, masterKey || undefined);

    setEntities(updatedEntities);
    setIdentifiers(updatedIdentifiers);
    onUpdateDb(updatedDb);
    setIsMergeOpen(false);
    setMergeSourceId("");
    setMergeTargetId("");
  };

  const getDomainLabel = (id: DomainId) => {
    const def = DEFAULT_DOMAINS.find((d) => d.id === id);
    return def ? def.label : id;
  };

  const getDomainColor = (id: DomainId) => {
    const def = DEFAULT_DOMAINS.find((d) => d.id === id);
    return def ? def.color : "#64748b";
  };

  return (
    <div id="entities-page" className="flex-1 overflow-y-auto p-8 bg-slate-900 text-slate-100 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Page Header */}
        <div className="flex justify-between items-center pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <Users className="w-8 h-8 text-cyan-400" />
              Entities & Identifiers
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Add and manage people, SIM cards, organizations, and devices. Attach normalized cryptographic identifier paths.
            </p>
          </div>
          <div className="flex gap-4">
            <button
              id="open-merge-btn"
              onClick={() => setIsMergeOpen(true)}
              className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold uppercase tracking-wider text-slate-300 hover:text-white hover:bg-slate-900 transition-all flex items-center gap-2"
            >
              <GitMerge className="w-4 h-4 text-violet-400" />
              Merge Duplicates
            </button>
            <button
              id="open-create-entity-btn"
              onClick={() => setIsFormOpen(true)}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-xl text-xs font-semibold uppercase tracking-wider text-white transition-all flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Create Entity
            </button>
          </div>
        </div>

        {/* Entities and Identifiers List */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Entities Grid list */}
          <div className="lg:col-span-2 space-y-6">
            {entities.filter((e) => e.status === RecordStatus.Active).map((ent) => {
              const domainCol = getDomainColor(ent.domain_id);
              const entityIds = identifiers.filter((i) => i.entity_id === ent.id);

              return (
                <div
                  id={`entity-card-${ent.id}`}
                  key={ent.id}
                  className="bg-slate-950 border border-slate-800/80 rounded-2xl p-6 relative hover:border-slate-700 transition-all"
                >
                  {/* Color strip for domain identification */}
                  <div
                    className="absolute top-0 left-0 bottom-0 w-1.5 rounded-l-2xl"
                    style={{ backgroundColor: domainCol }}
                  />

                  <div className="flex justify-between items-start pl-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-slate-100">{ent.display_label}</h2>
                        {ent.protected && (
                          <span className="p-1 bg-cyan-950/40 border border-cyan-900/30 text-cyan-400 rounded-lg text-2xs flex items-center gap-1">
                            <Shield className="w-3 h-3" />
                            Protected
                          </span>
                        )}
                        <span className="text-2xs font-mono bg-slate-900 border border-slate-800 text-slate-400 px-2 py-0.5 rounded-full capitalize">
                          {ent.entity_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
                        <span>Domain: {getDomainLabel(ent.domain_id)}</span>
                        <span>|</span>
                        <span>Sensitivity: {ent.sensitivity}/10</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        id={`edit-entity-${ent.id}`}
                        onClick={() => handleEditClick(ent)}
                        className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        id={`archive-entity-${ent.id}`}
                        onClick={() => handleArchiveEntity(ent.id)}
                        className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Identifiers manager attached here */}
                  <div className="mt-6 pt-6 border-t border-slate-900 pl-4">
                    <span className="text-2xs font-semibold uppercase tracking-wider text-slate-500 block mb-3">
                      Cryptographic Identifier Paths ({entityIds.length})
                    </span>

                    {entityIds.length === 0 ? (
                      <p className="text-xs text-slate-600 font-mono italic">No communication identifiers attached.</p>
                    ) : (
                      <div className="space-y-2">
                        {entityIds.map((ident) => {
                          const isRevealed = !!decryptedValues[ident.id];
                          return (
                            <div
                              key={ident.id}
                              className="flex items-center justify-between p-2 bg-slate-900 rounded-xl border border-slate-800 text-xs font-mono"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-2xs uppercase bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-slate-400">
                                  {ident.identifier_type}
                                </span>
                                <span className="text-slate-300">
                                  {isRevealed
                                    ? decryptedValues[ident.id]
                                    : `••••••••••••${ident.normalized_value.slice(-4)}`}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  id={`reveal-btn-${ident.id}`}
                                  onClick={() => handleRevealIdentifier(ident)}
                                  className="p-1 text-slate-500 hover:text-cyan-400 transition-colors"
                                >
                                  {isRevealed ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  id={`delete-ident-btn-${ident.id}`}
                                  onClick={() => handleRemoveIdentifier(ident.id)}
                                  className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Quick attach form */}
                    <div className="mt-4 flex gap-2">
                      <select
                        id={`new-ident-type-${ent.id}`}
                        value={newIdType}
                        onChange={(e) => setNewIdType(e.target.value as IdentifierType)}
                        className="bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500 text-xs text-slate-300 font-mono"
                      >
                        <option value={IdentifierType.Phone}>Phone (E.164)</option>
                        <option value={IdentifierType.Email}>Email</option>
                        <option value={IdentifierType.Imei}>IMEI</option>
                        <option value={IdentifierType.SimId}>SIM ID (ICCID)</option>
                        <option value={IdentifierType.AccountId}>Account ID</option>
                        <option value={IdentifierType.Address}>Address</option>
                        <option value={IdentifierType.Username}>Username</option>
                      </select>
                      <input
                        id={`new-ident-val-${ent.id}`}
                        type="text"
                        placeholder="Identifier path..."
                        value={newIdVal}
                        onChange={(e) => setNewIdVal(e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500 text-xs text-slate-300 placeholder-slate-600 font-mono"
                      />
                      <button
                        id={`add-ident-btn-${ent.id}`}
                        onClick={() => handleAddIdentifier(ent.id)}
                        className="p-1.5 bg-slate-900 border border-slate-800 hover:border-cyan-500/50 rounded-xl text-cyan-400 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>

          {/* Side Info Panel */}
          <div className="space-y-6">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-base font-bold text-white mb-3">Compartments & Domains</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Compartmentalization limits risks across different identity contexts. Active paths breaching these rules are automatically flagged.
              </p>
              <div className="space-y-3 font-mono text-2xs">
                {DEFAULT_DOMAINS.map((domain) => (
                  <div key={domain.id} className="flex items-start gap-2.5 p-2 bg-slate-900/40 rounded-xl border border-slate-800/40">
                    <span
                      className="w-2.5 h-2.5 rounded-full mt-0.5 shrink-0 animate-pulse"
                      style={{ backgroundColor: domain.color }}
                    />
                    <div>
                      <span className="font-bold text-slate-200">{domain.label}</span>
                      <p className="text-slate-500 font-sans text-3xs leading-relaxed mt-1">{domain.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

        {/* Create / Edit Modal Form */}
        {isFormOpen && (
          <div id="entity-form-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-8 shadow-2xl relative">
              <button
                id="close-entity-modal"
                onClick={resetForm}
                className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-xl font-bold text-white mb-6">
                {editingEntity ? "Edit Entity" : "Create New Entity"}
              </h2>

              <form onSubmit={handleSaveEntity} className="space-y-6 text-sm">
                <div className="space-y-1">
                  <label htmlFor="entity-label" className="text-xs font-semibold uppercase tracking-wider text-slate-400">Display Label</label>
                  <input
                    id="entity-label"
                    type="text"
                    required
                    placeholder="e.g. Work eSIM, Primary Google Account..."
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500 text-slate-200"
                    value={displayLabel}
                    onChange={(e) => setDisplayLabel(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="entity-type-select" className="text-xs font-semibold uppercase tracking-wider text-slate-400">Entity Type</label>
                    <select
                      id="entity-type-select"
                      value={entityType}
                      onChange={(e) => setEntityType(e.target.value as EntityType)}
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500 text-slate-200 capitalize font-mono text-xs"
                    >
                      {Object.values(EntityType).map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="entity-domain-select" className="text-xs font-semibold uppercase tracking-wider text-slate-400">Compartment Domain</label>
                    <select
                      id="entity-domain-select"
                      value={domainId}
                      onChange={(e) => setDomainId(e.target.value as DomainId)}
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500 text-slate-200 capitalize font-mono text-xs"
                    >
                      {Object.values(DomainId).map((dom) => (
                        <option key={dom} value={dom}>{getDomainLabel(dom)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 items-center">
                  <div className="space-y-1">
                    <label htmlFor="entity-sensitivity" className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sensitivity Level (1-10)</label>
                    <input
                      id="entity-sensitivity"
                      type="number"
                      min={1}
                      max={10}
                      className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500 text-slate-200"
                      value={sensitivity}
                      onChange={(e) => setSensitivity(parseInt(e.target.value) || 5)}
                    />
                  </div>

                  <div className="flex items-center gap-3 mt-4">
                    <input
                      id="entity-protected-check"
                      type="checkbox"
                      className="w-4 h-4 bg-slate-950 border-slate-800 rounded text-cyan-500 focus:ring-cyan-500"
                      checked={isProtected}
                      onChange={(e) => setIsProtected(e.target.checked)}
                    />
                    <label htmlFor="entity-protected-check" className="text-xs font-semibold text-slate-300">
                      Apply Protection Constraint
                    </label>
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="entity-notes" className="text-xs font-semibold uppercase tracking-wider text-slate-400">Secure Notes (At-Rest Encrypted)</label>
                  <textarea
                    id="entity-notes"
                    placeholder="Provide contextual metadata..."
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500 text-slate-200 h-24 text-xs font-mono"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                <button
                  id="save-entity-btn"
                  type="submit"
                  className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-semibold uppercase tracking-wider text-xs transition-colors"
                >
                  {editingEntity ? "Update Entity" : "Create Entity"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Merge Duplicates Modal */}
        {isMergeOpen && (
          <div id="merge-duplicates-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-8 shadow-2xl relative">
              <button
                id="close-merge-modal"
                onClick={() => setIsMergeOpen(false)}
                className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-violet-400" />
                Merge Duplicate Entities
              </h2>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Reassign all cryptographic identifiers and relational links from a source entity into a target entity, then retire the source entity.
              </p>

              <div className="space-y-4 text-sm mb-6">
                <div>
                  <label htmlFor="merge-source-select" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Duplicate Source Entity (To Retire)
                  </label>
                  <select
                    id="merge-source-select"
                    value={mergeSourceId}
                    onChange={(e) => setMergeSourceId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500 text-slate-300"
                  >
                    <option value="">Select source...</option>
                    {entities.filter((e) => e.status === RecordStatus.Active).map((ent) => (
                      <option key={ent.id} value={ent.id}>{ent.display_label} ({ent.entity_type})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="merge-target-select" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Target Primary Entity (To Retain)
                  </label>
                  <select
                    id="merge-target-select"
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500 text-slate-300"
                  >
                    <option value="">Select target...</option>
                    {entities.filter((e) => e.status === RecordStatus.Active).map((ent) => (
                      <option key={ent.id} value={ent.id}>{ent.display_label} ({ent.entity_type})</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                id="execute-merge-btn"
                onClick={handleMergeEntities}
                disabled={!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId}
                className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold uppercase tracking-wider text-xs rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Execute Merge Operation
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
