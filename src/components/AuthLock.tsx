/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { ShieldAlert, ShieldCheck, KeyRound, Unlock, Database, AlertCircle, RefreshCw } from "lucide-react";
import { deriveMasterKey, generateRandomSalt } from "../utils/crypto";
import { loadEncryptedDatabase, hasDatabaseInStorage, getStoredSalt, getSeedDatabase, saveEncryptedDatabase } from "../utils/database";
import { DecryptedDatabase } from "../types";

interface AuthLockProps {
  onUnlock: (db: DecryptedDatabase, key: CryptoKey, salt: string) => void;
}

export default function AuthLock({ onUnlock }: AuthLockProps) {
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsInitialized(hasDatabaseInStorage());
  }, []);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase) return;

    setLoading(true);
    setError(null);

    try {
      const salt = getStoredSalt();
      if (!salt) {
        throw new Error("Missing key derivation salt. Database may be corrupted.");
      }

      // Derive the 256-bit AES-GCM master key
      const masterKey = await deriveMasterKey(passphrase, salt);
      
      // Attempt to load and decrypt
      const db = await loadEncryptedDatabase(masterKey, salt);
      
      onUnlock(db, masterKey, salt);
    } catch (err: any) {
      console.error(err);
      setError("Incorrect master passphrase. Access denied.");
    } finally {
      setLoading(false);
    }
  };

  const handleInitialize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase) return;
    if (passphrase.length < 8) {
      setError("Passphrase must be at least 8 characters for cryptographic strength.");
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError("Passphrases do not match.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const salt = generateRandomSalt();
      const masterKey = await deriveMasterKey(passphrase, salt);
      
      // Create seed database
      const db = getSeedDatabase();
      
      // Save it encrypted
      await saveEncryptedDatabase(db, masterKey, salt);
      
      onUnlock(db, masterKey, salt);
    } catch (err: any) {
      console.error(err);
      setError("Failed to initialize database: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="auth-lock-container" className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500" />
        
        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-full mb-4">
            {isInitialized ? (
              <ShieldAlert className="w-12 h-12 text-cyan-400 animate-pulse" />
            ) : (
              <KeyRound className="w-12 h-12 text-indigo-400" />
            )}
          </div>
          <h1 className="text-2xl font-bold font-sans tracking-tight text-white mb-2">
            LinkGraph Secure Vault
          </h1>
          <p className="text-sm text-slate-400">
            {isInitialized
              ? "This compartment is encrypted at rest. Provide your master passphrase to project the relationship graph."
              : "Welcome. Initialize your LinkGraph. Enter a high-entropy master passphrase. Your vault will be securely encrypted in-memory and at rest."}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-950/50 border border-red-900/50 rounded-xl text-red-200 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {isInitialized ? (
          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <label htmlFor="passphrase" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Master Passphrase
              </label>
              <input
                id="passphrase"
                type="password"
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent font-sans text-white placeholder-slate-600 text-sm transition-all"
                placeholder="Enter passphrase to unlock..."
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                disabled={loading}
                autoFocus
              />
            </div>

            <button
              id="unlock-btn"
              type="submit"
              disabled={loading || !passphrase}
              className="w-full py-3 px-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl font-medium text-sm transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Deriving Key & Decrypting...
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4" />
                  Unlock Vault
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleInitialize} className="space-y-4">
            <div>
              <label htmlFor="new-passphrase" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Set Master Passphrase
              </label>
              <input
                id="new-passphrase"
                type="password"
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-sans text-white placeholder-slate-600 text-sm transition-all mb-4"
                placeholder="Minimum 8 characters..."
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                disabled={loading}
              />

              <label htmlFor="confirm-passphrase" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Confirm Passphrase
              </label>
              <input
                id="confirm-passphrase"
                type="password"
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-sans text-white placeholder-slate-600 text-sm transition-all"
                placeholder="Re-enter passphrase..."
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                disabled={loading}
              />
            </div>

            <button
              id="initialize-btn"
              type="submit"
              disabled={loading || !passphrase || !confirmPassphrase}
              className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-medium text-sm transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Creating Secure Schema...
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  Initialize Vault & Load Seed
                </>
              )}
            </button>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-slate-800/50 flex items-center justify-between text-xs text-slate-500">
          <span>Security Class: AES-256-GCM</span>
          <span>Zero Knowledge Architecture</span>
        </div>
      </div>
    </div>
  );
}
