/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DecryptedDatabase,
  Entity,
  Relationship,
  Identifier,
  Dataset,
  EvidenceItem,
  ImportBatch,
  CommunicationEvent,
  CommunicationRollup,
  Finding,
  RemediationAction,
  AuditEvent,
  DomainId,
  EntityType,
  IdentifierType,
  RecordStatus,
  RelationType,
  Directionality,
  PathRole,
  PersistenceType,
  SourceType,
  ActionType,
  DEFAULT_DOMAINS
} from "../types";
export { DEFAULT_DOMAINS };
import { encryptText, decryptText, computeSHA256, generateRandomSalt } from "./crypto";

// Default configuration/weights
export const DEFAULT_WEIGHTS = {
  // Relation traversal costs
  "publishes": 1,
  "administers": 1,
  "retains": 1,
  "stores": 1,
  "licenses": 2,
  "contains": 1,
  "owns": 1,
  "uses": 1,
  "assigned_to": 1,
  "bills_to": 1,
  "paid_by": 1,
  "provisions": 1,
  "can_access": 1,
  "can_query": 1,
  "can_infer": 4,
  "communicates_with": 3,
  "unverified_manual": 9,
  "shares_recovery_with": 2,
  "same_as": 1
};

export const EMPTY_DATABASE: DecryptedDatabase = {
  entities: [],
  identifiers: [],
  relationships: [],
  datasets: [],
  evidence_items: [],
  import_batches: [],
  communication_events: [],
  communication_rollups: [],
  findings: [],
  remediation_actions: [],
  audit_events: [],
  settings: {
    autoLockTimeoutMinutes: 10,
    weights: DEFAULT_WEIGHTS,
    domainDefinitions: DEFAULT_DOMAINS,
    watchFolderEnabled: false,
    watchFolderPath: "~/linkgraph_watch"
  }
};

/**
 * Creates seed data to showcase the application with a realistic, educational compartment graph.
 */
