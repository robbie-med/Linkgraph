/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import AuthLock from "./components/AuthLock";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import Entities from "./components/Entities";
import Relationships from "./components/Relationships";
import Observers from "./components/Observers";
import Communications from "./components/Communications";
import GraphExplorer from "./components/GraphExplorer";
import FindingsRemediation from "./components/FindingsRemediation";
import Reports from "./components/Reports";
import Settings from "./components/Settings";

import { DecryptedDatabase } from "./types";
import { saveEncryptedDatabase } from "./utils/database";

export default function App() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [db, setDb] = useState<DecryptedDatabase | null>(null);
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  // Selected node to highlight in Graph Explorer
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Auto-save: Whenever the database state is updated, we save it encrypted back to localStorage
  const handleUpdateDb = async (updatedDb: DecryptedDatabase) => {
    setDb(updatedDb);
    if (masterKey) {
      try {
        const salt = localStorage.getItem("linkgraph_salt") || "";
        await saveEncryptedDatabase(updatedDb, masterKey, salt);
      } catch (err) {
        console.error("Auto-save failed to encrypt:", err);
      }
    }
  };

  const handleUnlockSuccess = (decryptedDb: DecryptedDatabase, key: CryptoKey) => {
    setDb(decryptedDb);
    setMasterKey(key);
    setIsUnlocked(true);
  };

  const handleLockVault = () => {
    setDb(null);
    setMasterKey(null);
    setIsUnlocked(false);
    setActiveTab("dashboard");
  };

  if (!isUnlocked || !db) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <AuthLock onUnlock={handleUnlockSuccess} />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden font-sans select-none">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLock={handleLockVault}
        findingsCount={db.findings.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {activeTab === "dashboard" && (
          <Dashboard
            db={db}
            setActiveTab={setActiveTab}
            setSelectedNodeId={setSelectedNodeId}
          />
        )}
        {activeTab === "entities" && (
          <Entities
            db={db}
            masterKey={masterKey}
            onUpdateDb={handleUpdateDb}
          />
        )}
        {activeTab === "relationships" && (
          <Relationships
            db={db}
            masterKey={masterKey}
            onUpdateDb={handleUpdateDb}
          />
        )}
        {activeTab === "observers" && (
          <Observers
            db={db}
            masterKey={masterKey}
            onUpdateDb={handleUpdateDb}
            setActiveTab={setActiveTab}
          />
        )}
        {activeTab === "communications" && (
          <Communications
            db={db}
            masterKey={masterKey}
            onUpdateDb={handleUpdateDb}
          />
        )}
        {activeTab === "graph_explorer" && (
          <GraphExplorer
            db={db}
            onUpdateDb={handleUpdateDb}
            selectedNodeId={selectedNodeId}
            setSelectedNodeId={setSelectedNodeId}
          />
        )}
        {activeTab === "findings" && (
          <FindingsRemediation
            db={db}
            masterKey={masterKey}
            onUpdateDb={handleUpdateDb}
          />
        )}
        {activeTab === "reports" && (
          <Reports
            db={db}
            masterKey={masterKey}
          />
        )}
        {activeTab === "settings" && (
          <Settings
            db={db}
            masterKey={masterKey}
            onUpdateDb={handleUpdateDb}
            onLockVault={handleLockVault}
          />
        )}
      </main>
    </div>
  );
}
