/**
 * Ficha do cliente e histórico de pagamentos (PX6 do CRM; PT8 no painel). Formatos copiados de
 * `crm-studios/packages/contracts/src/integrations/external.ts`:
 * - `GET /external/v1/patients/:id` → `{ id, fullName, record? }` (`record` só com `patients.view`);
 * - `GET /external/v1/patients/:id/payments` (só com `finance.view`; sem ela, 403
 *   `FINANCE_ACCESS_DENIED`).
 * Num CRM antes da PX6 as duas rotas respondem 404 e o painel avisa "CRM ainda sem a ficha".
 */
import { z } from "zod";
import type { BusinessLine, GroupEnrollmentStatus, ServiceLineRef } from "./crm-types.js";
import type { LineKey } from "./business-line.js";

export type PaymentMethod = "pix" | "card" | "cash" | "bank_transfer" | "boleto" | "other";

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  pix: "Pix",
  card: "Cartão",
  cash: "Dinheiro",
  bank_transfer: "Transferência",
  boleto: "Boleto",
  other: "Outro",
};

/** Forma de pagamento legível; forma nova do CRM aparece como veio. */
export function paymentMethodLabel(method: string | undefined): string {
  if (!method) return "";
  return paymentMethodLabels[method as PaymentMethod] ?? method;
}

export interface PatientDiscount {
  type: "percentage" | "amount";
  percent?: number;
  amountInCents?: number;
  scope?: "once" | "next" | "permanent";
  charges?: number;
  usedCharges?: number;
}

/** Plano ativo do cliente na ficha. */
export interface ExternalPatientPlan {
  id: string;
  name: string;
  branchId?: string;
  validFrom: string;
  validUntil?: string;
}

/** Turma do cliente (ativo ou na espera da turma). */
export interface ExternalPatientGroup {
  groupId: string;
  groupName: string;
  branchId?: string;
  status: GroupEnrollmentStatus;
}

/** Dados cadastrais e de contato da ficha (só com `patients.view`). Campos sem valor não vêm. */
export interface ExternalPatientRecord {
  recordNumber: string;
  status: "active" | "inactive";
  inactiveAt?: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  cpf?: string;
  birthDate?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  nickname?: string;
  residenceType?: "house" | "apartment" | "condominium" | "commercial" | "other" | "";
  address?: string;
  addressNumber?: string;
  complement?: string;
  buildingName?: string;
  block?: string;
  floor?: string;
  unit?: string;
  referencePoint?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  gender?: "female" | "male" | "other" | "undisclosed" | "";
  guardianName?: string;
  guardianPhone?: string;
  occupation?: string;
  source?: string;
  level?: string;
  clientSince?: string;
  imageConsent?: boolean;
  interests?: string[];
  discount?: PatientDiscount | null;
  /** Etiquetas, com as automáticas do CRM ("Pagamento atrasado" só com Financeiro). */
  tags: string[];
  /** Filiais dos planos ativos e das turmas (o cliente é da rede). */
  branches: { id: string; name: string }[];
  activePlans: ExternalPatientPlan[];
  groups: ExternalPatientGroup[];
  createdAt: string;
}

export interface ExternalPatientDetails {
  id: string;
  fullName: string;
  record?: ExternalPatientRecord;
}

/** Origem da cobrança: plano, comanda (com atendimento), venda de produto ou lançamento manual. */
export const paymentOrigins = ["plan", "tab", "sale", "manual"] as const;
export type PaymentOrigin = (typeof paymentOrigins)[number];

export const paymentOriginLabels: Record<PaymentOrigin, string> = {
  plan: "Plano",
  tab: "Comanda",
  sale: "Venda de produto",
  manual: "Lançamento manual",
};

export const paymentStatuses = ["open", "overdue", "paid", "partially_paid", "cancelled"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  open: "Em aberto",
  overdue: "Vencida",
  paid: "Paga",
  partially_paid: "Parcialmente paga",
  cancelled: "Cancelada",
};

/** Filtro de situação: as do CRM e "Estornada" (teve baixa estornada). */
export const paymentStatusFilters = [...paymentStatuses, "reversed"] as const;
export type PaymentStatusFilter = (typeof paymentStatusFilters)[number];

export const paymentStatusFilterLabels: Record<PaymentStatusFilter, string> = { ...paymentStatusLabels, reversed: "Estornada" };

/** Baixa ou estorno (valor sempre positivo). */
export interface ExternalPaymentEvent {
  id: string;
  occurredAt: string;
  amountInCents: number;
  paymentMethod?: string;
  discountInCents?: number;
}

