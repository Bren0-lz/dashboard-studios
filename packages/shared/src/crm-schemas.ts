/**
 * Validação das respostas do CRM no BFF. `looseObject` aceita campos novos (o CRM só acrescenta
 * campos opcionais); um campo obrigatório que sumir ou mudar de tipo derruba a validação e o teste
 * de contrato acusa a mudança.
 */
import { z } from "zod";

const businessLine = z.enum(["studio", "aesthetics"]).optional();
const slot = z.looseObject({ weekday: z.number().int().min(0).max(6), startTime: z.string(), endTime: z.string() });
const enrollmentStatus = z.enum(["active", "waitlisted", "cancelled"]);

export const groupRowSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  active: z.boolean(),
  serviceId: z.string(),
  serviceName: z.string(),
  professionalId: z.string(),
  professionalName: z.string(),
  roomId: z.string(),
  roomName: z.string(),
  schedule: z.string(),
  weeklySlots: z.array(slot),
  capacity: z.number(),
  enrolled: z.number(),
  freeSeats: z.number(),
  waitlistCount: z.number(),
  occupancyPercent: z.number(),
  sessionsPerMonth: z.number(),
  monthlyRevenueInCents: z.number(),
  potentialMonthlyRevenueInCents: z.number(),
  businessLine,
  overdueMembers: z.number().optional(),
  overdueInCents: z.number().optional(),
});

export const groupsOverviewSchema = z.looseObject({
  referenceDate: z.string(),
  totals: z.looseObject({
    groups: z.number(),
    capacity: z.number(),
    enrolled: z.number(),
    freeSeats: z.number(),
    waitlistCount: z.number(),
    occupancyPercent: z.number(),
    monthlyRevenueInCents: z.number(),
    potentialMonthlyRevenueInCents: z.number(),
  }),
  groups: z.array(groupRowSchema),
});

const memberSchema = z.looseObject({
  enrollmentId: z.string(),
  patientId: z.string(),
  patientName: z.string(),
  phone: z.string().optional(),
  email: z.string().optional(),
  status: enrollmentStatus,
  queuePosition: z.number().optional(),
  startsOn: z.string(),
  monthlyInCents: z.number().nullable(),
  overdue: z
    .looseObject({
      amountInCents: z.number(),
      installments: z.number(),
      oldestDueDate: z.string(),
      daysOverdue: z.number(),
    })
    .optional(),
});

export const groupDetailsSchema = groupRowSchema.extend({
  members: z.array(memberSchema),
  waitlist: z.array(memberSchema),
});

export const patientSummarySchema = z.looseObject({
  id: z.string(),
  fullName: z.string(),
  phone: z.string(),
  whatsapp: z.string().optional(),
  email: z.string().optional(),
  tags: z.array(z.string()),
  activePlans: z.array(z.looseObject({ id: z.string(), name: z.string(), validUntil: z.string().optional() })),
  activeGroups: z.array(z.looseObject({ groupId: z.string(), groupName: z.string(), status: enrollmentStatus })),
});

export const waitlistEntrySchema = z.looseObject({
  id: z.string(),
  patientId: z.string(),
  patientName: z.string(),
  patientPhone: z.string(),
  kind: z.enum(["service", "product"]),
  serviceId: z.string().nullable(),
  productId: z.string().nullable(),
  itemName: z.string(),
  status: z.enum(["waiting", "contacted", "served", "cancelled"]),
  notes: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().nullable(),
});

const salesPeriodSchema = z.looseObject({
  from: z.string(),
  to: z.string(),
  grossSalesInCents: z.number(),
  cancelledSalesInCents: z.number(),
  netSalesInCents: z.number(),
  receivedInCents: z.number(),
  attendedPatients: z.number(),
});

export const saleMovementSchema = z.looseObject({
  id: z.string(),
  sourceType: z.enum(["plan", "product", "service"]),
  kind: z.enum(["sale", "cancellation"]),
  occurredAt: z.string(),
  patientId: z.string(),
  patientName: z.string(),
  itemName: z.string(),
  quantity: z.number(),
  amountInCents: z.number(),
  businessLine,
});

export const salesReportSchema = z.looseObject({
  month: z.string(),
  current: salesPeriodSchema,
  previousComparable: salesPeriodSchema,
  changeInCents: z.number(),
  changePercent: z.number().nullable(),
  sales: z.array(saleMovementSchema),
});

export const salesPeriodReportSchema = z.looseObject({
  from: z.string(),
  to: z.string(),
  summary: salesPeriodSchema,
  sales: z.array(saleMovementSchema),
});

export const serviceSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  active: z.boolean(),
  businessLine,
});

export const professionalSchema = z.looseObject({ id: z.string(), fullName: z.string(), active: z.boolean() });

export const leadSchema = z.looseObject({
  id: z.string(),
  fullName: z.string(),
  phone: z.string(),
  source: z.string(),
  interest: z.string(),
  stage: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  openTasks: z.number(),
  overdueTasks: z.number(),
  lastContactAt: z.string().optional(),
});

export const leadBoardSchema = z.looseObject({
  columns: z.array(z.looseObject({ stage: z.string(), total: z.number(), overdue: z.number(), leads: z.array(leadSchema) })),
});

export const leadStagesSchema = z.array(
  z.looseObject({ stage: z.string(), label: z.string(), kind: z.enum(["open", "won", "lost"]) }),
);

const rate = z.looseObject({ name: z.string(), leads: z.number(), won: z.number(), lost: z.number(), conversionRate: z.number() });

export const leadInsightsSchema = z.looseObject({
  total: z.number(),
  open: z.number(),
  won: z.number(),
  lost: z.number(),
  conversionRate: z.number(),
  withoutContact: z.number(),
  sources: z.array(rate),
  lostReasons: z.array(z.looseObject({ name: z.string(), leads: z.number() })),
});

export const overdueReportSchema = z.looseObject({
  referenceDate: z.string(),
  rows: z.array(
    z.looseObject({
      patientId: z.string(),
      patientName: z.string(),
      phone: z.string().optional(),
      groups: z.array(z.looseObject({ groupId: z.string(), groupName: z.string() })),
      amountInCents: z.number(),
      installments: z.number(),
      oldestDueDate: z.string(),
      daysOverdue: z.number(),
      band: z.enum(["1-7", "8-30", "31-60", "60+"]).optional(),
      businessLine,
    }),
  ),
});

export const loginResultSchema = z.looseObject({
  token: z.string().min(1),
  expiresAt: z.string().optional(),
  user: z.looseObject({
    id: z.string(),
    fullName: z.string(),
    email: z.string(),
    role: z.string(),
    modules: z.array(z.string()),
    permissions: z.array(z.string()),
  }),
});

export const apiIndexSchema = z.looseObject({
  version: z.literal("v1"),
  clinic: z.looseObject({ id: z.string(), name: z.string() }),
  key: z.looseObject({ id: z.string(), name: z.string(), scopes: z.array(z.string()) }),
  endpoints: z.array(z.looseObject({ method: z.string(), path: z.string() })),
});

export const enrollmentResultSchema = z.looseObject({
  id: z.string(),
  status: enrollmentStatus,
  queuePosition: z.number().optional(),
});

export const planTemplatesSchema = z.array(
  z.looseObject({
    id: z.string(),
    name: z.string(),
    active: z.boolean(),
    totalValueInCents: z.number(),
    services: z.array(z.looseObject({ serviceId: z.string(), totalSessions: z.number(), totalValueInCents: z.number() })),
  }),
);
