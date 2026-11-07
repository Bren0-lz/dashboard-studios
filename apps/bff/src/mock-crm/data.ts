import { addDays, type BusinessLine, type ExternalPatientRecord, type GroupWeeklySlot, type PaymentMethod } from "@dash/shared";

/**
 * Dados de demonstração do CRM simulado: Pilates e Dança (Studio), Depilação e Limpeza de pele
 * (Estética), Avaliação funcional sem classificação ("Outros") e Pilates Solo, inativo mas ainda
 * com turma. Produtos de cada linha (um sem classificação), um plano combinado de Pilates + Limpeza
 * de pele e um atraso lançado à mão, sem vínculo. Tudo relativo a `today`, para a tela sempre ter
 * atrasos, vendas e leads recentes.
 */

export interface MockUser {
  id: string;
  fullName: string;
  email: string;
  password: string;
  role: "admin" | "user";
  modules: string[];
  permissions: string[];
}

export interface MockService {
  id: string;
  name: string;
  active: boolean;
  /** Como no CRM (AP1): o serviço não tem preço; este é o valor por sessão do plano avulso. */
  singleSessionPriceInCents: number;
  durationMinutes: number;
  color: string;
  /** PX3: `null` = sem classificação. */
  businessLine: BusinessLine | null;
}

export interface MockPatient {
  id: string;
  fullName: string;
  phone: string;
  /** WhatsApp diferente do telefone (um em cada três clientes da demonstração). */
  whatsapp?: string;
  email?: string;
  cpf: string;
  tags: string[];
  /** Ficha do cliente (PX6): campos do perfil preenchidos (data de nascimento, endereço, contato de emergência…). */
  profile?: Partial<Omit<ExternalPatientRecord, "recordNumber" | "status" | "phone" | "whatsapp" | "email" | "cpf" | "tags" | "branches" | "activePlans" | "groups" | "createdAt">>;
  status?: "active" | "inactive";
  createdAt?: string;
}

export interface MockGroup {
  id: string;
  branchId: string;
  name: string;
  active: boolean;
  serviceId: string;
  professionalId: string;
  roomId: string;
  capacity: number;
  weeklySlots: GroupWeeklySlot[];
}

export interface MockEnrollment {
  id: string;
  groupId: string;
  patientId: string;
  status: "active" | "waitlisted" | "cancelled";
  enrolledAt: string;
  startsOn: string;
}

export interface MockPlan {
  id: string;
  patientId: string;
  serviceId: string;
  /** Outros serviços do plano (plano combinado). */
  extraServiceIds?: string[];
  name: string;
  status: "active" | "cancelled";
  validFrom: string;
  validUntil?: string;
  monthlyInCents: number;
  totalValueInCents: number;
}

/** Baixa ou estorno de uma cobrança (histórico de pagamentos, PX6). */
export interface MockPaymentEvent {
  id: string;
  kind: "payment" | "reversal";
  occurredAt: string;
  amountInCents: number;
  paymentMethod?: PaymentMethod;
  discountInCents?: number;
}

export interface MockReceivable {
  id: string;
  patientId: string;
  planId?: string;
  dueDate: string;
  amountInCents: number;
  /** `cancelled`: venda/comanda cancelada (com a baixa estornada). */
  status: "open" | "paid" | "cancelled";
  paidAt?: string;
  /** Desconto dado na baixa. */
  discountInCents?: number;
  /** Linhas dos produtos da comanda cobrada por esta parcela (PX5; `null` = sem classificação). */
  productLines?: (BusinessLine | null)[];
  /**
   * Histórico (PX6). Sem plano: `tab` (comanda com atendimento), `sale` (comanda só com produtos) ou
   * `manual`; sem o campo, `sale` quando há produto e `manual` quando não há.
   */
  origin?: "tab" | "sale" | "manual";
  /** Serviços atendidos na comanda. */
  serviceIds?: string[];
  /** Comanda de origem. */
  sourceId?: string;
  description?: string;
  paymentMethod?: PaymentMethod;
  /** Desconto do cliente na cobrança. */
  customerDiscountInCents?: number;
  /** Saldo de baixa parcial: a cobrança de origem (origem, serviços e produtos vêm dela). */
  balanceOf?: string;
  /** Baixas e estornos; sem o campo, a cobrança paga tem uma baixa no `paidAt` com o valor inteiro. */
  events?: MockPaymentEvent[];
}

