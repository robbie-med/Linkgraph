/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  PhoneCall,
  Upload,
  ArrowRight,
  GitCommit,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Trash2,
  Calendar,
  Layers,
  MapPin,
  RefreshCw,
  Search,
  ArrowUpRight
} from "lucide-react";
import {
  DecryptedDatabase,
  ImportBatch,
  CommunicationEvent,
  CommunicationRollup,
  Identifier,
  IdentifierType,
  RecordStatus,
  DomainId,
  Entity,
  EntityType,
  Relationship,
  RelationType,
  Directionality,
  PathRole,
  PersistenceType,
  ActionType
} from "../types";
import { logAuditEvent } from "../utils/database";
import { computeSHA256 } from "../utils/crypto";
import { triageCommunicationRollups } from "../utils/analysis";

interface CommunicationsProps {
  db: DecryptedDatabase;
  masterKey: CryptoKey | null;
  onUpdateDb: (updatedDb: DecryptedDatabase) => void;
}

export default function Communications({ db, masterKey, onUpdateDb }: CommunicationsProps) {
  // Wizard state
  const [step, setStep] = useState<"upload" | "mapping" | "preview" | "done">("upload");
  const [csvContent, setCsvContent] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<{ [key: string]: string }>({
    timestamp: "",
    sourceLine: "",
    peerNumber: "",
    direction: "",
    channel: "",
    duration: "",
    recordId: ""
  });

  const [retainOriginal, setRetainOriginal] = useState(false);
  const [importedBatch, setImportedBatch] = useState<ImportBatch | null>(null);

  // Classification queue state
  const [filterQuery, setFilterQuery] = useState("");
  const [editingRollupId, setEditingRollupId] = useState<string | null>(null);
  const [selectedClassification, setSelectedClassification] = useState<any>("unknown");
  const [selectedEntityId, setSelectedEntityId] = useState<string>("");

  // Preset Sample for Demo/Testing
  const loadSampleCSV = () => {
    const sample = `Timestamp,Source,Destination,Direction,Type,Duration,ID
2026-06-20 14:22:10,555-0192,555-4321,outbound,call,120,att-rec-1
2026-06-21 09:15:45,555-4321,555-0192,inbound,call,350,att-rec-2
2026-06-21 11:30:00,555-0192,555-9876,outbound,sms,0,att-rec-3
2026-06-22 18:40:12,555-9876,555-0192,inbound,sms,0,att-rec-4
2026-06-22 19:10:00,555-0192,555-5555,outbound,call,150,att-rec-5`;
    setCsvContent(sample);
    handleCsvParsed(sample);
  };

  const handleCsvParsed = (text: string) => {
    const lines = text.split("\n").map((line) => line.split(",").map((cell) => cell.trim()));
    if (lines.length < 2) return;

    const headers = lines[0];
    setCsvHeaders(headers);
    setParsedRows(lines.slice(1).filter((r) => r.length === headers.length && r.join("")));
    
    // Auto map columns if headers match keywords
    const autoMap: { [key: string]: string } = {};
    headers.forEach((h, idx) => {
      const lower = h.toLowerCase();
      if (lower.includes("time") || lower.includes("date")) autoMap.timestamp = h;
      else if (lower.includes("source") || lower.includes("from") || lower.includes("own")) autoMap.sourceLine = h;
      else if (lower.includes("dest") || lower.includes("peer") || lower.includes("to") || lower.includes("number")) autoMap.peerNumber = h;
      else if (lower.includes("direct")) autoMap.direction = h;
      else if (lower.includes("type") || lower.includes("channel")) autoMap.channel = h;
      else if (lower.includes("dur")) autoMap.duration = h;
      else if (lower.includes("id") || lower.includes("rec")) autoMap.recordId = h;
    });

    setMapping({
      timestamp: autoMap.timestamp || "",
      sourceLine: autoMap.sourceLine || "",
      peerNumber: autoMap.peerNumber || "",
      direction: autoMap.direction || "",
      channel: autoMap.channel || "",
      duration: autoMap.duration || "",
      recordId: autoMap.recordId || ""
    });

    setStep("mapping");
  };

  const executeImport = async () => {
    try {
      const batchId = `bat-${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      let successCount = 0;
      let dupCount = 0;
      let errCount = 0;

      const newEvents: CommunicationEvent[] = [];
      const updatedIdentifiers = [...db.identifiers];
      const updatedEntities = [...db.entities];

      // Cache existing hashes to avoid duplicates
      const existingHashes = new Set(db.communication_events.map((e) => e.event_hash));

      // Resolve indices
      const getIndex = (headerName: string) => csvHeaders.indexOf(headerName);
      const tsIdx = getIndex(mapping.timestamp);
      const srcIdx = getIndex(mapping.sourceLine);
      const peerIdx = getIndex(mapping.peerNumber);
      const dirIdx = getIndex(mapping.direction);
      const chanIdx = getIndex(mapping.channel);
      const durIdx = getIndex(mapping.duration);
      const recIdx = getIndex(mapping.recordId);

      for (const row of parsedRows) {
        try {
          const rawTs = row[tsIdx];
          const rawSrc = row[srcIdx];
          const rawPeer = row[peerIdx];
          const rawDir = dirIdx !== -1 ? row[dirIdx].toLowerCase() : "outbound";
          const rawChan = chanIdx !== -1 ? row[chanIdx].toLowerCase() : "call";
          const rawDur = durIdx !== -1 ? parseInt(row[durIdx]) || 0 : 0;
          const rawRec = recIdx !== -1 ? row[recIdx] : "";

          if (!rawTs || !rawSrc || !rawPeer) {
            errCount++;
            continue;
          }

          // Normalize identifiers (phone format)
          const normSrc = rawSrc.replace(/\s+/g, "").replace(/[^0-9+]/g, "");
          const normPeer = rawPeer.replace(/\s+/g, "").replace(/[^0-9+]/g, "");

          // 1. Compute stable event hash to verify uniqueness
          const eventHashData = `${rawTs}|${normSrc}|${normPeer}|${rawDir}|${rawDur}`;
          const eventHash = await computeSHA256(eventHashData);

          if (existingHashes.has(eventHash)) {
            dupCount++;
            continue;
          }

          // 2. Ensure Identifier nodes exist
          const findOrCreateIdentifier = (val: string): string => {
            let ident = updatedIdentifiers.find((i) => i.normalized_value === val);
            if (!ident) {
              const entId = `e-${Math.random().toString(36).substr(2, 9)}`;
              // Create transient Unclassified/Unknown Entity for this new peer number!
              const newEnt: Entity = {
                id: entId,
                entity_type: EntityType.PhoneNumber,
                display_label: `Unresolved Contact (${val})`,
                domain_id: DomainId.UNKNOWN,
                sensitivity: 2,
                protected: false,
                status: RecordStatus.Active,
                created_at: now,
                updated_at: now,
                created_by: "import_service"
              };
              updatedEntities.push(newEnt);

              ident = {
                id: `id-${Math.random().toString(36).substr(2, 9)}`,
                entity_id: entId,
                identifier_type: IdentifierType.Phone,
                normalized_value: val,
                display_value_encrypted: `plain:${val}`,
                status: RecordStatus.Active,
                created_at: now,
                updated_at: now
              };
              updatedIdentifiers.push(ident);
            }
            return ident.id;
          };

          const sId = findOrCreateIdentifier(normSrc);
          const pId = findOrCreateIdentifier(normPeer);

          // 3. Create communication event
          const newEvent: CommunicationEvent = {
            id: `ev-${Math.random().toString(36).substr(2, 9)}`,
            import_batch_id: batchId,
            source_identifier_id: sId,
            peer_identifier_id: pId,
            occurred_at_utc: new Date(rawTs).toISOString(),
            occurred_at_local: rawTs,
            direction: rawDir.includes("in") ? "inbound" : "outbound",
            channel: rawChan.includes("sms") ? "sms" : rawChan.includes("mms") ? "mms" : "call",
            duration_seconds: rawDur,
            carrier_record_id: rawRec,
            event_hash: eventHash
          };

          newEvents.push(newEvent);
          existingHashes.add(eventHash);
          successCount++;
        } catch {
          errCount++;
        }
      }

      // Create import batch record
      const newBatch: ImportBatch = {
        id: batchId,
        source_type: "carrier_cdr",
        source_label: `CDR Import (${parsedRows.length} rows)`,
        file_hash: await computeSHA256(csvContent),
        parser_version: "v1.2-wizard",
        imported_at: now,
        imported_by: "local_user",
        record_count: successCount,
        duplicate_count: dupCount,
        error_count: errCount,
        status: successCount > 0 ? "success" : "failed",
        raw_file_retained: retainOriginal
      };

      // 4. Update the DB records and append events
      const updatedEventsList = [...db.communication_events, ...newEvents];

      // 5. Recompute Rollups
      // Recalculate communication rolls for affected identifiers
      const affectedSourceIds = new Set(newEvents.map((e) => e.source_identifier_id));
      const affectedPeerIds = new Set(newEvents.map((e) => e.peer_identifier_id));

      const updatedRollups = [...(db.communication_rollups || [])];

      newEvents.forEach((ev) => {
        // Find existing rollup or create new
        let roll = updatedRollups.find(
          (r) => r.source_identifier_id === ev.source_identifier_id && r.peer_identifier_id === ev.peer_identifier_id
        );

        const isCall = ev.channel === "call";
        const isSms = ev.channel === "sms";
        const isMms = ev.channel === "mms";
        const isIn = ev.direction === "inbound";
        const isOut = ev.direction === "outbound";

        if (!roll) {
          roll = {
            id: `roll-${Math.random().toString(36).substr(2, 9)}`,
            source_identifier_id: ev.source_identifier_id,
            peer_identifier_id: ev.peer_identifier_id,
            time_window: "all",
            calls_in: isIn && isCall ? 1 : 0,
            calls_out: isOut && isCall ? 1 : 0,
            sms_in: isIn && isSms ? 1 : 0,
            sms_out: isOut && isSms ? 1 : 0,
            mms_in: isIn && isMms ? 1 : 0,
            mms_out: isOut && isMms ? 1 : 0,
            total_duration_seconds: ev.duration_seconds || 0,
            distinct_active_days: 1,
            first_seen: ev.occurred_at_utc,
            last_seen: ev.occurred_at_utc,
            reciprocity_score: 50,
            interaction_strength_score: 5,
            cross_domain_count: 0,
            classification: "unknown"
          };
          updatedRollups.push(roll);
        } else {
          roll.calls_in += isIn && isCall ? 1 : 0;
          roll.calls_out += isOut && isCall ? 1 : 0;
          roll.sms_in += isIn && isSms ? 1 : 0;
          roll.sms_out += isOut && isSms ? 1 : 0;
          roll.mms_in += isIn && isMms ? 1 : 0;
          roll.mms_out += isOut && isMms ? 1 : 0;
          roll.total_duration_seconds += ev.duration_seconds || 0;
          
          if (new Date(ev.occurred_at_utc).getTime() < new Date(roll.first_seen).getTime()) {
            roll.first_seen = ev.occurred_at_utc;
          }
          if (new Date(ev.occurred_at_utc).getTime() > new Date(roll.last_seen).getTime()) {
            roll.last_seen = ev.occurred_at_utc;
          }
        }
      });

      // Construct intermediate db state to compute strength scores
      const intermediateDb: DecryptedDatabase = {
        ...db,
        entities: updatedEntities,
        identifiers: updatedIdentifiers,
        communication_events: updatedEventsList,
        communication_rollups: updatedRollups
      };

      const finalRollups = triageCommunicationRollups(intermediateDb);

      const finalDb: DecryptedDatabase = {
        ...intermediateDb,
        import_batches: [...db.import_batches, newBatch],
        communication_rollups: finalRollups
      };

      await logAuditEvent(finalDb, "import", "batch", batchId, null, newBatch, masterKey || undefined);

      onUpdateDb(finalDb);
      setImportedBatch(newBatch);
      setStep("done");
    } catch (err: any) {
      alert("Import process failed: " + err.message);
    }
  };

  // Classify unknown number handler
  const handleSaveClassification = async () => {
    if (!editingRollupId) return;

    const roll = db.communication_rollups.find((r) => r.id === editingRollupId);
    if (!roll) return;

    // Grab peer identifier
    const peerIdent = db.identifiers.find((i) => i.id === roll.peer_identifier_id);
    if (!peerIdent) return;

    // Grab entity
    const peerEntity = db.entities.find((e) => e.id === peerIdent.entity_id);
    if (!peerEntity) return;

    let updatedEntities = [...db.entities];
    let updatedIdentifiers = [...db.identifiers];
    let updatedRelationships = [...db.relationships];

    const now = new Date().toISOString();

    if (selectedClassification === "existing" && selectedEntityId) {
      // Reassign peer number to an existing verified entity!
      updatedIdentifiers = db.identifiers.map((ident) => {
        if (ident.id === peerIdent.id) {
          return { ...ident, entity_id: selectedEntityId, updated_at: now };
        }
        return ident;
      });

      // Retire the unclassified entity
      updatedEntities = db.entities.map((ent) => {
        if (ent.id === peerEntity.id) {
          return { ...ent, status: RecordStatus.Retired, updated_at: now };
        }
        return ent;
      });

      // Create a direct connects_to relationship!
      const newRel: Relationship = {
        id: `r-class-${Math.random().toString(36).substr(2, 9)}`,
        source_entity_id: selectedEntityId,
        target_entity_id: peerEntity.id,
        relation_type: RelationType.uses_identifier,
        directionality: Directionality.Directed,
        path_role: PathRole.Association,
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
      updatedRelationships.push(newRel);
    } else {
      // Create a new customized compartment/entity or update classification label
      const classLabel = selectedClassification; // e.g. "family", "professional", "vendor"
      
      updatedEntities = db.entities.map((ent) => {
        if (ent.id === peerEntity.id) {
          return {
            ...ent,
            display_label: `${classLabel.toUpperCase()} Contact (${peerIdent.normalized_value})`,
            domain_id: classLabel === "family" ? DomainId.HOUSEHOLD : DomainId.PUBLIC_INTAKE,
            updated_at: now
          };
        }
        return ent;
      });
    }

    // Update rollup classification value
    const updatedRollups = db.communication_rollups.map((r) => {
      if (r.id === editingRollupId) {
        return { ...r, classification: selectedClassification === "existing" ? "professional" : selectedClassification };
      }
      return r;
    });

    const finalDb: DecryptedDatabase = {
      ...db,
      entities: updatedEntities,
      identifiers: updatedIdentifiers,
      relationships: updatedRelationships,
      communication_rollups: updatedRollups
    };

    await logAuditEvent(finalDb, "update", "rollup", editingRollupId, roll, { ...roll, classification: selectedClassification }, masterKey || undefined);

    onUpdateDb(finalDb);
    setEditingRollupId(null);
  };

  return (
    <div id="communications-page" className="flex-1 overflow-y-auto p-8 bg-slate-900 text-slate-100 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Page Header */}
        <div className="flex justify-between items-center pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <PhoneCall className="w-8 h-8 text-cyan-400" />
              Communication Triage
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Import carrier logs, analyze interaction frequency and strength, isolate unknown callers, and trace cross-domain bridges.
            </p>
          </div>
        </div>

        {/* Dynamic Multi-Step Import Wizard Panel */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">CDR Log Importer Wizard</h2>

          {step === "upload" && (
            <div className="space-y-6">
              <div className="border border-dashed border-slate-800 hover:border-cyan-500/50 bg-slate-900/20 rounded-2xl p-10 text-center transition-all">
                <Upload className="w-10 h-10 text-slate-500 mx-auto mb-4" />
                <h3 className="font-bold text-slate-300 text-sm mb-2">Drag and drop CDR CSV or Paste Content</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed mb-6">
                  Supports CSV/TXT exports from major telecom operators (AT&T, Verizon, T-Mobile). Columns mapped dynamically in next step.
                </p>

                <textarea
                  id="csv-textarea"
                  placeholder="Paste raw CSV log contents here..."
                  className="w-full h-32 p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder-slate-700"
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                />

                <div className="flex justify-between items-center mt-6 max-w-md mx-auto">
                  <button
                    id="sample-cdr-btn"
                    onClick={loadSampleCSV}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    Load Simulated Sample CDR
                  </button>
                  <button
                    id="parse-csv-btn"
                    onClick={() => handleCsvParsed(csvContent)}
                    disabled={!csvContent}
                    className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold uppercase tracking-wider transition-all"
                  >
                    Next: Map Columns
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "mapping" && (
            <div className="space-y-6">
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-400 leading-relaxed">
                Map your CSV columns to LinkGraph schema items. The engine automates parsing and deduplication.
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-sm">
                {Object.keys(mapping).map((field) => (
                  <div key={field} className="space-y-1">
                    <label htmlFor={`map-${field}`} className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {field === "sourceLine" ? "Source Line (Owner)" : field === "peerNumber" ? "Peer Number" : field}
                    </label>
                    <select
                      id={`map-${field}`}
                      value={mapping[field]}
                      onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl focus:outline-none text-slate-300 text-xs font-mono"
                    >
                      <option value="">-- Ignore / Unmapped --</option>
                      {csvHeaders.map((header) => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-slate-900">
                <div className="flex items-center gap-3">
                  <input
                    id="retain-orig-check"
                    type="checkbox"
                    className="w-4 h-4 bg-slate-900 border-slate-800 text-cyan-500 rounded"
                    checked={retainOriginal}
                    onChange={(e) => setRetainOriginal(e.target.checked)}
                  />
                  <label htmlFor="retain-orig-check" className="text-xs text-slate-400 font-sans">
                    Retain encrypted original file attachment in secure storage
                  </label>
                </div>

                <div className="flex gap-2">
                  <button
                    id="back-upload-btn"
                    onClick={() => setStep("upload")}
                    className="px-4 py-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-semibold uppercase tracking-wider transition-all"
                  >
                    Back
                  </button>
                  <button
                    id="execute-import-btn"
                    onClick={executeImport}
                    className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold uppercase tracking-wider transition-all"
                  >
                    Execute Import ({parsedRows.length} Records)
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "done" && importedBatch && (
            <div className="text-center py-8 space-y-4">
              <div className="w-12 h-12 bg-emerald-950/40 border border-emerald-900 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Import Complete!</h3>
                <p className="text-xs text-slate-500 mt-1">Batch ID: {importedBatch.id}</p>
              </div>

              <div className="grid grid-cols-3 gap-4 max-w-md mx-auto pt-4 text-center font-mono text-xs">
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800/80">
                  <span className="text-2xs text-slate-500 block uppercase font-semibold">Success</span>
                  <span className="text-base font-extrabold text-emerald-400 mt-1 block">{importedBatch.record_count}</span>
                </div>
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800/80">
                  <span className="text-2xs text-slate-500 block uppercase font-semibold">Duplicates</span>
                  <span className="text-base font-extrabold text-slate-400 mt-1 block">{importedBatch.duplicate_count}</span>
                </div>
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800/80">
                  <span className="text-2xs text-slate-500 block uppercase font-semibold">Errors</span>
                  <span className="text-base font-extrabold text-red-400 mt-1 block">{importedBatch.error_count}</span>
                </div>
              </div>

              <button
                id="finish-import-btn"
                onClick={() => {
                  setStep("upload");
                  setCsvContent("");
                }}
                className="px-6 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all"
              >
                Upload Another File
              </button>
            </div>
          )}
        </div>

        {/* Contact rollups list */}
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-white">Active Communication Triage Rollups ({db.communication_rollups.length})</h2>
            <div className="flex gap-2">
              <input
                id="search-rollups-input"
                type="text"
                placeholder="Search number/identity..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 placeholder-slate-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-2xs font-semibold">
                <tr>
                  <th className="p-4">Peer Contact</th>
                  <th className="p-4">Calls (In/Out)</th>
                  <th className="p-4">SMS (In/Out)</th>
                  <th className="p-4">Last Seen</th>
                  <th className="p-4">Strength Score</th>
                  <th className="p-4">Classification</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 text-slate-300">
                {db.communication_rollups.filter((roll) => {
                  if (!filterQuery) return true;
                  const peerIdent = db.identifiers.find((i) => i.id === roll.peer_identifier_id);
                  return peerIdent?.normalized_value.includes(filterQuery);
                }).map((roll) => {
                  const peerIdent = db.identifiers.find((i) => i.id === roll.peer_identifier_id);
                  const isEditing = editingRollupId === roll.id;

                  return (
                    <tr key={roll.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="p-4 font-mono font-bold text-slate-200">
                        {peerIdent ? peerIdent.normalized_value : "Unknown"}
                      </td>
                      <td className="p-4 font-mono">{roll.calls_in} / {roll.calls_out}</td>
                      <td className="p-4 font-mono">{roll.sms_in} / {roll.sms_out}</td>
                      <td className="p-4 text-slate-500 font-mono">{new Date(roll.last_seen).toLocaleDateString()}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                            <div
                              className="bg-cyan-500 h-full"
                              style={{ width: `${roll.interaction_strength_score}%` }}
                            />
                          </div>
                          <span className="font-mono text-2xs">{roll.interaction_strength_score}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        {isEditing ? (
                          <div className="flex gap-1.5 items-center">
                            <select
                              id={`class-select-${roll.id}`}
                              value={selectedClassification}
                              onChange={(e) => setSelectedClassification(e.target.value)}
                              className="px-2 py-1 bg-slate-900 border border-slate-800 rounded font-mono text-2xs text-slate-300 focus:outline-none"
                            >
                              <option value="unknown">Unknown</option>
                              <option value="family">Family</option>
                              <option value="professional">Professional</option>
                              <option value="vendor">Vendor</option>
                              <option value="sensitive">Sensitive</option>
                              <option value="spam">Spam / Blocked</option>
                              <option value="existing">-- Existing Entity --</option>
                            </select>

                            {selectedClassification === "existing" && (
                              <select
                                id={`entity-select-${roll.id}`}
                                value={selectedEntityId}
                                onChange={(e) => setSelectedEntityId(e.target.value)}
                                className="px-2 py-1 bg-slate-900 border border-slate-800 rounded font-mono text-2xs text-slate-300 focus:outline-none"
                              >
                                <option value="">Select entity...</option>
                                {db.entities.filter((e) => e.status === RecordStatus.Active).map((ent) => (
                                  <option key={ent.id} value={ent.id}>{ent.display_label}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        ) : (
                          <span className="px-2.5 py-0.5 bg-slate-900 border border-slate-800 rounded-lg text-2xs font-mono capitalize">
                            {roll.classification}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        {isEditing ? (
                          <div className="flex gap-2 justify-end">
                            <button
                              id={`save-class-btn-${roll.id}`}
                              onClick={handleSaveClassification}
                              className="px-2 py-1 bg-emerald-950 text-emerald-400 border border-emerald-900 rounded hover:bg-emerald-900 text-2xs font-bold"
                            >
                              Save
                            </button>
                            <button
                              id={`cancel-class-btn-${roll.id}`}
                              onClick={() => setEditingRollupId(null)}
                              className="px-2 py-1 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded text-2xs font-bold"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            id={`edit-class-btn-${roll.id}`}
                            onClick={() => {
                              setEditingRollupId(roll.id);
                              setSelectedClassification(roll.classification);
                            }}
                            className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
                          >
                            Classify
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