export interface ExternalPatientPayment {
  id: string;
  branchId?: string;
  origin: PaymentOrigin;
  sourceId?: string;
  description: string;
  installmentNumber: number;
  installmentCount: number;
  dueDate: string;
  amountInCents: number;
  discountInCents: number;
  status: PaymentStatus;
  reversed: boolean;
  paidInCents: number;
  paidAt?: string;
  paymentMethod?: string;
  /** Baixa parcial: a cobrança do saldo que ela gerou. */
  balanceReceivableId?: string;
  /** Saldo de baixa parcial: a cobrança de origem. */
  balanceOfReceivableId?: string;
  payments: ExternalPaymentEvent[];
  reversals: ExternalPaymentEvent[];
  services: ServiceLineRef[];
  productLines: (BusinessLine | null)[];
}

export interface ExternalPatientPayments {
  patientId: string;
  patientName: string;
  referenceDate: string;
  totals: { count: number; amountInCents: number; paidInCents: number; openInCents: number; overdueInCents: number };
  payments: ExternalPatientPayment[];
}

/** `GET /api/patients/:id`: `available: false` = CRM ainda sem a ficha (antes da PX6). */
export type PatientDetailsResponse = ({ available: true } & ExternalPatientDetails) | { available: false };

/** `GET /api/patients/:id/payments`: `available: false` = CRM ainda sem o histórico (antes da PX6). */
export type PatientPaymentsResponse = ({ available: true } & ExternalPatientPayments) | { available: false };

// --- Validação das respostas do CRM ------------------------------------------------------

const line = z.enum(["studio", "aesthetics"]).nullable();
const text = z.string().optional();
const enrollmentStatus = z.enum(["active", "waitlisted", "cancelled"]);

export const patientRecordSchema = z.looseObject({
  recordNumber: z.string(),
  status: z.enum(["active", "inactive"]),
  inactiveAt: text,
  phone: z.string(),
  whatsapp: text,
  email: text,
  cpf: text,
  birthDate: text,
  emergencyContactName: text,
  emergencyContactPhone: text,
  nickname: text,
  residenceType: z.enum(["house", "apartment", "condominium", "commercial", "other", ""]).optional(),
  address: text,
  addressNumber: text,
  complement: text,
  buildingName: text,
  block: text,
  floor: text,
  unit: text,
  referencePoint: text,
  neighborhood: text,
  city: text,
  state: text,
  postalCode: text,
  gender: z.enum(["female", "male", "other", "undisclosed", ""]).optional(),
  guardianName: text,
  guardianPhone: text,
  occupation: text,
  source: text,
  level: text,
  clientSince: text,
  imageConsent: z.boolean().optional(),
  interests: z.array(z.string()).optional(),
  discount: z
    .looseObject({
      type: z.enum(["percentage", "amount"]),
      percent: z.number().optional(),
      amountInCents: z.number().optional(),
      scope: z.enum(["once", "next", "permanent"]).optional(),
      charges: z.number().optional(),
      usedCharges: z.number().optional(),
    })
    .nullable()
    .optional(),
  tags: z.array(z.string()),
  branches: z.array(z.looseObject({ id: z.string(), name: z.string() })),
  activePlans: z.array(z.looseObject({ id: z.string(), name: z.string(), branchId: text, validFrom: z.string(), validUntil: text })),
  groups: z.array(z.looseObject({ groupId: z.string(), groupName: z.string(), branchId: text, status: enrollmentStatus })),
  createdAt: z.string(),
});

export const patientDetailsSchema = z.looseObject({
  id: z.string(),
  fullName: z.string(),
  record: patientRecordSchema.optional(),
});

const paymentEventSchema = z.looseObject({
  id: z.string(),
  occurredAt: z.string(),
  amountInCents: z.number(),
  paymentMethod: text,
  discountInCents: z.number().optional(),
});

export const patientPaymentsSchema = z.looseObject({
  patientId: z.string(),
  patientName: z.string(),
  referenceDate: z.string(),
  totals: z.looseObject({
    count: z.number(),
    amountInCents: z.number(),
    paidInCents: z.number(),
    openInCents: z.number(),
    overdueInCents: z.number(),
  }),
  payments: z.array(
    z.looseObject({
      id: z.string(),
      branchId: text,
      origin: z.enum(paymentOrigins),
      sourceId: text,
      description: z.string(),
      installmentNumber: z.number(),
      installmentCount: z.number(),
      dueDate: z.string(),
      amountInCents: z.number(),
      discountInCents: z.number(),
      status: z.enum(paymentStatuses),
      reversed: z.boolean(),
      paidInCents: z.number(),
      paidAt: text,
      paymentMethod: text,
      balanceReceivableId: text,
      balanceOfReceivableId: text,
      payments: z.array(paymentEventSchema),
      reversals: z.array(paymentEventSchema),
      services: z.array(z.looseObject({ id: z.string(), name: z.string(), businessLine: line.default(null) })),
      productLines: z.array(line),
    }),
  ),
});

