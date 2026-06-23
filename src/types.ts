/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum DomainId {
  PRIVATE_CORE = "PRIVATE_CORE",
  HOUSEHOLD = "HOUSEHOLD",
  WORK = "WORK",
  PROFESSIONAL_PUBLIC = "PROFESSIONAL_PUBLIC",
  PUBLIC_INTAKE = "PUBLIC_INTAKE",
  PROJECTS = "PROJECTS",
  FINANCIAL = "FINANCIAL",
  MILITARY_ADMIN = "MILITARY_ADMIN",
  PROVIDER = "PROVIDER",
  OBSERVER = "OBSERVER",
  UNKNOWN = "UNKNOWN",
  ARCHIVED = "ARCHIVED"
}

export interface DomainDefinition {
  id: DomainId;
  label: string;
  color: string;
  description: string;
}

export const DEFAULT_DOMAINS: DomainDefinition[] = [
  { id: DomainId.PRIVATE_CORE, label: "Private Core", color: "#ef4444", description: "Highly sensitive personal data, secure vaults, inner circle" },
  { id: DomainId.HOUSEHOLD, label: "Household", color: "#f97316", description: "Family members, shared physical utilities, home automation" },
  { id: DomainId.WORK, label: "Work", color: "#3b82f6", description: "Primary employer accounts, communications, official devices" },
  { id: DomainId.PROFESSIONAL_PUBLIC, label: "Professional Public", color: "#06b6d4", description: "Publicly listable registrations, LinkedIn, professional publications" },
  { id: DomainId.PUBLIC_INTAKE, label: "Public Intake", color: "#10b981", description: "Spam targets, delivery services, public forums, throwaway accounts" },
  { id: DomainId.PROJECTS, label: "Projects", color: "#8b5cf6", description: "Secondary ventures, side research, non-work collaborations" },
  { id: DomainId.FINANCIAL, label: "Financial", color: "#eab308", description: "Banks, brokerage accounts, payment processing, tax filings" },
  { id: DomainId.MILITARY_ADMIN, label: "Military / Admin", color: "#1e293b", description: "Government administration, clearances, military duty portals" },
  { id: DomainId.PROVIDER, label: "Provider", color: "#6366f1", description: "Carriers, utility providers, registrars, administrative anchors" },
  { id: DomainId.OBSERVER, label: "Observer", color: "#64748b", description: "Data brokers, advertising trackers, public indexers, threat actors" },
  { id: DomainId.UNKNOWN, label: "Unknown", color: "#a1a1aa", description: "Unclassified compartment or newly imported identifiers" },
  { id: DomainId.ARCHIVED, label: "Archived", color: "#71717a", description: "Retired or inactive records kept only for historical analysis" }
];

export enum EntityType {
  Person = "Person",
  Organization = "Organization",
  Observer = "Observer",
  Carrier = "Carrier",
  MVNO = "MVNO",
  CarrierAccount = "CarrierAccount",
  BillingProfile = "BillingProfile",
  PhoneNumber = "PhoneNumber",
  EmailAddress = "EmailAddress",
  Address = "Address",
  Device = "Device",
  SIM = "SIM",
  CloudTenant = "CloudTenant",
  PasswordManager = "PasswordManager",
  Authenticator = "Authenticator",
  SecurityKey = "SecurityKey",
  CallRouting = "CallRouting",
  Voicemail = "Voicemail",
  WiFiNetwork = "WiFiNetwork",
  Dataset = "Dataset",
  ImportBatch = "ImportBatch",
  PublicProfile = "PublicProfile",
  ProfessionalLicense = "ProfessionalLicense",
  FamilyMember = "FamilyMember",
  Location = "Location",
  PaymentInstrument = "PaymentInstrument",
  MailingArrangement = "MailingArrangement"
}

export enum RecordStatus {
  Active = "active",
  Retired = "retired",
  Planned = "planned",
  Uncertain = "uncertain",
  Archived = "archived"
}

export enum IdentifierType {
  Phone = "phone",
  Email = "email",
  Address = "address",
  AccountId = "account_id",
  Imei = "imei",
  Eid = "eid",
  SimId = "sim_id",
  Url = "url",
  Username = "username",
  PaymentAlias = "payment_alias",
  Other = "other"
}

export enum RelationType {
  owns = "owns",
  uses = "uses",
  assigned_to = "assigned_to",
  uses_identifier = "uses_identifier",
  administers = "administers",
  bills_to = "bills_to",
  paid_by = "paid_by",
  provisions = "provisions",
  retains = "retains",
  stores = "stores",
  publishes = "publishes",
  licenses = "licenses",
  contains = "contains",
  appears_in = "appears_in",
  communicates_with = "communicates_with",
  forwards_to = "forwards_to",
  routes_to = "routes_to",
  shares_recovery_with = "shares_recovery_with",
  recovers = "recovers",
  backs_up = "backs_up",
  syncs_to = "syncs_to",
  shares_contacts_with = "shares_contacts_with",
  shares_calendar_with = "shares_calendar_with",
  shares_cloud_tenant_with = "shares_cloud_tenant_with",
  same_as = "same_as",
  co_travels_with = "co_travels_with",
  co_locates_with = "co_locates_with",
  connects_to = "connects_to",
  registered_at = "registered_at",
  associated_with = "associated_with",
  can_access = "can_access",
  can_query = "can_query",
  can_infer = "can_infer"
}

export enum PathRole {
  Association = "association",
  Access = "access",
  RecordMembership = "record_membership",
  Administration = "administration",
  Publication = "publication",
  Inference = "inference"
}

export enum Directionality {
  Directed = "directed",
  Bidirectional = "bidirectional"
}

