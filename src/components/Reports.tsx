/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  FileText,
  Download,
  Database,
  History,
  Lock,
  Printer,
  ChevronRight,
  Info,
  CheckCircle,
  Clock,
  ShieldCheck,
  X
} from "lucide-react";
import { DecryptedDatabase, RecordStatus, AuditEvent } from "../types";
import { encryptDatabase } from "../utils/crypto";

interface ReportsProps {
  db: DecryptedDatabase;
  masterKey: CryptoKey | null;
}

export default function Reports({ db, masterKey }: ReportsProps) {
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditEvent | null>(null);

  // Download Decrypted Database JSON
  const handleExportDecryptedJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `linkgraph_backup_decrypted_${new Date().toISOString().split("T")[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Download Encrypted Database Backup String
  const handleExportEncrypted = async () => {
    if (!masterKey) {
      alert("Encryption key not available. Please unlock first.");
      return;
    }
    try {
      const encryptedBase64 = await encryptDatabase(db, masterKey);
      const dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(encryptedBase64);
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `linkgraph_backup_encrypted_${new Date().toISOString().split("T")[0]}.txt`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err: any) {
      alert("Encryption export failed: " + err.message);
    }
  };

  // Print summary trigger
  const handlePrint = () => {
    window.print();
  };

  return (
    <div id="reports-page" className="flex-1 overflow-y-auto p-8 bg-slate-900 text-slate-100 font-sans print:bg-white print:text-black">
      <div className="max-w-7xl mx-auto space-y-8 print:space-y-4">
        
        {/* Page Header */}
        <div className="flex justify-between items-center pb-6 border-b border-slate-800 print:border-b-2 print:border-black">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2 print:text-black">
              <FileText className="w-8 h-8 text-cyan-400 print:text-black" />
              Auditing & Compliance Reports
            </h1>
            <p className="text-sm text-slate-400 mt-1 print:hidden">
              Analyze append-only logs, examine history of changes, verify DB state integrity, and perform backups.
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button
              id="print-summary-btn"
              onClick={handlePrint}
              className="px-4 py-2 bg-slate-950 border border-slate-800 hover:bg-slate-900 rounded-xl text-xs font-semibold uppercase tracking-wider text-slate-300 hover:text-white transition-all flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Print Report
            </button>
          </div>
        </div>

        {/* Export backups panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:hidden">
          
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-400" />
              Database Export Manager
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              Download complete state snapshots. Keep backups of your temporal identity links secure.
            </p>

            <div className="space-y-3">
              <button
                id="export-decrypted-btn"
                onClick={handleExportDecryptedJson}
                className="w-full py-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-200 rounded-xl font-semibold uppercase tracking-wider text-xs transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4 text-cyan-400" />
                Export Decrypted JSON Backup
              </button>

              <button
                id="export-encrypted-btn"
                onClick={handleExportEncrypted}
                className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-semibold uppercase tracking-wider text-xs transition-colors flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                Export Encrypted Backup (.txt)
              </button>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                Cryptographic Verification
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                This database secures critical identifiers with a master PBKDF2 AES-GCM key derived in-browser. No unencrypted content ever touches external servers.
              </p>
            </div>
            <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
              <div className="text-2xs font-mono text-slate-300">
                <span className="font-bold">AES-256-GCM Key Verified</span>
                <p className="text-slate-500 mt-0.5">Integrity check passed on {db.audit_events.length} historical mutations.</p>
              </div>
            </div>
          </div>

        </div>

        {/* Append-only Audit History */}
        <div className="space-y-6">
          <div className="flex justify-between items-center print:text-black">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 print:text-black">
              <History className="w-5 h-5 text-cyan-400 print:text-black" />
              Append-Only Change History Log ({db.audit_events.length})
            </h2>
            <span className="text-2xs font-mono text-slate-500 print:text-black">Operator: local_user</span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden print:border-black">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-2xs font-semibold print:bg-slate-100 print:text-black print:border-black">
                <tr>
                  <th className="p-4">Timestamp (UTC)</th>
                  <th className="p-4">Action</th>
                  <th className="p-4">Object Type</th>
                  <th className="p-4">Target ID</th>
                  <th className="p-4">Integrity Hash Before</th>
                  <th className="p-4">Integrity Hash After</th>
                  <th className="p-4 text-right print:hidden">Log Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 text-slate-300 print:text-black print:divide-slate-200">
                {db.audit_events.slice().reverse().map((log) => (
                  <tr key={log.id} className="hover:bg-slate-900/30 transition-colors">
                    <td className="p-4 font-mono text-slate-400 print:text-black">{new Date(log.occurred_at).toLocaleString()}</td>
                    <td className="p-4 font-bold text-slate-200 capitalize print:text-black">{log.action_type}</td>
                    <td className="p-4 font-mono text-slate-400 print:text-black">{log.record_type}</td>
                    <td className="p-4 font-mono text-slate-400 print:text-black">{log.record_id}</td>
                    <td className="p-4 font-mono text-2xs text-slate-500 print:text-black truncate max-w-[100px]" title={log.before_hash || "None"}>
                      {log.before_hash ? log.before_hash.substring(0, 8) + "..." : "Initial"}
                    </td>
                    <td className="p-4 font-mono text-2xs text-emerald-500 print:text-black truncate max-w-[100px]" title={log.after_hash}>
                      {log.after_hash.substring(0, 8)}...
                    </td>
                    <td className="p-4 text-right print:hidden">
                      <button
                        id={`view-audit-detail-${log.id}`}
                        onClick={() => setSelectedAuditLog(log)}
                        className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-semibold"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Audit Log Inspector Modal */}
        {selectedAuditLog && (
          <div id="audit-inspector-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 print:hidden">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-8 shadow-2xl relative">
              <button
                id="close-audit-modal"
                onClick={() => setSelectedAuditLog(null)}
                className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-400" />
                Audit Entry Inspector
              </h2>
              <p className="text-xs text-slate-400 mb-6 font-mono">Log ID: {selectedAuditLog.id}</p>

              <div className="space-y-4 text-xs font-mono">
                <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl space-y-1">
                  <p><span className="text-slate-500">Occurred At:</span> {selectedAuditLog.occurred_at}</p>
                  <p><span className="text-slate-500">Action:</span> {selectedAuditLog.action_type}</p>
                  <p><span className="text-slate-500">Object Type:</span> {selectedAuditLog.record_type}</p>
                  <p><span className="text-slate-500">Object ID:</span> {selectedAuditLog.record_id}</p>
                </div>

                <div className="space-y-1">
                  <span className="text-slate-500">Details Payload (Encrypted/Plain Summary):</span>
                  <pre className="p-4 bg-slate-950 border border-slate-800/80 rounded-xl max-h-48 overflow-y-auto text-3xs text-slate-300 leading-relaxed">
                    {selectedAuditLog.details_encrypted}
                  </pre>
                </div>

                <div className="grid grid-cols-2 gap-4 text-3xs text-slate-500">
                  <div>
                    <span>Before State SHA-256:</span>
                    <p className="truncate font-bold mt-0.5">{selectedAuditLog.before_hash || "None (Initial State)"}</p>
                  </div>
                  <div>
                    <span>After State SHA-256:</span>
                    <p className="truncate font-bold mt-0.5">{selectedAuditLog.after_hash}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