export interface MockSale {
  id: string;
  sourceId: string;
  /** `service` só em comanda antiga (o CRM não vende mais serviço). */
  sourceType: "plan" | "product" | "service";
  /** Plano avulso (uma sessão de um serviço). */
  planKind?: "single";
  kind: "sale" | "cancellation";
  occurredAt: string;
  patientId: string;
  itemName: string;
  quantity: number;
  amountInCents: number;
  /** Serviços do plano (ou o serviço da comanda antiga); vazio em produto. */
  serviceIds: string[];
  /** Venda de produto: linha do produto (`null` = sem classificação). */
  productLine?: BusinessLine | null;
  professionalId?: string;
  /** Desconto do cliente na venda (`amountInCents` já vem com ele abatido). */
  customerDiscountInCents?: number;
}

export interface MockWaitlistEntry {
  id: string;
  patientId: string;
  serviceId: string;
  status: "waiting" | "contacted" | "served" | "cancelled";
  notes: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface MockLead {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  source: string;
  interest: string;
  stage: string;
  lostReason?: string;
  convertedPatientId?: string;
  createdAt: string;
  updatedAt: string;
  lastContactAt?: string;
  openTasks: number;
  overdueTasks: number;
  contactMethod?: string;
}

export interface MockPlanTemplate {
  id: string;
  name: string;
  active: boolean;
  totalValueInCents: number;
  services: { serviceId: string; totalSessions: number; totalValueInCents: number; sessionsPerWeek?: number | null }[];
  planType: "monthly" | "quarterly" | "single";
  kind: "recurring" | "fixed_package" | "single";
  maxInstallments: number | null;
}

export interface MockState {
  clinic: { id: string; name: string };
  branches: { id: string; name: string; active: boolean; isDefault: boolean }[];
  users: MockUser[];
  services: MockService[];
  professionals: { id: string; fullName: string; active: boolean; color: string }[];
  rooms: { id: string; name: string }[];
  patients: MockPatient[];
  groups: MockGroup[];
  enrollments: MockEnrollment[];
  plans: MockPlan[];
  receivables: MockReceivable[];
  sales: MockSale[];
  waitlist: MockWaitlistEntry[];
  leads: MockLead[];
  leadStages: { stage: string; label: string; kind: "open" | "won" | "lost" }[];
  planTemplates: MockPlanTemplate[];
  /** Último contato de cobrança por cliente (aaaa-mm-dd). */
  chargeContacts: Record<string, string>;
}

const id = (prefix: string, n: number) => `00000000-0000-4000-8000-${prefix}${String(n).padStart(12 - prefix.length, "0")}`;

const firstNames = ["Maria", "Ana", "Juliana", "Fernanda", "Camila", "Patrícia", "Beatriz", "Larissa", "Renata", "Carla", "Aline", "Bruna", "Letícia", "Vanessa", "Gabriela", "Luciana", "Tatiane", "Priscila", "Roberta", "Daniela", "Cristina", "Simone", "Paula", "Mariana", "Helena", "Joana", "Sofia", "Clara", "Lívia", "Bianca", "Marcos", "Rafael", "Pedro", "Lucas", "Thiago", "André"];
const lastNames = ["Souza", "Oliveira", "Santos", "Lima", "Pereira", "Costa", "Ferreira", "Almeida", "Ribeiro", "Carvalho", "Gomes", "Martins", "Rocha", "Barbosa", "Araújo", "Mendes"];

function slots(weekdays: number[], start: string, minutes = 60): GroupWeeklySlot[] {
  const [h, m] = start.split(":").map(Number);
  const endMinutes = (h ?? 0) * 60 + (m ?? 0) + minutes;
  const end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  return weekdays.map((weekday) => ({ weekday, startTime: start, endTime: end }));
}

export function createDemoState(today: string): MockState {
  const iso = (days: number) => `${addDays(today, days)}T13:00:00.000Z`;
  const fullPermissions = ["patients.view", "groups.enroll", "groups.cancel_enrollment", "plans.purchase", "patients.create", "waitlist.manage", "crm.stage", "crm.contacts_create", "crm.convert"];
  const services: MockService[] = [
    { id: id("51", 1), name: "Pilates", active: true, singleSessionPriceInCents: 9000, durationMinutes: 60, color: "#26705f", businessLine: "studio" },
    { id: id("51", 2), name: "Dançaterapia", active: true, singleSessionPriceInCents: 7000, durationMinutes: 60, color: "#c96f50", businessLine: "studio" },
    { id: id("51", 3), name: "Depilação a laser", active: true, singleSessionPriceInCents: 15000, durationMinutes: 30, color: "#b85d53", businessLine: "aesthetics" },
    { id: id("51", 4), name: "Limpeza de pele", active: true, singleSessionPriceInCents: 18000, durationMinutes: 60, color: "#d3a349", businessLine: "aesthetics" },
    { id: id("51", 5), name: "Avaliação funcional", active: true, singleSessionPriceInCents: 12000, durationMinutes: 45, color: "#6d7a8c", businessLine: null },
    { id: id("51", 6), name: "Pilates Solo", active: false, singleSessionPriceInCents: 8000, durationMinutes: 60, color: "#4c8a6f", businessLine: "studio" },
  ];
  const [pilates, danca, laser, pele, avaliacao, solo] = services as [MockService, MockService, MockService, MockService, MockService, MockService];
  const professionals = [
    { id: id("52", 1), fullName: "Aryana Mendes", active: true, color: "#26705f" },
    { id: id("52", 2), fullName: "Bruno Castro", active: true, color: "#c96f50" },
    { id: id("52", 3), fullName: "Carla Nogueira", active: true, color: "#b85d53" },
  ];
  const rooms = [
    { id: id("53", 1), name: "Sala Reformer" },
    { id: id("53", 2), name: "Sala de Dança" },
    { id: id("53", 3), name: "Sala Estética" },
  ];
  const patients: MockPatient[] = Array.from({ length: 48 }, (_, index) => {
    const n = index + 1;
    const fullName = `${firstNames[index % firstNames.length]} ${lastNames[(index * 7) % lastNames.length]}`;
    return {
      id: id("54", n),
      fullName,
      phone: `119${String(80000000 + n * 1373).slice(0, 8)}`,
      ...(n % 3 === 0 ? { whatsapp: `119${String(70000000 + n * 911).slice(0, 8)}` } : {}),
      email: `${fullName.split(" ")[0]!.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}${n}@exemplo.com`,
      cpf: String(10000000000 + n * 97),
      tags: n % 5 === 0 ? ["VIP"] : [],
    };
  });
  const branches = [
    { id: id("51", 1), name: "Centro", active: true, isDefault: true },
    { id: id("51", 2), name: "Barra", active: true, isDefault: false },
  ];
  const groups: MockGroup[] = [
    { id: id("55", 1), branchId: branches[0]!.id, name: "Pilates Ter/Qui 18h", active: true, serviceId: pilates.id, professionalId: professionals[0]!.id, roomId: rooms[0]!.id, capacity: 8, weeklySlots: slots([2, 4], "18:00") },
    { id: id("55", 2), branchId: branches[0]!.id, name: "Pilates Seg/Qua 7h", active: true, serviceId: pilates.id, professionalId: professionals[0]!.id, roomId: rooms[0]!.id, capacity: 8, weeklySlots: slots([1, 3], "07:00") },
    { id: id("55", 3), branchId: branches[0]!.id, name: "Pilates Seg/Qua 19h", active: true, serviceId: pilates.id, professionalId: professionals[1]!.id, roomId: rooms[0]!.id, capacity: 6, weeklySlots: slots([1, 3], "19:00") },
    { id: id("55", 4), branchId: branches[1]!.id, name: "Pilates Sáb 9h", active: true, serviceId: pilates.id, professionalId: professionals[1]!.id, roomId: rooms[0]!.id, capacity: 8, weeklySlots: slots([6], "09:00") },
    { id: id("55", 5), branchId: branches[0]!.id, name: "Dança Ter/Qui 19h", active: true, serviceId: danca.id, professionalId: professionals[1]!.id, roomId: rooms[1]!.id, capacity: 12, weeklySlots: slots([2, 4], "19:00") },
    { id: id("55", 6), branchId: branches[1]!.id, name: "Dança Sex 15h", active: true, serviceId: danca.id, professionalId: professionals[1]!.id, roomId: rooms[1]!.id, capacity: 10, weeklySlots: slots([5], "15:00") },
    { id: id("55", 7), branchId: branches[0]!.id, name: "Laser Qua 14h", active: true, serviceId: laser.id, professionalId: professionals[2]!.id, roomId: rooms[2]!.id, capacity: 4, weeklySlots: slots([3], "14:00", 120) },
    { id: id("55", 8), branchId: branches[1]!.id, name: "Limpeza de pele Sáb 10h", active: true, serviceId: pele.id, professionalId: professionals[2]!.id, roomId: rooms[2]!.id, capacity: 3, weeklySlots: slots([6], "10:00", 90) },
    // Turma de serviço inativo: some de `/services`, mas continua na lista de turmas com a linha.
    { id: id("55", 9), branchId: branches[0]!.id, name: "Pilates Solo Sex 10h", active: true, serviceId: solo.id, professionalId: professionals[0]!.id, roomId: rooms[0]!.id, capacity: 6, weeklySlots: slots([5], "10:00") },
  ];
  // Inscritos por turma (ativos) e lista de espera da turma.
  const layout: [number, number][] = [
    [8, 3], // Ter/Qui 18h: cheia com fila
    [5, 0],
    [6, 2], // Seg/Qua 19h: cheia com fila
    [2, 0], // Sáb 9h: deficitária
    [9, 0],
    [3, 0],
    [3, 1],
    [1, 0],
    [2, 0],
  ];
  const enrollments: MockEnrollment[] = [];
  const plans: MockPlan[] = [];
  const receivables: MockReceivable[] = [];
  const sales: MockSale[] = [];
  let patientCursor = 0;
  let counter = 0;
  layout.forEach(([active, waiting], groupIndex) => {
    const group = groups[groupIndex]!;
    const service = services.find((item) => item.id === group.serviceId)!;
    for (let i = 0; i < active + waiting; i += 1) {
      const patient = patients[patientCursor % patients.length]!;
      patientCursor += 1;
      counter += 1;
      const isActive = i < active;
      enrollments.push({
        id: id("56", counter),
        groupId: group.id,
        patientId: patient.id,
        status: isActive ? "active" : "waitlisted",
        enrolledAt: iso(-90 + counter),
        startsOn: addDays(today, -90 + counter),
      });
      if (!isActive) continue;
      const monthly = service.businessLine === "studio" ? (group.weeklySlots.length > 1 ? 32000 : 18000) : 26000;
      const planId = id("57", counter);
      const validFrom = addDays(today, -60 + (counter % 20));
      const validUntil = addDays(today, counter % 6 === 0 ? 4 + (counter % 9) : 90 + counter);
      plans.push({ id: planId, patientId: patient.id, serviceId: service.id, name: `${service.name} ${group.weeklySlots.length}x/semana`, status: "active", validFrom, validUntil, monthlyInCents: monthly, totalValueInCents: monthly * 3 });
      for (let month = 0; month < 3; month += 1) {
        const dueDate = addDays(validFrom, month * 30 + 5);
        const overdueCase = counter % 4 === 1 && month === 1;
        const paid = !overdueCase && dueDate < today;
        receivables.push({
          id: id("58", counter * 10 + month),
          patientId: patient.id,
          planId,
          dueDate,
          amountInCents: monthly,
          status: paid ? "paid" : "open",
          ...(paid ? { paidAt: dueDate } : {}),
          ...(paid && counter % 5 === 0 ? { discountInCents: 1_000 } : {}),
        });
      }
      sales.push({
        id: id("59", counter),
        sourceId: planId,
        sourceType: "plan",
        kind: "sale",
        occurredAt: `${validFrom}T14:00:00.000Z`,
        patientId: patient.id,
        itemName: `${service.name} ${group.weeklySlots.length}x/semana`,
        quantity: 1,
        amountInCents: monthly * 3,
        serviceIds: [service.id],
        professionalId: group.professionalId,
      });
    }
  });
  // Planos avulsos recentes (uma sessão do serviço, vendidos no agendamento) para o gráfico diário.
  for (let day = 0; day < 75; day += 1) {
    if (day % 3 === 2) continue;
    const service = [pilates, danca, laser, pele][(day * 5) % 4]!;
    const patient = patients[(day * 11) % patients.length]!;
    counter += 1;
    sales.push({
      id: id("59", counter),
      sourceId: id("60", counter),
      sourceType: "plan",
      planKind: "single",
      kind: day % 17 === 0 ? "cancellation" : "sale",
      occurredAt: iso(-day),
      patientId: patient.id,
      itemName: service.name,
      quantity: 1,
      amountInCents: service.singleSessionPriceInCents * (1 + (day % 3)),
      serviceIds: [service.id],
      professionalId: professionals[(day + 1) % professionals.length]!.id,
      ...(day % 4 === 0 && day % 17 !== 0 ? { customerDiscountInCents: 1_500 } : {}),
    });
  }
  // Plano combinado (Pilates + Limpeza de pele): uma venda nas duas linhas, com parcela vencida.
  const comboPatient = patients[44]!;
  const comboPlanId = id("57", 900);
  const comboFrom = addDays(today, -20);
  plans.push({ id: comboPlanId, patientId: comboPatient.id, serviceId: pilates.id, extraServiceIds: [pele.id], name: "Combo Pilates + Limpeza de pele", status: "active", validFrom: comboFrom, validUntil: addDays(today, 70), monthlyInCents: 50000, totalValueInCents: 50000 });
  receivables.push({ id: id("58", 9000), patientId: comboPatient.id, planId: comboPlanId, dueDate: addDays(today, -10), amountInCents: 50000, status: "open" });
  sales.push({ id: id("59", 900), sourceId: comboPlanId, sourceType: "plan", kind: "sale", occurredAt: `${comboFrom}T14:00:00.000Z`, patientId: comboPatient.id, itemName: "Combo Pilates + Limpeza de pele", quantity: 1, amountInCents: 50000, serviceIds: [pilates.id, pele.id], professionalId: professionals[0]!.id });
  // Avaliação funcional (serviço sem classificação) em plano avulso e produtos de cada linha, vendidos no mês.
  sales.push({ id: id("59", 901), sourceId: id("60", 901), sourceType: "plan", planKind: "single", kind: "sale", occurredAt: iso(-3), patientId: patients[30]!.id, itemName: avaliacao.name, quantity: 1, amountInCents: avaliacao.singleSessionPriceInCents, serviceIds: [avaliacao.id], professionalId: professionals[0]!.id });
  // Serviço de comanda antiga (antes de o CRM deixar de vender serviço): o CRM ainda o envia como "service".
  sales.push({ id: id("59", 902), sourceId: id("60", 902), sourceType: "service", kind: "sale", occurredAt: iso(-40), patientId: patients[31]!.id, itemName: avaliacao.name, quantity: 1, amountInCents: avaliacao.singleSessionPriceInCents, serviceIds: [avaliacao.id], professionalId: professionals[0]!.id });
  const products: [string, BusinessLine | null, number][] = [
    ["Meia antiderrapante", "studio", 3500],
    ["Óleo corporal", "aesthetics", 6900],
    ["Vale-presente", null, 10000],
  ];
  products.forEach(([name, line, price], index) =>
    sales.push({ id: id("59", 910 + index), sourceId: id("65", index + 1), sourceType: "product", kind: "sale", occurredAt: iso(-(index + 1)), patientId: patients[20 + index]!.id, itemName: name, quantity: 1, amountInCents: price, serviceIds: [], productLine: line }),
  );
  // Comanda de produto sem classificação vencida (só "Outros") e parcela lançada à mão, sem vínculo (só "Tudo").
  receivables.push({ id: id("58", 9001), patientId: patients[45]!.id, dueDate: addDays(today, -6), amountInCents: 10000, status: "open", productLines: [null] });
  receivables.push({ id: id("58", 9002), patientId: patients[47]!.id, dueDate: addDays(today, -15), amountInCents: 7000, status: "open" });
  // Histórico de pagamentos variado (PX6) da 1ª aluna de Pilates Ter/Qui 18h: comanda com baixa parcial e o
  // saldo em aberto, venda de produto cancelada com a baixa estornada, comanda estornada que voltou a ficar em
  // aberto e um lançamento manual pago com desconto. As parcelas do plano dela já têm paga e vencida.
  const history = patients[0]!;
  const at = (days: number, hour = "13:00") => `${addDays(today, days)}T${hour}:00.000Z`;
  history.profile = {
    nickname: "Mari",
    birthDate: "1988-04-12",
    emergencyContactName: "João Souza",
    emergencyContactPhone: "11988887777",
    address: "Rua das Flores",
    addressNumber: "120",
    neighborhood: "Centro",
    city: "São Paulo",
    state: "SP",
    postalCode: "01010-000",
    gender: "female",
    occupation: "Professora",
    source: "Indicação",
    clientSince: "2024-03-01",
    imageConsent: true,
    interests: ["Pilates", "Limpeza de pele"],
  };
  history.createdAt = "2024-03-01T12:00:00.000Z";
  receivables.push(
    {
      id: id("58", 9100),
      patientId: history.id,
      origin: "tab",
      sourceId: id("66", 1),
      serviceIds: [pele.id],
      productLines: ["aesthetics"],
      description: "Comanda — Limpeza de pele e Óleo corporal",
      dueDate: addDays(today, -25),
      amountInCents: 14_900,
      status: "paid",
      paidAt: addDays(today, -25),
      paymentMethod: "card",
      events: [{ id: id("67", 1), kind: "payment", occurredAt: at(-25), amountInCents: 14_900, paymentMethod: "card" }],
    },
    {
      id: id("58", 9101),
      patientId: history.id,
      balanceOf: id("58", 9100),
      description: "Saldo — Comanda Limpeza de pele e Óleo corporal",
      dueDate: addDays(today, 5),
      amountInCents: 10_000,
      status: "open",
    },
    {
      id: id("58", 9102),
      patientId: history.id,
      origin: "sale",
      sourceId: id("66", 2),
      productLines: ["studio"],
      description: "Venda — Meia antiderrapante",
      dueDate: addDays(today, -12),
      amountInCents: 3_500,
      status: "cancelled",
      events: [
        { id: id("67", 2), kind: "payment", occurredAt: at(-12), amountInCents: 3_500, paymentMethod: "pix" },
        { id: id("67", 3), kind: "reversal", occurredAt: at(-10), amountInCents: 3_500, paymentMethod: "pix" },
      ],
    },
    {
      id: id("58", 9103),
      patientId: history.id,
      origin: "tab",
      sourceId: id("66", 3),
      serviceIds: [avaliacao.id],
      description: "Comanda — Avaliação funcional",
      dueDate: addDays(today, 3),
      amountInCents: 12_000,
      status: "open",
      events: [
        { id: id("67", 4), kind: "payment", occurredAt: at(-2), amountInCents: 12_000, paymentMethod: "cash" },
        { id: id("67", 5), kind: "reversal", occurredAt: at(-1), amountInCents: 12_000, paymentMethod: "cash" },
      ],
    },
    {
      id: id("58", 9104),
      patientId: history.id,
      origin: "manual",
      description: "Taxa de matrícula",
      dueDate: addDays(today, -80),
      amountInCents: 4_500,
      customerDiscountInCents: 500,
      status: "paid",
      paidAt: addDays(today, -80),
      paymentMethod: "pix",
      discountInCents: 300,
      events: [{ id: id("67", 6), kind: "payment", occurredAt: at(-80), amountInCents: 4_500, paymentMethod: "pix", discountInCents: 300 }],
    },
  );
  const waitlist: MockWaitlistEntry[] = [
    [40, pilates.id, 12, "Prefere à noite"],
    [41, pilates.id, 8, ""],
    [42, danca.id, 20, "Quer turma com a amiga"],
    [43, pele.id, 5, "Pele sensível"],
    [44, laser.id, 30, ""],
    [45, pilates.id, 2, "Só sábado"],
  ].map(([patientIndex, serviceId, daysAgo, notes], index) => ({
    id: id("61", index + 1),
    patientId: patients[patientIndex as number]!.id,
    serviceId: serviceId as string,
    status: index === 1 ? "contacted" : "waiting",
    notes: notes as string,
    createdAt: iso(-(daysAgo as number)),
    updatedAt: iso(-(daysAgo as number)),
    resolvedAt: null,
  }));
  const leadStages = [
    { stage: "new_contact", label: "Novos", kind: "open" as const },
    { stage: "contacted", label: "Em contato", kind: "open" as const },
    { stage: "evaluation", label: "Avaliação", kind: "open" as const },
    { stage: "proposal", label: "Proposta", kind: "open" as const },
    { stage: "won", label: "Ganhos", kind: "won" as const },
    { stage: "lost", label: "Perdidos", kind: "lost" as const },
  ];
  const sources = ["Instagram", "Indicação", "Google", "WhatsApp"];
  const interests = ["Pilates", "Dançaterapia", "Depilação a laser", "Limpeza de pele"];
  const stageCycle = ["new_contact", "contacted", "contacted", "evaluation", "proposal", "won", "lost", "new_contact"];
  const leads: MockLead[] = Array.from({ length: 22 }, (_, index) => {
    const stage = stageCycle[index % stageCycle.length]!;
    const created = -(index * 2 + 1);
    const lastContact = index % 3 === 0 ? undefined : iso(created + 1);
    return {
      id: id("62", index + 1),
      fullName: `${firstNames[(index * 5 + 3) % firstNames.length]} ${lastNames[(index * 3 + 1) % lastNames.length]}`,
      phone: `1198${String(7000000 + index * 4211).slice(0, 7)}`,
      source: sources[index % sources.length]!,
      interest: interests[index % interests.length]!,
      stage,
      ...(stage === "lost" ? { lostReason: index % 2 ? "Preço" : "Horário" } : {}),
      createdAt: iso(created),
      updatedAt: iso(created + 1),
      ...(lastContact ? { lastContactAt: lastContact } : {}),
      openTasks: index % 4 === 0 ? 1 : 0,
      overdueTasks: index % 8 === 0 ? 1 : 0,
      contactMethod: "WhatsApp",
    };
  });
  const planTemplates: MockPlanTemplate[] = [
    { id: id("63", 1), name: "Pilates 2x/semana — mensal", active: true, totalValueInCents: 32000, services: [{ serviceId: pilates.id, totalSessions: 8, totalValueInCents: 32000, sessionsPerWeek: 2 }], planType: "monthly", kind: "recurring", maxInstallments: 1 },
    { id: id("63", 2), name: "Pilates 1x/semana — trimestral", active: true, totalValueInCents: 54000, services: [{ serviceId: pilates.id, totalSessions: 12, totalValueInCents: 54000, sessionsPerWeek: 1 }], planType: "quarterly", kind: "recurring", maxInstallments: 3 },
    { id: id("63", 3), name: "Dança 2x/semana — mensal", active: true, totalValueInCents: 24000, services: [{ serviceId: danca.id, totalSessions: 8, totalValueInCents: 24000, sessionsPerWeek: 2 }], planType: "monthly", kind: "recurring", maxInstallments: 1 },
    { id: id("63", 4), name: "Pacote Laser 4 sessões", active: true, totalValueInCents: 52000, services: [{ serviceId: laser.id, totalSessions: 4, totalValueInCents: 52000 }], planType: "single", kind: "fixed_package", maxInstallments: 4 },
  ];
  return {
    clinic: { id: id("50", 1), name: "Studios Aryana" },
    branches,
    users: [
      { id: id("64", 1), fullName: "Aryana Mendes", email: "admin@aryana.com", password: "senha123", role: "admin", modules: ["finance", "groups", "crm"], permissions: fullPermissions },
      { id: id("64", 2), fullName: "Vitória Recepção", email: "vendas@aryana.com", password: "senha123", role: "user", modules: ["groups", "crm"], permissions: ["crm.stage", "crm.contacts_create", "waitlist.manage"] },
      // Ficha do cliente (PT8): só Clientes (`patients.view`) ou só Financeiro (`finance.view`).
      { id: id("64", 3), fullName: "Paula Cadastro", email: "clientes@aryana.com", password: "senha123", role: "user", modules: ["groups", "patients"], permissions: ["patients.view"] },
      { id: id("64", 4), fullName: "Fábio Financeiro", email: "financeiro@aryana.com", password: "senha123", role: "user", modules: ["groups", "finance"], permissions: ["finance.view"] },
    ],
    services,
    professionals,
    rooms,
    patients,
    groups,
    enrollments,
    plans,
    receivables,
    sales,
    waitlist,
    leads,
    leadStages,
    planTemplates,
    chargeContacts: {},
  };
}