// --- Filtros do histórico (BFF e tela) ---------------------------------------------------

/** Lista na query: `a,b` ou o parâmetro repetido (até 20 valores). */
function queryList<T extends z.ZodType<string>>(item: T) {
  return z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) =>
      (Array.isArray(value) ? value : value === undefined ? [] : [value])
        .flatMap((entry) => entry.split(","))
        .map((entry) => entry.trim())
        .filter(Boolean),
    )
    .pipe(z.array(item).max(20, "Filtro com valores demais."));
}

const lineFilterKeys = ["studio", "aesthetics", "other"] as const satisfies readonly LineKey[];
const isoDate = z.iso.date("Informe uma data válida (aaaa-mm-dd).");

/**
 * Filtros do histórico de pagamentos, com os mesmos nomes da API do CRM: `status` (inclui
 * `reversed`), `origin`, `serviceId`, `businessLine` (`studio | aesthetics | other`), período
 * `from`/`to` pelo vencimento (`dateField=due`, padrão) ou pela data das baixas (`dateField=paid`).
 */
export const patientPaymentsQuerySchema = z
  .object({
    status: queryList(z.enum(paymentStatusFilters, "Situação inválida.")),
    origin: queryList(z.enum(paymentOrigins, "Origem inválida.")),
    serviceId: queryList(z.uuid("Serviço inválido.")),
    businessLine: queryList(z.enum(lineFilterKeys, "Linha inválida.")),
    dateField: z.enum(["due", "paid"], "Escolha vencimento ou pagamento.").default("due"),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, { message: "A data inicial precisa ser anterior à final.", path: ["to"] });

export type PatientPaymentsQuery = z.infer<typeof patientPaymentsQuerySchema>;

/** Query do CRM (listas com vírgula), só com os filtros escolhidos. */
export function patientPaymentsCrmQuery(query: PatientPaymentsQuery): Record<string, string | undefined> {
  const list = (values: string[]) => (values.length ? values.join(",") : undefined);
  const period = Boolean(query.from || query.to);
  return {
    status: list(query.status),
    origin: list(query.origin),
    serviceId: list(query.serviceId),
    businessLine: list(query.businessLine),
    dateField: period ? query.dateField : undefined,
    from: query.from,
    to: query.to,
  };
}

/** Rótulos dos campos da ficha, como no CRM (`patientProfileLabels` e a ficha do cliente). */
export const patientRecordLabels = {
  recordNumber: "Prontuário",
  status: "Situação",
  phone: "Telefone",
  whatsapp: "WhatsApp",
  email: "E-mail",
  cpf: "CPF",
  birthDate: "Data de nascimento",
  emergencyContactName: "Contato de emergência",
  emergencyContactPhone: "Telefone de emergência",
  nickname: "Apelido",
  residenceType: "Tipo de residência",
  address: "Endereço",
  addressNumber: "Número",
  complement: "Complemento",
  buildingName: "Edifício/condomínio",
  block: "Bloco/torre/quadra",
  floor: "Andar",
  unit: "Apartamento/casa",
  referencePoint: "Ponto de referência",
  neighborhood: "Bairro",
  city: "Cidade",
  state: "UF",
  postalCode: "CEP",
  gender: "Gênero",
  guardianName: "Nome do responsável",
  guardianPhone: "Telefone do responsável",
  occupation: "Profissão",
  source: "Origem",
  level: "Nível",
  clientSince: "Cliente desde",
  imageConsent: "Autoriza uso de imagem",
  interests: "Interesses",
  discount: "Desconto",
  inactiveAt: "Inativo desde",
} as const;

export const residenceTypeLabels: Record<string, string> = {
  house: "Casa",
  apartment: "Apartamento",
  condominium: "Casa em condomínio",
  commercial: "Comercial",
  other: "Outro",
};

export const genderLabels: Record<string, string> = {
  female: "Feminino",
  male: "Masculino",
  other: "Outro",
  undisclosed: "Prefere não informar",
};