export function getSeedDatabase(): DecryptedDatabase {
  const db = JSON.parse(JSON.stringify(EMPTY_DATABASE)) as DecryptedDatabase;

  const now = new Date().toISOString();

  // 1. Entities
  const user: Entity = {
    id: "e-operator",
    entity_type: EntityType.Person,
    display_label: "Household Operator",
    domain_id: DomainId.PRIVATE_CORE,
    sensitivity: 9,
    protected: true,
    status: RecordStatus.Active,
    created_at: now,
    updated_at: now,
    created_by: "local_user"
  };

  const employer: Entity = {
    id: "e-work-employer",
    entity_type: EntityType.Organization,
    display_label: "MegaCorp Inc (Employer)",
    domain_id: DomainId.WORK,
    sensitivity: 5,
    protected: false,
    status: RecordStatus.Active,
    created_at: now,
    updated_at: now,
    created_by: "local_user"
  };

  const attCarrier: Entity = {
    id: "e-att",
    entity_type: EntityType.Carrier,
    display_label: "AT&T Mobility (Primary Carrier)",
    domain_id: DomainId.PROVIDER,
    sensitivity: 7,
    protected: false,
    status: RecordStatus.Active,
    created_at: now,
    updated_at: now,
    created_by: "local_user"
  };

  const workEsim: Entity = {
    id: "e-work-esim",
    entity_type: EntityType.SIM,
    display_label: "Work eSIM (AT&T Line)",
    domain_id: DomainId.WORK,
    sensitivity: 6,
    protected: false,
    status: RecordStatus.Active,
    created_at: now,
    updated_at: now,
    created_by: "local_user"
  };

  const personalPhoneNode: Entity = {
    id: "e-personal-phone",
    entity_type: EntityType.PhoneNumber,
    display_label: "Personal Pixel (Secure eSIM)",
    domain_id: DomainId.PRIVATE_CORE,
    sensitivity: 9,
    protected: true,
    status: RecordStatus.Active,
    created_at: now,
    updated_at: now,
    created_by: "local_user"
  };

  const databroker: Entity = {
    id: "e-broker",
    entity_type: EntityType.Observer,
    display_label: "Acme Data Broker (Observer)",
    domain_id: DomainId.OBSERVER,
    sensitivity: 8,
    protected: false,
    status: RecordStatus.Active,
    created_at: now,
    updated_at: now,
    created_by: "local_user"
  };

  const publicRegistry: Entity = {
    id: "e-registry",
    entity_type: EntityType.PublicProfile,
    display_label: "State Professional Licensure Record",
    domain_id: DomainId.PROFESSIONAL_PUBLIC,
    sensitivity: 3,
    protected: false,
    status: RecordStatus.Active,
    created_at: now,
    updated_at: now,
    created_by: "local_user"
  };

  const deliveryService: Entity = {
    id: "e-delivery",
    entity_type: EntityType.Organization,
    display_label: "Express Food Delivery",
    domain_id: DomainId.PUBLIC_INTAKE,
    sensitivity: 4,
    protected: false,
    status: RecordStatus.Active,
    created_at: now,
    updated_at: now,
    created_by: "local_user"
  };

  const hospital: Entity = {
    id: "e-hospital",
    entity_type: EntityType.Organization,
    display_label: "Community Health Hospital",
    domain_id: DomainId.WORK,
    sensitivity: 8,
    protected: false,
    status: RecordStatus.Active,
    created_at: now,
    updated_at: now,
    created_by: "local_user"
  };

  db.entities = [
    user, employer, attCarrier, workEsim, personalPhoneNode, databroker, publicRegistry, deliveryService, hospital
  ];

  // 2. Identifiers
  const idPersonalPhone: Identifier = {
    id: "id-p-1",
    entity_id: "e-personal-phone",
    identifier_type: IdentifierType.Phone,
    normalized_value: "+15550192834",
    display_value_encrypted: "iv-placeholder:enc-value-personal",
    status: RecordStatus.Active,
    created_at: now,
    updated_at: now
  };

  const idWorkPhone: Identifier = {
    id: "id-w-1",
    entity_id: "e-work-esim",
    identifier_type: IdentifierType.Phone,
    normalized_value: "+15554321098",
    display_value_encrypted: "iv-placeholder:enc-value-work",
    status: RecordStatus.Active,
    created_at: now,
    updated_at: now
  };

  db.identifiers = [idPersonalPhone, idWorkPhone];

  // 3. Datasets owned by observers or providers
  const attCdrDataset: Dataset = {
    id: "ds-att-cdr",
    entity_id: "e-att",
    dataset_type: "Carrier CDR (Call Detail Record)",
    source_system: "AT&T Billing/CDR Database",
    retention_class: "7-year statutory",
    contains_sensitive_metadata: true,
    record_count: 50,
    created_at: now,
    updated_at: now
  };

  const brokerHarvestedDataset: Dataset = {
    id: "ds-broker-harvest",
    entity_id: "e-broker",
    dataset_type: "Data Broker Profile Database",
    source_system: "Marketing Scrapes / App Permissions",
    retention_class: "Indefinite commercial",
    contains_sensitive_metadata: true,
    record_count: 5,
    created_at: now,
    updated_at: now
  };

  db.datasets = [attCdrDataset, brokerHarvestedDataset];

  // 4. Relationships (The edges connecting them)
  const rels: Relationship[] = [
    // Operator uses personal phone node
    {
      id: "r-1",
      source_entity_id: "e-operator",
      target_entity_id: "e-personal-phone",
      relation_type: RelationType.uses,
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
    },
    // Operator is employed by employer
    {
      id: "r-2",
      source_entity_id: "e-operator",
      target_entity_id: "e-work-employer",
      relation_type: RelationType.associated_with,
      directionality: Directionality.Bidirectional,
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
    },
    // Employer administers work eSIM
    {
      id: "r-3",
      source_entity_id: "e-work-employer",
      target_entity_id: "e-work-esim",
      relation_type: RelationType.administers,
      directionality: Directionality.Directed,
      path_role: PathRole.Administration,
      confidence: 5,
      intentional: true,
      decision: ActionType.Keep,
      persistence: PersistenceType.Durable,
      evidence_strength: 5,
      created_at: now,
      updated_at: now,
      created_by: "local_user",
      status: RecordStatus.Active
    },
    // AT&T retains the CDR dataset
    {
      id: "r-4",
      source_entity_id: "e-att",
      target_entity_id: "e-work-esim", // AT&T provisions the work eSIM
      relation_type: RelationType.provisions,
      directionality: Directionality.Directed,
      path_role: PathRole.Administration,
      confidence: 5,
      intentional: true,
      decision: ActionType.Keep,
      persistence: PersistenceType.Durable,
      evidence_strength: 5,
      created_at: now,
      updated_at: now,
      created_by: "local_user",
      status: RecordStatus.Active
    },
    // AT&T retains a CDR dataset containing Work eSIM details
    {
      id: "r-5",
      source_entity_id: "e-att",
      target_entity_id: "ds-att-cdr",
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
    },
    // CRITICAL RISK: Unintentional bridge where personal phone was used to contact the Work eSIM/employer
    // Or personal phone communicates with food delivery which links address to data broker
    {
      id: "r-6",
      source_entity_id: "e-personal-phone",
      target_entity_id: "e-delivery",
      relation_type: RelationType.communicates_with,
      directionality: Directionality.Bidirectional,
      path_role: PathRole.Association,
      confidence: 5,
      intentional: false, // Flagged! Unintentional cross-domain link
      decision: "undecided",
      persistence: PersistenceType.Transient,
      evidence_strength: 3,
      created_at: now,
      updated_at: now,
      created_by: "local_user",
      status: RecordStatus.Active
    },
    // Food delivery publishes or sells data to Acme Data Broker
    {
      id: "r-7",
      source_entity_id: "e-delivery",
      target_entity_id: "ds-broker-harvest",
      relation_type: RelationType.licenses,
      directionality: Directionality.Directed,
      path_role: PathRole.Publication,
      confidence: 4,
      intentional: false,
      decision: "undecided",
      persistence: PersistenceType.Durable,
      evidence_strength: 4,
      created_at: now,
      updated_at: now,
      created_by: "local_user",
      status: RecordStatus.Active
    },
    // Broker can infer operator's Private Core details through harvested data!
    {
      id: "r-8",
      source_entity_id: "e-broker",
      target_entity_id: "ds-broker-harvest",
      relation_type: RelationType.can_access,
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
    },
    // Operator is associated with Professional Licensure
    {
      id: "r-9",
      source_entity_id: "e-operator",
      target_entity_id: "e-registry",
      relation_type: RelationType.publishes,
      directionality: Directionality.Directed,
      path_role: PathRole.Publication,
      confidence: 5,
      intentional: true,
      decision: ActionType.Keep,
      persistence: PersistenceType.Durable,
      evidence_strength: 5,
      created_at: now,
      updated_at: now,
      created_by: "local_user",
      status: RecordStatus.Active
    },
    // Historic connection between Professional Public and Private Core (e.g., an old billing address)
    {
      id: "r-10",
      source_entity_id: "e-registry",
      target_entity_id: "e-personal-phone",
      relation_type: RelationType.associated_with,
      directionality: Directionality.Bidirectional,
      path_role: PathRole.Association,
      confidence: 3,
      intentional: false,
      decision: ActionType.Monitor,
      persistence: PersistenceType.Historical, // Faded edge!
      evidence_strength: 2,
      created_at: now,
      updated_at: now,
      created_by: "local_user",
      status: RecordStatus.Active
    }
  ];

  db.relationships = rels;

  return db;
}

