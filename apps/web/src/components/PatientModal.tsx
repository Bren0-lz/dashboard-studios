import { CalendarDays, CreditCard, Layers, MapPin, Phone, Tag, User, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  formatMoney,
  formatPhone,
  genderLabels,
  initials,
  lineKeyLabels,
  lineKeys,
  paymentMethodLabel,
  paymentOriginLabels,
  paymentOrigins,
  paymentStatusFilterLabels,
  paymentStatusFilters,
  plural,
  residenceTypeLabels,
  shortDate,
  type ExternalPatientPayment,
  type ExternalPatientRecord,
  type FiltersResponse,
  type LineKey,
  type PatientDetailsResponse,
  type PatientPaymentsResponse,
} from "@dash/shared";
import { useSession } from "../lib/session";
import { useRemote } from "../lib/useRemote";
import { EmptyState, ErrorBanner, LinePill, Modal, Notice, Skeleton } from "./ui";

/** Cliente aberto pelo nome na lista de matriculados (tabela) ou no modal da turma. */
export interface PatientRef {
  id: string;
  name: string;
}

/**
 * Quem pode abrir a ficha: com acesso a Clientes (`patients.view`) ou ao Financeiro (`finance.view`).
 * Sem nenhum dos dois o nome fica só texto, como no CRM (sem a permissão, só o nome).
 */
export function canOpenPatient(can: { seePatients: boolean; seeFinance: boolean }): boolean {
  return can.seePatients || can.seeFinance;
}

const crmWithoutRecord = "O CRM ainda não tem a ficha do cliente pelo painel. Depois da atualização do CRM, os dados cadastrais e o histórico de pagamentos aparecem aqui.";

/** "12/04/1988" a partir de aaaa-mm-dd (ou ISO completo). */
function fullDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : iso;
}

/**
 * Ficha do cliente (PT8), num modal sobre a turma: dados do CRM (só com `patients.view`) e o
 * histórico de pagamentos com filtros (só com `finance.view`). Com só uma das permissões, a outra
 * parte mostra um aviso; fechar volta para a mesma lista, com os mesmos filtros.
 */
export function PatientModal({ patient, onClose }: { patient: PatientRef; onClose: () => void }) {
  const { session } = useSession();
  const details = useRemote<PatientDetailsResponse>(`/patients/${encodeURIComponent(patient.id)}`);
  const data = details.data;
  const unavailable = data?.available === false;
  const record = data?.available ? data.record : undefined;
  return (
    <Modal
      title={patient.name}
      subtitle={record ? <PatientHeadline record={record} /> : undefined}
      leading={
        <span className="avatar avatar-lg" aria-hidden>
          {initials(patient.name)}
        </span>
      }
      onClose={onClose}
      size="lg"
    >
      {details.error ? <ErrorBanner message={details.error} onRetry={details.reload} /> : null}
      {unavailable ? (
        <Notice tone="warning">{crmWithoutRecord}</Notice>
      ) : (
        <>
          <section className="patient-section" aria-label="Dados do cliente">
            <h3 className="section-title">
              <UserRound size={16} aria-hidden /> Dados do cliente
            </h3>
            {!session.can.seePatients ? (
              <Notice>Sem acesso a Clientes no CRM: os dados cadastrais e de contato ficam escondidos.</Notice>
            ) : record ? (
              <PatientRecordView record={record} />
            ) : !data && details.loading ? (
              <Skeleton rows={3} label="Carregando a ficha" />
            ) : data?.available ? (
              <Notice>O CRM não liberou os dados cadastrais deste cliente para o seu usuário.</Notice>
            ) : null}
          </section>
          <section className="patient-section" aria-label="Histórico de pagamentos">
            <h3 className="section-title">
              <CreditCard size={16} aria-hidden /> Histórico de pagamentos
            </h3>
            {session.can.seeFinance ? <PaymentHistory patientId={patient.id} /> : <Notice>Sem acesso ao Financeiro no CRM: o histórico de pagamentos fica escondido.</Notice>}
          </section>
        </>
      )}
    </Modal>
  );
}

