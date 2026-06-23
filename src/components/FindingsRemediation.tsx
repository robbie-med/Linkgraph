/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  Info,
  Calendar,
  User,
  Plus,
  Trash2,
  X,
  FileText,
  Play
} from "lucide-react";
import {
  DecryptedDatabase,
  Finding,
  RemediationAction,
  FindingStatus,
  Severity,
  ActionType
} from "../types";
import { logAuditEvent } from "../utils/database";
import { generateFindings } from "../utils/analysis";

interface FindingsRemediationProps {
  db: DecryptedDatabase;
  masterKey: CryptoKey | null;
  onUpdateDb: (updatedDb: DecryptedDatabase) => void;
}

export default function FindingsRemediation({ db, masterKey, onUpdateDb }: FindingsRemediationProps) {
  const [findings, setFindings] = useState<Finding[]>(db.findings);
  const [actions, setActions] = useState<RemediationAction[]>(db.remediation_actions);

  // Remediation Creator Modal state
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [targetFindingId, setTargetFindingId] = useState("");

  // Action Form States
  const [actionType, setActionType] = useState<ActionType>(ActionType.Weaken);
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("Household Operator");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14); // 2-weeks out default
    return d.toISOString().split("T")[0];
  });

  // Complete action dialog states
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const [targetActionId, setTargetActionId] = useState("");
  const [verificationEvidence, setVerificationEvidence] = useState("");

  const handleUpdateFindingStatus = async (findingId: string, newStatus: FindingStatus) => {
    const finding = findings.find((f) => f.id === findingId);
    if (!finding) return;

    const beforeState = { ...finding };
    const updatedFinding: Finding = {
      ...finding,
      status: newStatus,
      updated_at: new Date().toISOString()
    };

    const updatedList = findings.map((f) => (f.id === findingId ? updatedFinding : f));
    const updatedDb = { ...db, findings: updatedList };
    await logAuditEvent(updatedDb, "update", "finding", findingId, beforeState, updatedFinding, masterKey || undefined);

    setFindings(updatedList);
    onUpdateDb(updatedDb);
  };

  const handleCreateRemediationAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetFindingId || !description) return;

    const now = new Date().toISOString();
    const actionId = `act-${Math.random().toString(36).substr(2, 9)}`;

    const newAction: RemediationAction = {
      id: actionId,
      finding_id: targetFindingId,
      action_type: actionType,
      description,
      owner,
      due_date: dueDate,
      created_at: now
    };

    const updatedList = [...actions, newAction];
    
    // Also move the finding status to "mitigated" or "deferred" depending on the choice
    const updatedFindings = findings.map((f) => {
      if (f.id === targetFindingId) {
        return { ...f, status: FindingStatus.Deferred, updated_at: now };
      }
      return f;
    });

    const updatedDb = {
      ...db,
      remediation_actions: updatedList,
      findings: updatedFindings
    };

    await logAuditEvent(updatedDb, "create", "remediation_action", actionId, null, newAction, masterKey || undefined);

    setActions(updatedList);
    setFindings(updatedFindings);
    onUpdateDb(updatedDb);

    setIsActionModalOpen(false);
    setDescription("");
    setTargetFindingId("");
  };

  const handleCompleteAction = async () => {
    if (!targetActionId) return;

    const action = actions.find((a) => a.id === targetActionId);
    if (!action) return;

    const now = new Date().toISOString();
    const beforeState = { ...action };

    const updatedAction: RemediationAction = {
      ...action,
      completed_at: now,
      verification_evidence_id: verificationEvidence
    };

    const updatedList = actions.map((a) => (a.id === targetActionId ? updatedAction : a));

    // After resolving remediation action, auto trigger graph re-analysis!
    // We run generateFindings to see if the paths have changed. If they have, findings are updated.
    const intermediateDb = {
      ...db,
      remediation_actions: updatedList
    };

    const recomputedFindings = generateFindings(intermediateDb);

    // Any finding that is resolved because of this completed action changes to "mitigated"
    const finalFindings = recomputedFindings.map((re) => {
      if (re.id === action.finding_id) {
        return { ...re, status: FindingStatus.Mitigated, updated_at: now };
      }
      return re;
    });

    const finalDb = {
      ...intermediateDb,
      findings: finalFindings
    };

    await logAuditEvent(finalDb, "update", "remediation_action", targetActionId, beforeState, updatedAction, masterKey || undefined);

    setActions(updatedList);
    setFindings(finalFindings);
    onUpdateDb(finalDb);

    setIsCompleteOpen(false);
    setTargetActionId("");
    setVerificationEvidence("");
  };

  const handleDeleteAction = async (actId: string) => {
    const act = actions.find((a) => a.id === actId);
    if (!act) return;

    const confirm = window.confirm("Are you sure you want to remove this remediation action task?");
    if (!confirm) return;

    const updatedList = actions.filter((a) => a.id !== actId);
    const updatedDb = { ...db, remediation_actions: updatedList };
    await logAuditEvent(updatedDb, "delete", "remediation_action", actId, act, null, masterKey || undefined);

    setActions(updatedList);
    onUpdateDb(updatedDb);
  };

  return (
    <div id="findings-page" className="flex-1 overflow-y-auto p-8 bg-slate-900 text-slate-100 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Page Header */}
        <div className="flex justify-between items-center pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <ShieldCheck className="w-8 h-8 text-cyan-400" />
              Findings & Remediation
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Verify security boundaries. Create and track keep, weaken, remove, or monitor (KWRM) decisions with verification evidence.
            </p>
          </div>
        </div>

        {/* Double column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main List of security findings */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-lg font-bold text-white mb-4">Active Security & Exposure Findings ({findings.length})</h2>

            <div className="space-y-4">
              {findings.map((finding) => (
                <div
                  id={`finding-card-${finding.id}`}
                  key={finding.id}
                  className="p-5 bg-slate-950 border border-slate-800/80 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition-all relative overflow-hidden"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-3xs font-mono uppercase tracking-wide font-bold ${
                          finding.severity === Severity.Critical ? "bg-red-950 border border-red-900 text-red-400" :
                          finding.severity === Severity.High ? "bg-orange-950 border border-orange-900 text-orange-400" :
                          "bg-yellow-950 border border-yellow-900 text-yellow-400"
                        }`}>
                          {finding.severity}
                        </span>
                        <span className="text-3xs font-mono text-slate-500 capitalize">Type: {finding.finding_type}</span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-200">{finding.summary}</h3>
                      <p className="text-3xs text-slate-500 font-mono">ID: {finding.id} | Score Weight: {finding.score}</p>
                    </div>

                    <div className="flex gap-2">
                      <select
                        id={`finding-status-${finding.id}`}
                        value={finding.status}
                        onChange={(e) => handleUpdateFindingStatus(finding.id, e.target.value as FindingStatus)}
                        className="px-2 py-1 bg-slate-900 border border-slate-800 rounded-lg text-3xs text-slate-300 font-mono"
                      >
                        <option value={FindingStatus.Open}>Open / Unresolved</option>
                        <option value={FindingStatus.Accepted}>Accepted Risk</option>
                        <option value={FindingStatus.Deferred}>Mitigation Planned</option>
                        <option value={FindingStatus.Mitigated}>Mitigated / Resolved</option>
                        <option value={FindingStatus.FalsePositive}>False Positive</option>
                      </select>
                    </div>
                  </div>

                  {/* Actions footer on open findings */}
                  {finding.status === FindingStatus.Open && (
                    <div className="mt-4 pt-3 border-t border-slate-900 flex justify-end">
                      <button
                        id={`remediate-btn-${finding.id}`}
                        onClick={() => {
                          setTargetFindingId(finding.id);
                          setIsActionModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-cyan-600/10 hover:bg-cyan-600/20 border border-cyan-500/20 text-cyan-400 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Remediate Path
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Track active actions & Verification logs */}
          <div className="space-y-6">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-base font-bold text-white mb-4">Remediation Action Planner</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Active tasks assigned to weaken, monitor, or remove risky connections across compartments.
              </p>

              {actions.length === 0 ? (
                <div className="text-center py-8 text-slate-600 text-xs italic font-mono">No active remediation plans scheduled.</div>
              ) : (
                <div className="space-y-4">
                  {actions.map((act) => {
                    const isCompleted = !!act.completed_at;
                    return (
                      <div key={act.id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl relative">
                        <button
                          id={`delete-action-${act.id}`}
                          onClick={() => handleDeleteAction(act.id)}
                          className="absolute top-4 right-4 text-slate-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <span className="text-3xs font-mono bg-slate-950 border border-slate-800 text-indigo-400 px-2 py-0.5 rounded uppercase font-bold">
                          {act.action_type}
                        </span>

                        <h4 className="text-xs font-bold text-slate-200 mt-2 mb-3 leading-relaxed">{act.description}</h4>

                        <div className="flex items-center gap-3 text-3xs font-mono text-slate-500 mb-4">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {act.owner}
                          </span>
                          <span>|</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Due: {act.due_date}
                          </span>
                        </div>

                        {isCompleted ? (
                          <div className="p-2.5 bg-emerald-950/25 border border-emerald-900/40 rounded-lg text-emerald-400 text-3xs leading-relaxed font-mono">
                            <strong>Completed:</strong> {act.verification_evidence_id}
                          </div>
                        ) : (
                          <button
                            id={`complete-action-btn-${act.id}`}
                            onClick={() => {
                              setTargetActionId(act.id);
                              setIsCompleteOpen(true);
                            }}
                            className="w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold uppercase tracking-wider text-3xs rounded-lg transition-colors"
                          >
                            Mark Completed & Attach Evidence
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Create Remediation Action Modal */}
        {isActionModalOpen && (
          <div id="remediation-action-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-8 shadow-2xl relative">
              <button
                id="close-action-modal"
                onClick={() => setIsActionModalOpen(false)}
                className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
                Plan Remediation Action
              </h2>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Establish an actionable plan to neutralize this exposure path. Your audit history captures all mitigations.
              </p>

              <form onSubmit={handleCreateRemediationAction} className="space-y-5 text-sm">
                <div>
                  <label htmlFor="act-type" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    KWRM Action Type
                  </label>
                  <select
                    id="act-type"
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value as ActionType)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none text-slate-200 font-mono text-xs capitalize"
                  >
                    <option value={ActionType.Weaken}>Weaken link (Increase traversal costs)</option>
                    <option value={ActionType.Remove}>Remove connection completely</option>
                    <option value={ActionType.Monitor}>Monitor connectivity pattern</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="act-desc" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Action Description
                  </label>
                  <textarea
                    id="act-desc"
                    required
                    placeholder="e.g. Purge delivery app history; rotate carrier SIM cards to block tracking..."
                    className="w-full h-24 px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500 text-slate-200 text-xs placeholder-slate-700"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="act-owner" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Assignee Owner
                    </label>
                    <input
                      id="act-owner"
                      type="text"
                      className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none text-slate-200 text-xs"
                      value={owner}
                      onChange={(e) => setOwner(e.target.value)}
                    />
                  </div>

                  <div>
                    <label htmlFor="act-due" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Due Date
                    </label>
                    <input
                      id="act-due"
                      type="date"
                      className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none text-slate-200 text-xs font-mono"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  id="submit-action-btn"
                  type="submit"
                  className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold uppercase tracking-wider text-xs rounded-xl transition-colors"
                >
                  Schedule Action Item
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Complete Remediation Action Modal */}
        {isCompleteOpen && (
          <div id="complete-action-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-8 shadow-2xl relative">
              <button
                id="close-complete-modal"
                onClick={() => setIsCompleteOpen(false)}
                className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                Complete Remediation
              </h2>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Provide verification evidence (e.g., screenshot name, system action proof, CDR confirmation code).
              </p>

              <div className="space-y-4">
                <div>
                  <label htmlFor="verification-evidence-input" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Verification Evidence Notes
                  </label>
                  <textarea
                    id="verification-evidence-input"
                    required
                    placeholder="e.g. Account closed; Verified in AT&T portal CDR on 2026-06-22..."
                    className="w-full h-24 px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500 text-slate-200 text-xs placeholder-slate-700"
                    value={verificationEvidence}
                    onChange={(e) => setVerificationEvidence(e.target.value)}
                  />
                </div>

                <button
                  id="confirm-complete-btn"
                  onClick={handleCompleteAction}
                  disabled={!verificationEvidence}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold uppercase tracking-wider text-xs rounded-xl transition-colors"
                >
                  Sign & Mitigate Path
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