/**
 * Append-only Cryptographically-Linked Audit Log implementation.
 */
export async function logAuditEvent(
  db: DecryptedDatabase,
  actionType: string,
  recordType: string,
  recordId: string,
  beforeState: any,
  afterState: any,
  key?: CryptoKey
): Promise<DecryptedDatabase> {
  const beforeJson = JSON.stringify(beforeState || {});
  const afterJson = JSON.stringify(afterState || {});
  const beforeHash = await computeSHA256(beforeJson);
  const afterHash = await computeSHA256(afterJson);

  // Grab the previous audit event's hash to chain them!
  let prevHash = "genesis_block";
  if (db.audit_events && db.audit_events.length > 0) {
    const prevEvent = db.audit_events[db.audit_events.length - 1];
    prevHash = await computeSHA256(JSON.stringify(prevEvent));
  }

  // Details encrypted with derived key if present, otherwise base64 placeholder
  let detailsEncrypted = "UNENCRYPTED_LOG";
  const logDetails = {
    prevHash,
    beforeState,
    afterState,
    timestamp: new Date().toISOString()
  };

  if (key) {
    const encrypted = await encryptText(JSON.stringify(logDetails), key);
    detailsEncrypted = `${encrypted.iv}:${encrypted.cipherText}`;
  } else {
    detailsEncrypted = btoa(JSON.stringify(logDetails));
  }

  const newAudit: AuditEvent = {
    id: `audit-${Math.random().toString(36).substr(2, 9)}`,
    occurred_at: new Date().toISOString(),
    action_type: actionType,
    record_type: recordType,
    record_id: recordId,
    before_hash: beforeHash,
    after_hash: afterHash,
    details_encrypted: detailsEncrypted
  };

  db.audit_events.push(newAudit);
  return db;
}

/**
 * Saves the fully encrypted database JSON block to localStorage.
 */
export async function saveEncryptedDatabase(
  db: DecryptedDatabase,
  key: CryptoKey,
  saltHex: string
): Promise<void> {
  const serialized = JSON.stringify(db);
  const { cipherText, iv } = await encryptText(serialized, key);
  
  // Save salt, iv, and ciphertext
  localStorage.setItem("linkgraph_salt", saltHex);
  localStorage.setItem("linkgraph_iv", iv);
  localStorage.setItem("linkgraph_db", cipherText);
}

/**
 * Loads and decrypts the database from localStorage.
 */
export async function loadEncryptedDatabase(
  key: CryptoKey,
  saltHex: string
): Promise<DecryptedDatabase> {
  const iv = localStorage.getItem("linkgraph_iv");
  const cipherText = localStorage.getItem("linkgraph_db");

  if (!iv || !cipherText) {
    throw new Error("No database found in storage.");
  }

  const decryptedJson = await decryptText(cipherText, iv, key);
  return JSON.parse(decryptedJson) as DecryptedDatabase;
}

/**
 * Verifies if an encrypted database already exists in localStorage.
 */
export function hasDatabaseInStorage(): boolean {
  return !!localStorage.getItem("linkgraph_db") && !!localStorage.getItem("linkgraph_salt");
}

/**
 * Gets the stored salt value.
 */
export function getStoredSalt(): string | null {
  return localStorage.getItem("linkgraph_salt");
}

/**
 * Wipes everything from localStorage (Factory Reset).
 */
export function wipeDatabaseFromStorage(): void {
  localStorage.removeItem("linkgraph_db");
  localStorage.removeItem("linkgraph_salt");
  localStorage.removeItem("linkgraph_iv");
}