export enum PersistenceType {
  Transient = "transient",
  Current = "current",
  Historical = "historical",
  Durable = "durable"
}

export enum SourceType {
  Import = "import",
  Screenshot = "screenshot",
  Manual = "manual",
  PublicRecord = "public_record",
  AccountExport = "account_export",
  CarrierExport = "carrier_export"
}

export enum Severity {
  Low = "low",
  Moderate = "moderate",
  High = "high",
  Critical = "critical"
}

export enum FindingStatus {
  Open = "open",
  Accepted = "accepted",
  Mitigated = "mitigated",
  FalsePositive = "false_positive",
  Deferred = "deferred"
}

export enum ActionType {
  Keep = "keep",
  Weaken = "weaken",
  Remove = "remove",
  Monitor = "monitor"
}

// Database Interfaces
export interface Entity {
  id: string;
  entity_type: EntityType;
  display_label: string;
  domain_id: DomainId;
  sensitivity: number; // 1..10
  protected: boolean;
  status: RecordStatus;
  notes_encrypted?: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  valid_from?: string;
  valid_to?: string;
  last_verified_at?: string;
}

export interface Identifier {
  id: string;
  entity_id: string;
  identifier_type: IdentifierType;
  normalized_value: string;
  display_value_encrypted: string;
  country_code?: string;
  valid_from?: string;
  valid_to?: string;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
}

export interface Relationship {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relation_type: RelationType;
  directionality: Directionality;
  path_role: PathRole;
  confidence: number; // 1..5
  intentional: boolean;
  decision: ActionType | "undecided";
  base_traversal_cost?: number;
  persistence: PersistenceType;
  valid_from?: string;
  valid_to?: string;
  evidence_strength: number; // 1..5
  notes_encrypted?: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  status: RecordStatus;
  last_verified_at?: string;
}

export interface Dataset {
  id: string;
  entity_id: string; // The observer or host entity
  dataset_type: string;
  source_system: string;
  retention_class: string;
  contains_sensitive_metadata: boolean;
  record_count: number;
  import_batch_id?: string;
  created_at: string;
  updated_at: string;
}

export interface EvidenceItem {
  id: string;
  dataset_entity_id: string;
  relationship_id?: string;
  entity_id?: string;
  source_type: SourceType;
  file_path_encrypted?: string;
  content_hash?: string;
  captured_at: string;
  verified_at?: string;
  confidence: number;
  created_at: string;
}

export interface ImportBatch {
  id: string;
  source_type: string;
  source_label: string;
  source_account_entity_id?: string;
  file_hash: string;
  parser_version: string;
  imported_at: string;
  imported_by: string;
  record_count: number;
  duplicate_count: number;
  error_count: number;
  status: "success" | "partial" | "failed";
  raw_file_retained: boolean;
}

export interface CommunicationEvent {
  id: string;
  import_batch_id: string;
  source_identifier_id: string;
  peer_identifier_id: string;
  occurred_at_utc: string;
  occurred_at_local: string;
  direction: "inbound" | "outbound";
  channel: "call" | "sms" | "mms";
  duration_seconds?: number;
  carrier_record_id?: string;
  event_hash: string;
}

export interface CommunicationRollup {
  id: string;
  source_identifier_id: string;
  peer_identifier_id: string;
  time_window: string; // "all", "last_30", etc.
  calls_in: number;
  calls_out: number;
  sms_in: number;
  sms_out: number;
  mms_in: number;
  mms_out: number;
  total_duration_seconds: number;
  distinct_active_days: number;
  first_seen: string;
  last_seen: string;
  reciprocity_score: number; // 0..100
  interaction_strength_score: number; // 0..100
  cross_domain_count: number;
  classification: "family" | "professional" | "institutional" | "vendor" | "public" | "unknown" | "blocked" | "sensitive";
}

export interface Finding {
  id: string;
  finding_type: "shortest_bad_path" | "cross_domain_exposure" | "unapproved_bridge" | "risky_communications";
  observer_entity_id?: string;
  source_entity_id: string;
  target_entity_id: string;
  path_json_encrypted?: string; // Encrypted serialization of path
  severity: Severity;
  score: number;
  status: FindingStatus;
  summary: string;
  created_at: string;
  updated_at: string;
}

export interface RemediationAction {
  id: string;
  finding_id: string;
  action_type: ActionType;
  description: string;
  owner: string;
  due_date: string;
  completed_at?: string;
  verification_evidence_id?: string;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  occurred_at: string;
  action_type: string; // "create" | "update" | "delete" | "import" | "export" | "lock" | "unlock"
  record_type: string;
  record_id: string;
  before_hash: string;
  after_hash: string;
  details_encrypted: string;
}

// Global App State
export interface DecryptedDatabase {
  entities: Entity[];
  identifiers: Identifier[];
  relationships: Relationship[];
  datasets: Dataset[];
  evidence_items: EvidenceItem[];
  import_batches: ImportBatch[];
  communication_events: CommunicationEvent[];
  communication_rollups: CommunicationRollup[];
  findings: Finding[];
  remediation_actions: RemediationAction[];
  audit_events: AuditEvent[];
  settings: {
    autoLockTimeoutMinutes: number;
    weights: { [key: string]: number };
    domainDefinitions: DomainDefinition[];
    watchFolderEnabled: boolean;
    watchFolderPath: string;
  };
}

export interface BackupData {
  database: DecryptedDatabase;
  evidenceFiles: { [filename: string]: string }; // filename -> base64 AES encrypted content
  manifest: {
    schemaVersion: string;
    checksum: string;
    createdAt: string;
  };
}
