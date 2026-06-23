/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  Settings as SettingsIcon,
  Trash2,
  KeyRound,
  Database,
  RefreshCw,
  Lock,
  Unlock,
  AlertTriangle,
  Upload,
  Info
} from "lucide-react";
import { DecryptedDatabase } from "../types";
import { deriveMasterKey } from "../utils/crypto";
import { logAuditEvent, saveEncryptedDatabase, wipeDatabaseFromStorage } from "../utils/database";

interface SettingsProps {
  db: DecryptedDatabase;
  masterKey: CryptoKey | null;
  onUpdateDb: (updatedDb: DecryptedDatabase) => void;
  onLockVault: () => void;
}

export default function Settings({ db, masterKey, onUpdateDb, onLockVault }: SettingsProps) {
  // Passphrase state
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [isChangingPass, setIsChangingPass] = useState(false);

  // Restore state
  const [restoreText, setRestoreText] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);

  // Double verification for wipe
  const [wipeConfirmText, setWipeConfirmText] = useState("");

  const handleChangePassphrase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPass || newPass !== confirmPass) {
      alert("New passphrases do not match.");
      return;
    }

    setIsChangingPass(true);
    try {
      // 1. Derive the new cryptographic key from the current salt
      const salt = localStorage.getItem("linkgraph_salt") || "";
      if (!salt) {
        throw new Error("Missing key derivation salt. Cannot re-key.");
      }
      const newKey = await deriveMasterKey(newPass, salt);

      // 2. Re-encrypt the current DB state using the new key
      await saveEncryptedDatabase(db, newKey, salt);

      // Append security change to audit log
      const updatedDb = { ...db };
      await logAuditEvent(updatedDb, "update", "security_key", "master_key", null, { action: "rotated_master_key" }, newKey);

      onUpdateDb(updatedDb);

      alert("Master passphrase changed successfully! Vault has been re-encrypted.");
      setCurrentPass("");
      setNewPass("");
      setConfirmPass("");
    } catch (err: any) {
      alert("Passphrase change failed: " + err.message);
    } finally {
      setIsChangingPass(false);
    }
  };

  const handleWipeDatabase = () => {
    if (wipeConfirmText !== "WIPE") {
      alert("Please type 'WIPE' to confirm complete purge.");
      return;
    }

    const confirm = window.confirm("Are you absolutely sure? This will delete all encrypted devices, identities, datasets, and historical audit logs. This is irreversible.");
    if (!confirm) return;

    wipeDatabaseFromStorage();
    alert("Database successfully wiped.");
    window.location.reload();
  };

  const handleRestoreDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreText) return;

    const confirm = window.confirm("Restoring this backup will overwrite your current active database. Proceed?");
    if (!confirm) return;

    setIsRestoring(true);
    try {
      // Try to parse as raw decrypted JSON first
      let parsedDb: DecryptedDatabase;
      try {
        parsedDb = JSON.parse(restoreText);
        if (!parsedDb.entities || !parsedDb.relationships || !parsedDb.audit_events) {
          throw new Error("Invalid schema.");
        }

        // If parsed, we have a decrypted JSON, re-encrypt and store
        if (masterKey) {
          const salt = localStorage.getItem("linkgraph_salt") || "";
          await saveEncryptedDatabase(parsedDb, masterKey, salt);
        }
        onUpdateDb(parsedDb);
        alert("Database restored successfully from decrypted backup!");
        setRestoreText("");
      } catch {
        // If parsing fails, treat it as encrypted payload string of iv:ciphertext
        if (restoreText.includes(":")) {
          const [iv, cipherText] = restoreText.trim().split(":");
          if (iv && cipherText) {
            localStorage.setItem("linkgraph_iv", iv);
            localStorage.setItem("linkgraph_db", cipherText);
            alert("Encrypted vault snapshot loaded. Please lock and unlock the vault to verify.");
            onLockVault();
          } else {
            throw new Error("Invalid encrypted format. Must be iv:ciphertext.");
          }
        } else {
          throw new Error("Payload is not a valid decrypted JSON nor encrypted backup string.");
        }
      }
    } catch (err: any) {
      alert("Restore failed: " + err.message);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div id="settings-page" className="flex-1 overflow-y-auto p-8 bg-slate-900 text-slate-100 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Page Header */}
        <div className="pb-6 border-b border-slate-800">
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <SettingsIcon className="w-8 h-8 text-cyan-400" />
            Security & Settings
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage your master encryption keys, verify data vaults, load external backup snapshots, or purge your local storage.
          </p>
        </div>

        {/* Change Passphrase Card */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-cyan-400" />
            Rotated Master Passphrase
          </h2>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Change your password. The system will automatically re-derive a new AES key and re-encrypt the local payload.
          </p>

          <form onSubmit={handleChangePassphrase} className="space-y-4 max-w-md">
            <div>
              <label htmlFor="new-pass-input" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">New Master Passphrase</label>
              <input
                id="new-pass-input"
                type="password"
                required
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500 text-slate-200 text-xs"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="confirm-pass-input" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Confirm New Passphrase</label>
              <input
                id="confirm-pass-input"
                type="password"
                required
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500 text-slate-200 text-xs"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
              />
            </div>

            <button
              id="change-pass-btn"
              type="submit"
              disabled={isChangingPass}
              className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold uppercase tracking-wider text-xs rounded-xl transition-all"
            >
              {isChangingPass ? "Re-encrypting..." : "Change Passphrase"}
            </button>
          </form>
        </div>

        {/* Restore Backup Card */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
            <Upload className="w-5 h-5 text-indigo-400" />
            Restore Database Snapshot
          </h2>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Overwrites the current local database state. Paste a raw decrypted JSON or an encrypted text backup.
          </p>

          <form onSubmit={handleRestoreDatabase} className="space-y-4">
            <textarea
              id="restore-textarea"
              required
              placeholder="Paste backup JSON or encrypted text string here..."
              className="w-full h-32 p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder-slate-700"
              value={restoreText}
              onChange={(e) => setRestoreText(e.target.value)}
            />

            <button
              id="restore-db-btn"
              type="submit"
              disabled={isRestoring || !restoreText}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold uppercase tracking-wider text-xs rounded-xl transition-all"
            >
              {isRestoring ? "Restoring State..." : "Restore Snapshot"}
            </button>
          </form>
        </div>

        {/* Wipe Database Card */}
        <div className="bg-slate-950 border border-red-900/50 rounded-2xl p-6">
          <h2 className="text-base font-bold text-red-400 mb-2 flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-500" />
            Purge Local Database
          </h2>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Completely destroy the current local vault and cryptographic keys. This purges your localStorage immediately.
          </p>

          <div className="p-4 bg-red-950/20 border border-red-900/30 rounded-xl text-xs text-red-300 flex items-center gap-3 mb-6 max-w-xl">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <p>
              Warning: Wipe is irreversible. Make sure you exported an encrypted backup file before performing this step.
            </p>
          </div>

          <div className="flex gap-4 items-center">
            <div className="flex-1 max-w-xs">
              <input
                id="wipe-confirm-input"
                type="text"
                placeholder="Type 'WIPE' to authorize"
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl focus:outline-none text-red-400 text-xs placeholder-slate-600 font-bold tracking-wider"
                value={wipeConfirmText}
                onChange={(e) => setWipeConfirmText(e.target.value)}
              />
            </div>
            <button
              id="wipe-db-btn"
              onClick={handleWipeDatabase}
              className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white font-semibold uppercase tracking-wider text-xs rounded-xl transition-all shrink-0"
            >
              Purge All Data
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
