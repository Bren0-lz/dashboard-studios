import { addDays, type BusinessLine, type GroupWeeklySlot } from "@dash/shared";

/**
 * Dados de demonstração do CRM simulado: Pilates e Dança (Studio), Depilação e Limpeza de pele
 * (Estética). Tudo relativo a `today`, para a tela sempre ter atrasos, vendas e leads recentes.
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
  priceInCents: number;
  durationMinutes: number;
  color: string;
  businessLine: BusinessLine;
}

export interface MockPatient {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  cpf: string;
  tags: string[];
}

export interface MockGroup {
  id: string;
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
  name: string;
  status: "active" | "cancelled";
  validFrom: string;
  validUntil?: string;
  monthlyInCents: number;
  totalValueInCents: number;
}

export interface MockReceivable {
  id: string;
  patientId: string;
  planId?: string;
  dueDate: string;
  amountInCents: number;
  status: "open" | "paid";
  paidAt?: string;
}

export interface MockSale {
  id: string;
  sourceId: string;
  sourceType: "plan" | "product" | "service";
  kind: "sale" | "cancellation";
  occurredAt: string;
  patientId: string;
  itemName: string;
  quantity: number;
  amountInCents: number;
  serviceId: string;
  professionalId?: string;
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
  const fullPermissions = ["groups.enroll", "groups.cancel_enrollment", "plans.purchase", "patients.create", "waitlist.manage", "crm.stage", "crm.contacts_create", "crm.convert"];
  const services: MockService[] = [
    { id: id("51", 1), name: "Pilates", active: true, priceInCents: 9000, durationMinutes: 60, color: "#26705f", businessLine: "studio" },
    { id: id("51", 2), name: "Dançaterapia", active: true, priceInCents: 7000, durationMinutes: 60, color: "#c96f50", businessLine: "studio" },
    { id: id("51", 3), name: "Depilação a laser", active: true, priceInCents: 15000, durationMinutes: 30, color: "#b85d53", businessLine: "aesthetics" },
    { id: id("51", 4), name: "Limpeza de pele", active: true, priceInCents: 18000, durationMinutes: 60, color: "#d3a349", businessLine: "aesthetics" },
  ];
  const [pilates, danca, laser, pele] = services as [MockService, MockService, MockService, MockService];
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
      email: `${fullName.split(" ")[0]!.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}${n}@exemplo.com`,
      cpf: String(10000000000 + n * 97),
      tags: n % 5 === 0 ? ["VIP"] : [],
    };
  });
  const groups: MockGroup[] = [
    { id: id("55", 1), name: "Pilates Ter/Qui 18h", active: true, serviceId: pilates.id, professionalId: professionals[0]!.id, roomId: rooms[0]!.id, capacity: 8, weeklySlots: slots([2, 4], "18:00") },
    { id: id("55", 2), name: "Pilates Seg/Qua 7h", active: true, serviceId: pilates.id, professionalId: professionals[0]!.id, roomId: rooms[0]!.id, capacity: 8, weeklySlots: slots([1, 3], "07:00") },
    { id: id("55", 3), name: "Pilates Seg/Qua 19h", active: true, serviceId: pilates.id, professionalId: professionals[1]!.id, roomId: rooms[0]!.id, capacity: 6, weeklySlots: slots([1, 3], "19:00") },
    { id: id("55", 4), name: "Pilates Sáb 9h", active: true, serviceId: pilates.id, professionalId: professionals[1]!.id, roomId: rooms[0]!.id, capacity: 8, weeklySlots: slots([6], "09:00") },
    { id: id("55", 5), name: "Dança Ter/Qui 19h", active: true, serviceId: danca.id, professionalId: professionals[1]!.id, roomId: rooms[1]!.id, capacity: 12, weeklySlots: slots([2, 4], "19:00") },
    { id: id("55", 6), name: "Dança Sex 15h", active: true, serviceId: danca.id, professionalId: professionals[1]!.id, roomId: rooms[1]!.id, capacity: 10, weeklySlots: slots([5], "15:00") },
    { id: id("55", 7), name: "Laser Qua 14h", active: true, serviceId: laser.id, professionalId: professionals[2]!.id, roomId: rooms[2]!.id, capacity: 4, weeklySlots: slots([3], "14:00", 120) },
    { id: id("55", 8), name: "Limpeza de pele Sáb 10h", active: true, serviceId: pele.id, professionalId: professionals[2]!.id, roomId: rooms[2]!.id, capacity: 3, weeklySlots: slots([6], "10:00", 90) },
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
        receivables.push({ id: id("58", counter * 10 + month), patientId: patient.id, planId, dueDate, amountInCents: monthly, status: paid ? "paid" : "open", ...(paid ? { paidAt: dueDate } : {}) });
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
        serviceId: service.id,
        professionalId: group.professionalId,
      });
    }
  });
  // Vendas avulsas recentes (sessões e procedimentos) para o gráfico diário.
  for (let day = 0; day < 75; day += 1) {
    if (day % 3 === 2) continue;
    const service = services[(day * 5) % services.length]!;
    const patient = patients[(day * 11) % patients.length]!;
    counter += 1;
    sales.push({
      id: id("59", counter),
      sourceId: id("60", counter),
      sourceType: "service",
      kind: day % 17 === 0 ? "cancellation" : "sale",
      occurredAt: iso(-day),
      patientId: patient.id,
      itemName: service.name,
      quantity: 1,
      amountInCents: service.priceInCents * (1 + (day % 3)),
      serviceId: service.id,
      professionalId: professionals[(day + 1) % professionals.length]!.id,
    });
  }
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
    users: [
      { id: id("64", 1), fullName: "Aryana Mendes", email: "admin@aryana.com", password: "senha123", role: "admin", modules: ["finance", "groups", "crm"], permissions: fullPermissions },
      { id: id("64", 2), fullName: "Vitória Recepção", email: "vendas@aryana.com", password: "senha123", role: "user", modules: ["groups", "crm"], permissions: ["crm.stage", "crm.contacts_create", "waitlist.manage"] },
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