type Row = readonly [label: string, value: ReactNode];

/** "jan. de 2023" a partir de aaaa-mm-dd (ou ISO completo). */
function monthYear(iso: string): string {
  const [year, month] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** Idade completa hoje a partir de aaaa-mm-dd; `null` quando a data não é válida. */
function ageOf(iso: string): number | null {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  const today = new Date();
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age -= 1;
  return age >= 0 ? age : null;
}

/** Nome e telefone na mesma linha ("Natália (mãe) · (11) 98000-0004"). */
function personLine(name?: string, phone?: string): string {
  return [name, phone ? formatPhone(phone) : ""].filter(Boolean).join(" · ");
}

function discountText(record: ExternalPatientRecord): string {
  const discount = record.discount;
  if (!discount) return "";
  const amount = discount.type === "percentage" ? `${discount.percent ?? 0}%` : formatMoney(discount.amountInCents ?? 0);
  const scope = discount.scope === "permanent" ? "em todas as cobranças" : discount.scope === "next" ? `nas próximas ${discount.charges ?? 0} cobranças` : discount.scope === "once" ? "na próxima cobrança" : "";
  return [amount, scope].filter(Boolean).join(" ");
}

/** Endereço montado em uma linha, na ordem em que se escreve num envelope. */
function addressLine(record: ExternalPatientRecord): string {
  const street = [record.address, record.addressNumber].filter(Boolean).join(", ");
  const unit = [record.complement, record.unit ? `apto/casa ${record.unit}` : "", record.floor ? `${record.floor}º andar` : ""].filter(Boolean).join(", ");
  const building = [record.buildingName, record.block ? `bloco ${record.block}` : ""].filter(Boolean).join(", ");
  const city = [record.city, record.state].filter(Boolean).join("/");
  return [street, unit, building, record.neighborhood, city, record.postalCode ? `CEP ${record.postalCode}` : ""].filter(Boolean).join(" · ");
}

/** Situação e tempo de casa, no cabeçalho da ficha. */
function PatientHeadline({ record }: { record: ExternalPatientRecord }) {
  const since = record.clientSince || record.createdAt;
  return (
    <span className="patient-headline">
      {record.status === "active" ? (
        <span className="status-badge status-active">Ativo</span>
      ) : (
        <span className="status-badge status-inactive">{record.inactiveAt ? `Inativo desde ${fullDate(record.inactiveAt)}` : "Inativo"}</span>
      )}
      <span>Cliente desde {monthYear(since)}</span>
    </span>
  );
}

function RecordCard({ title, icon, rows, wide = false, children }: { title: string; icon: ReactNode; rows: Row[]; wide?: boolean; children?: ReactNode }) {
  const filled = rows.filter(([, value]) => value);
  if (filled.length === 0 && !children) return null;
  return (
    <div className={`record-card${wide ? " record-card-wide" : ""}`}>
      <h4>
        <span aria-hidden>{icon}</span> {title}
      </h4>
      {filled.length ? (
        <dl className="record-grid">
          {filled.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </div>
  );
}

function PatientRecordView({ record }: { record: ExternalPatientRecord }) {
  const age = record.birthDate ? ageOf(record.birthDate) : null;
  const address = addressLine(record);
  return (
    <>
      <div className="record-groups">
        <RecordCard
          title="Contato"
          icon={<Phone size={14} />}
          rows={[
            ["Telefone", record.phone ? formatPhone(record.phone) : ""],
            ["WhatsApp", record.whatsapp && record.whatsapp !== record.phone ? formatPhone(record.whatsapp) : ""],
            ["E-mail", record.email ?? ""],
            ["Em emergência, falar com", personLine(record.emergencyContactName, record.emergencyContactPhone)],
            ["Responsável", personLine(record.guardianName, record.guardianPhone)],
          ]}
        />
        <RecordCard
          title="Sobre o cliente"
          icon={<User size={14} />}
          rows={[
            [
              "Nascimento",
              record.birthDate ? (
                <>
                  <span>{fullDate(record.birthDate)}</span>
                  {age !== null ? <span className="muted"> · {plural(age, "ano", "anos")}</span> : null}
                </>
              ) : (
                ""
              ),
            ],
            ["CPF", record.cpf ?? ""],
            ["Apelido", record.nickname ?? ""],
            ["Gênero", record.gender ? (genderLabels[record.gender] ?? record.gender) : ""],
            ["Profissão", record.occupation ?? ""],
          ]}
        />
        <RecordCard
          title="Relação com o estúdio"
          icon={<CalendarDays size={14} />}
          rows={[
            [record.branches.length > 1 ? "Unidades" : "Unidade", record.branches.map((branch) => branch.name).join(", ") || "—"],
            ["Como conheceu", record.source ?? ""],
            ["Nível", record.level ?? ""],
            ["Interesses", (record.interests ?? []).join(", ")],
            ["Desconto", discountText(record)],
            ["Uso de imagem", record.imageConsent === undefined ? "" : record.imageConsent ? "Autorizado" : "Não autorizado"],
          ]}
        />
        {address || record.referencePoint ? (
          <RecordCard title="Endereço" icon={<MapPin size={14} />} rows={[]} wide>
            <p className="record-address">
              {address ? <span>{address}</span> : null}
              {record.residenceType ? <small className="muted">{residenceTypeLabels[record.residenceType] ?? record.residenceType}</small> : null}
              {record.referencePoint ? <small className="muted">Ponto de referência: {record.referencePoint}</small> : null}
            </p>
          </RecordCard>
        ) : null}
      </div>
      <div className="record-lists">
        <div className="record-card">
          <h4>
            <Tag size={14} aria-hidden /> Etiquetas
          </h4>
          {record.tags.length ? (
            <ul className="record-tags" aria-label="Etiquetas">
              {record.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">Sem etiquetas.</p>
          )}
        </div>
        <div className="record-card">
          <h4>
            <Layers size={14} aria-hidden /> Planos ativos
          </h4>
          {record.activePlans.length ? (
            <ul className="record-list" aria-label="Planos ativos">
              {record.activePlans.map((plan) => (
                <li key={plan.id}>
                  {plan.name}
                  <small className="muted">{plan.validUntil ? `válido até ${shortDate(plan.validUntil)}` : `desde ${shortDate(plan.validFrom)}`}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nenhum plano ativo.</p>
          )}
        </div>
        <div className="record-card">
          <h4>
            <UserRound size={14} aria-hidden /> Turmas em que está
          </h4>
          {record.groups.length ? (
            <ul className="record-list" aria-label="Turmas do cliente">
              {record.groups.map((group) => (
                <li key={group.groupId}>
                  {group.groupName}
                  {group.status === "waitlisted" ? <small className="muted">na lista de espera</small> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nenhuma turma.</p>
          )}
        </div>
      </div>
    </>
  );
}

interface HistoryFilters {
  status: string;
  origin: string;
  /** `line:<linha>` ou `service:<id>`. */
  scope: string;
  dateField: "due" | "paid";
  from: string;
  to: string;
}

const emptyHistoryFilters: HistoryFilters = {
  status: "",
  origin: "",
  scope: "",
  dateField: "due",
  from: "",
  to: "",
};

function historyPath(patientId: string, filters: HistoryFilters): string {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.origin) query.set("origin", filters.origin);
  if (filters.scope.startsWith("line:")) query.set("businessLine", filters.scope.slice(5));
  if (filters.scope.startsWith("service:")) query.set("serviceId", filters.scope.slice(8));
  if (filters.from || filters.to) query.set("dateField", filters.dateField);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  const search = query.toString();
  return `/patients/${encodeURIComponent(patientId)}/payments${search ? `?${search}` : ""}`;
}

function PaymentHistory({ patientId }: { patientId: string }) {
  const [filters, setFilters] = useState<HistoryFilters>(emptyHistoryFilters);
  const invalidPeriod = Boolean(filters.from && filters.to && filters.from > filters.to);
  const history = useRemote<PatientPaymentsResponse>(invalidPeriod ? null : historyPath(patientId, filters));
  const options = useRemote<FiltersResponse>("/filters");
  const services = options.data?.services ?? [];
  const filtered = JSON.stringify(filters) !== JSON.stringify(emptyHistoryFilters);
  const set = (patch: Partial<HistoryFilters>) => setFilters((current) => ({ ...current, ...patch }));
  const data = history.data;

  if (data?.available === false) return <Notice tone="warning">{crmWithoutRecord}</Notice>;
  return (
    <>
      <div className="payment-filters" role="group" aria-label="Filtros do histórico">
        <div className="filter-row">
          <label className="filter-field">
            <span>Situação</span>
            <select aria-label="Situação" value={filters.status} onChange={(event) => set({ status: event.target.value })}>
              <option value="">Todas as situações</option>
              {paymentStatusFilters.map((status) => (
                <option key={status} value={status}>
                  {paymentStatusFilterLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Origem</span>
            <select aria-label="Origem" value={filters.origin} onChange={(event) => set({ origin: event.target.value })}>
              <option value="">Todas as origens</option>
              {paymentOrigins.map((origin) => (
                <option key={origin} value={origin}>
                  {paymentOriginLabels[origin]}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field filter-field-wide">
            <span>Serviço ou linha</span>
            <select aria-label="Serviço ou linha" value={filters.scope} onChange={(event) => set({ scope: event.target.value })}>
              <option value="">Todos os serviços e linhas</option>
              <optgroup label="Linhas">
                {lineKeys.map((line) => (
                  <option key={line} value={`line:${line}`}>
                    {lineKeyLabels[line]}
                  </option>
                ))}
              </optgroup>
              {lineKeys.map((line: LineKey) => {
                const ofLine = services.filter((service) => service.line === line);
                return ofLine.length ? (
                  <optgroup key={line} label={`Serviços — ${lineKeyLabels[line]}`}>
                    {ofLine.map((service) => (
                      <option key={service.id} value={`service:${service.id}`}>
                        {service.active ? service.name : `${service.name} (inativo)`}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
          </label>
        </div>
        <div className="filter-row">
          <label className="filter-field">
            <span>Período</span>
            <select
              aria-label="Período pelo"
              value={filters.dateField}
              onChange={(event) =>
                set({
                  dateField: event.target.value as HistoryFilters["dateField"],
                })
              }
            >
              <option value="due">Por data de vencimento</option>
              <option value="paid">Por data de pagamento</option>
            </select>
          </label>
          <label className="filter-field">
            <span>De</span>
            <input type="date" aria-label="De" value={filters.from} max={filters.to || undefined} onChange={(event) => set({ from: event.target.value })} />
          </label>
          <label className="filter-field">
            <span>Até</span>
            <input type="date" aria-label="Até" value={filters.to} min={filters.from || undefined} onChange={(event) => set({ to: event.target.value })} />
          </label>
          <div className="filter-field filter-field-action">
            {filtered ? (
              <button type="button" className="secondary-button small" onClick={() => setFilters(emptyHistoryFilters)}>
                Limpar filtros
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {invalidPeriod ? <p className="form-error">A data inicial precisa ser anterior à final.</p> : null}
      {!invalidPeriod && history.error ? <ErrorBanner message={history.error} onRetry={history.reload} /> : null}
      {!invalidPeriod && !data && history.loading ? <Skeleton rows={4} label="Carregando o histórico" /> : null}
      {!invalidPeriod && data?.available ? (
        <>
          <dl className="payment-totals" aria-label="Totais do histórico">
            <div>
              <dt>Cobranças</dt>
              <dd>{data.totals.count}</dd>
            </div>
            <div>
              <dt>Valor</dt>
              <dd>{formatMoney(data.totals.amountInCents)}</dd>
            </div>
            <div>
              <dt>Pago</dt>
              <dd className="text-good">{formatMoney(data.totals.paidInCents)}</dd>
            </div>
            <div>
              <dt>Em aberto</dt>
              <dd>{formatMoney(data.totals.openInCents)}</dd>
            </div>
            <div>
              <dt>Vencido</dt>
              <dd className={data.totals.overdueInCents > 0 ? "text-bad" : undefined}>{formatMoney(data.totals.overdueInCents)}</dd>
            </div>
          </dl>
          {data.payments.length === 0 ? (
            <EmptyState
              title={filtered ? "Nenhuma cobrança com esses filtros" : "Nenhuma cobrança registrada"}
              hint={filtered ? "Limpe os filtros para ver o histórico inteiro." : "As cobranças de planos, comandas, vendas e lançamentos aparecem aqui."}
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table payments-table" aria-label="Histórico de pagamentos">
                <thead>
                  <tr>
                    <th scope="col">Vencimento</th>
                    <th scope="col">Cobrança</th>
                    <th scope="col">Situação</th>
                    <th scope="col" className="num">
                      Valor
                    </th>
                    <th scope="col" className="num">
                      Pago
                    </th>
                    <th scope="col">Pagamento</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((payment) => (
                    <PaymentRow key={payment.id} payment={payment} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}

function PaymentRow({ payment }: { payment: ExternalPatientPayment }) {
  const lines = [...new Set([...payment.services.map((service) => service.businessLine), ...payment.productLines])];
  const sub = [
    paymentOriginLabels[payment.origin],
    payment.installmentCount > 1 ? `parcela ${payment.installmentNumber}/${payment.installmentCount}` : "",
    payment.services.map((service) => service.name).join(", "),
    payment.balanceOfReceivableId ? "saldo de baixa parcial" : "",
  ].filter(Boolean);
  const lastPayment = payment.payments.at(-1);
  const lastReversal = payment.reversals.at(-1);
  return (
    <tr>
      <td data-label="Vencimento">{shortDate(payment.dueDate)}</td>
      <td data-label="Cobrança">
        <span className="payment-description">
          <strong>{payment.description}</strong>
          <span className="cell-sub muted">{sub.join(" · ")}</span>
          {lines.length ? (
            <span className="payment-lines">
              {lines.map((line) => (
                <LinePill key={String(line)} line={line} />
              ))}
            </span>
          ) : null}
        </span>
      </td>
      <td data-label="Situação">
        <span className="payment-status-list">
          <span className={`payment-status status-${payment.status}`}>{paymentStatusFilterLabels[payment.status]}</span>
          {payment.reversed ? <span className="payment-status status-reversed">{paymentStatusFilterLabels.reversed}</span> : null}
        </span>
      </td>
      <td data-label="Valor" className="num">
        {formatMoney(payment.amountInCents)}
        {payment.discountInCents > 0 ? <span className="cell-sub muted">desconto {formatMoney(payment.discountInCents)}</span> : null}
      </td>
      <td data-label="Pago" className="num">
        {formatMoney(payment.paidInCents)}
      </td>
      <td data-label="Pagamento">
        {payment.paidAt ? (
          <>
            {shortDate(payment.paidAt)}
            {payment.paymentMethod ? <span className="cell-sub muted">{paymentMethodLabel(payment.paymentMethod)}</span> : null}
          </>
        ) : lastReversal ? (
          <>
            Estornada em {shortDate(lastReversal.occurredAt)}
            {lastPayment ? <span className="cell-sub muted">{`${plural(payment.payments.length, "baixa", "baixas")} · ${paymentMethodLabel(lastPayment.paymentMethod)}`}</span> : null}
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
    </tr>
  );
}
