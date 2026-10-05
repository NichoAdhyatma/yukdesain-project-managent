// YukDesain Studio Portal - Domain Types

// ===== ENUMS =====

export type UserRole = "OWNER" | "DESIGNER";

export type DesignerType = "FULL_TIME" | "FREELANCER";

export type DesignerStatus = "ACTIVE" | "INACTIVE";

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type ProjectStatus =
  | "DRAFT"
  | "BELUM_DIKERJAKAN"
  | "SEDANG_DIKERJAKAN"
  | "SELESAI";

export type PaymentStatus =
  | "UNPAID"
  | "PARTIALLY_PAID"
  | "PAID";

export type LinkStatus =
  | "ACTIVE"
  | "SUBMITTED"
  | "LOCKED"
  | "EXPIRED";

export type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type RevisionStatus = "PENDING" | "APPROVED" | "REJECTED";

// ===== ENTITIES =====

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Designer {
  id: string;
  userId?: string;
  name: string;
  email?: string;
  type: DesignerType;
  status: DesignerStatus;
  avatar?: string;
  payoutRate?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Service {
  id: string;
  code: string; // e.g., "SVC-01"
  name: string;
  description?: string;
  outputFormat?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  id: string;
  clientId: string;
  serviceId: string;
  clientName: string;
  agreedPrice: number;
  orderDate: Date;
  deadline: Date;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  orderId: string;
  designerId?: string;
  status: ProjectStatus;
  priority: Priority;
  deadline?: Date;
  finalSubmittedAt?: Date;   // Designer submitted final work
  finalApprovedAt?: Date;   // Client approved final work
  brief?: Brief;
  deliverables?: Attachment[];
  updates?: ProjectUpdate[];
  revisions?: Revision[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Brief {
  id: string;
  projectId: string;
  responses: BriefResponse[];
  attachments?: Attachment[];
  submittedAt: Date;
}

export interface BriefResponse {
  questionId: string;
  question: string;
  answer: string;
}

export interface ClientLink {
  id: string;
  token: string; // 16-char alphanumeric
  orderId: string;
  status: LinkStatus;
  expiresAt?: Date;
  usedAt?: Date;
  createdAt: Date;
}

export interface ProjectAssignment {
  id: string;
  projectId: string;
  designerId: string;
  designerName: string;
  classification: "FULL_TIME" | "FREELANCER";
  freelancerPayout?: number; // in cents, for freelancer only
  assignedAt: Date;
  assignedBy: string;
}

export interface ProjectUpdate {
  id: string;
  projectId: string;
  progress?: number;
  description: string;
  attachment?: Attachment;
  authorId: string;
  authorName: string;
  createdAt: Date;
}

export interface Revision {
  id: string;
  projectId: string;
  number: 1 | 2 | 3;
  description: string;
  attachments?: Attachment[];
  status: RevisionStatus;
  remainingQuota: number;
  requestedAt: Date;
  handledAt?: Date;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
  caption?: string;
  uploaderId: string;
  uploaderName: string;
  createdAt: Date;
}

export interface Payment {
  id: string;
  orderId: string;
  amount: number;
  date: Date;
  method?: string;
  reference?: string;
  notes?: string;
  recordedBy: string;
  createdAt: Date;
}

export interface Invoice {
  id: string;
  orderId: string;
  invoiceNumber: string;
  items: InvoiceItem[];
  subtotal: number;
  tax?: number;
  total: number;
  status: PaymentStatus;
  issuedAt: Date;
  dueDate?: Date;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ActivityLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  actorName: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// ===== DTOs =====

export interface ClientProjectDTO {
  id: string;
  orderId: string;
  serviceName: string;
  status: ProjectStatus;
  progress?: number;
  latestUpdate?: ProjectUpdate;
  deadline: Date;
  remainingRevisions: number;
}

export interface DesignerAssignmentDTO {
  id: string;
  projectId: string;
  projectName: string;
  serviceName: string;
  deadline: Date;
  status: ProjectStatus;
  priority: Priority;
  assignedAt: Date;
}

export interface DashboardMetrics {
  newOrders: number;
  unassignedProjects: number;
  activeProjects: number;
  inReviewProjects: number;
  revisionProjects: number;
  completedThisMonth: number;
  upcomingDeadlines: Project[];
  outstandingPayments: { count: number; total: number };
  grossIncome: number;
  freelancerExpenses: number;
  netRevenue: number;
}

export interface FinancialRecap {
  month: string;
  grossIncome: number;
  freelancerExpenses: number;
  netRevenue: number;
}
