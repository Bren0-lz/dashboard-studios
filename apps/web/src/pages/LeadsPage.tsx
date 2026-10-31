import { ArrowRight, MessageSquarePlus, ShoppingBag, XCircle } from "lucide-react";
import { useState } from "react";
import {
  formatPercent,
  formatPhone,
  leadFollowUpMessage,
  plural,
  whatsappLink,
  type ExternalPatientSummary,
  type GroupRow,
  type GroupsResponse,
  type Lead,
  type LeadsResponse,
} from "@dash/shared";
import { EnrollDialog } from "../components/EnrollDialog";
import { EmptyState, ErrorBanner, Kpi, Modal, Notice, PageHeader, Skeleton, WhatsAppButton } from "../components/ui";
import { useLineFilter, withLine } from "../lib/filters";
import { useSession } from "../lib/session";
import { useAction } from "../lib/useAction";
import { useRemote } from "../lib/useRemote";

type LeadCard = Lead & { idleDays: number };

export function LeadsPage() {
  const { session } = useSession();
  const [staleDays, setStaleDays] = useState(3);
  const board = useRemote<LeadsResponse>(`/leads?dias=${staleDays}`);
  const [contacting, setContacting] = useState<LeadCard | null>(null);
  const [losing, setLosing] = useState<LeadCard | null>(null);
  const [converting, setConverting] = useState<LeadCard | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const action = useAction();
  const data = board.data;
  const openStages = data?.columns.filter((column) => column.kind === "open") ?? [];

  async function move(lead: LeadCard, stage: string) {
    if (await action.run(`/leads/${lead.id}/stage`, "PATCH", { stage })) {
      setMessage(`${lead.fullName} foi para ${data?.columns.find((column) => column.stage === stage)?.label ?? stage}.`);
      board.reload();
    }
  }

  return (
    <>
      <PageHeader
        title="O que está para fechar?"
        actions={
          <label className="inline-field">
            <span>Parado há</span>
            <select value={staleDays} onChange={(event) => setStaleDays(Number(event.target.value))}>
              {[2, 3, 5, 7, 15].map((value) => (
                <option key={value} value={value}>
                  {value}+ dias
                </option>
              ))}
            </select>
          </label>
        }
      />
      {board.error ? <ErrorBanner message={board.error} onRetry={board.reload} /> : null}
      {action.error ? <p className="form-error">{action.error}</p> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {!data && board.loading ? <Skeleton rows={6} /> : null}
      {data ? (
        <>
          {data.insights ? (
            <section className="kpi-grid kpi-grid-compact">
              <Kpi label="Leads abertos" value={String(data.insights.open)} detail={`${data.insights.total} no total`} />
              <Kpi label="Conversão" value={formatPercent(data.insights.conversionRate)} detail={`${data.insights.won} ganhos · ${data.insights.lost} perdidos`} />
              <Kpi label="Sem contato" value={String(data.insights.withoutContact)} tone={data.insights.withoutContact ? "warn" : "good"} />
              <Kpi
                label="Melhor origem"
                value={[...data.insights.sources].sort((a, b) => b.conversionRate - a.conversionRate)[0]?.name ?? "—"}
                detail={data.insights.lostReasons.length ? `Mais perde por: ${[...data.insights.lostReasons].sort((a, b) => b.leads - a.leads)[0]!.name}` : undefined}
              />
            </section>
          ) : null}
          {openStages.length === 0 ? (
            <section className="panel">
              <EmptyState title="Nenhuma etapa aberta no funil" hint="Configure as etapas do funil no CRM." />
            </section>
          ) : (
            <div className="kanban">
              {openStages.map((column, index) => {
                const next = openStages[index + 1];
                return (
                  <section key={column.stage} className="kanban-column">
                    <header>
                      <h2>{column.label}</h2>
                      <span className="muted">{column.total}</span>
                    </header>
                    {column.leads.length === 0 ? <p className="muted kanban-empty">Nenhum lead nesta etapa.</p> : null}
                    {column.leads.map((lead) => (
                      <article key={lead.id} className={`lead-card${lead.idleDays >= data.staleDays ? " stale" : ""}`}>
                        <strong>{lead.fullName}</strong>
                        <span className="muted">
                          {lead.interest} · {lead.source}
                        </span>
                        <span className={lead.idleDays >= data.staleDays ? "text-warn" : "muted"}>
                          {lead.lastContactAt ? `Último contato há ${plural(lead.idleDays, "dia", "dias")}` : `Sem contato · ${plural(lead.idleDays, "dia", "dias")}`}
                        </span>
                        <div className="lead-actions">
                          <WhatsAppButton compact label={`WhatsApp de ${lead.fullName}`} href={whatsappLink(lead.phone, leadFollowUpMessage({ leadName: lead.fullName, interest: lead.interest, clinicName: session.clinicName }))} />
                          {session.can.contactLeads ? (
                            <button type="button" className="icon-button" title="Registrar contato" aria-label={`Registrar contato com ${lead.fullName}`} onClick={() => setContacting(lead)}>
                              <MessageSquarePlus size={16} />
                            </button>
                          ) : null}
                          {session.can.moveLeads && next ? (
                            <button type="button" className="icon-button" title={`Mover para ${next.label}`} aria-label={`Mover ${lead.fullName} para ${next.label}`} disabled={action.busy} onClick={() => move(lead, next.stage)}>
                              <ArrowRight size={16} />
                            </button>
                          ) : null}
                          {session.can.moveLeads ? (
                            <button type="button" className="icon-button danger" title="Marcar como perdido" aria-label={`Marcar ${lead.fullName} como perdido`} onClick={() => setLosing(lead)}>
                              <XCircle size={16} />
                            </button>
                          ) : null}
                          {session.can.convertLeads ? (
                            <button type="button" className="primary-button small" onClick={() => setConverting(lead)}>
                              <ShoppingBag size={14} aria-hidden /> Converter e vender
                            </button>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </section>
                );
              })}
            </div>
          )}
        </>
      ) : null}
      {contacting ? (
        <ContactDialog
          lead={contacting}
          onClose={() => setContacting(null)}
          onSaved={() => {
            setContacting(null);
            setMessage("Contato registrado.");
            board.reload();
          }}
        />
      ) : null}
      {losing ? (
        <LostDialog
          lead={losing}
          reasons={data?.insights?.lostReasons.map((item) => item.name) ?? []}
          onClose={() => setLosing(null)}
          onSaved={() => {
            setLosing(null);
            setMessage(`${losing.fullName} foi marcado como perdido.`);
            board.reload();
          }}
        />
      ) : null}
      {converting ? (
        <ConvertAndSellFlow
          lead={converting}
          onClose={() => setConverting(null)}
          onDone={(text) => {
            setConverting(null);
            setMessage(text);
            board.reload();
          }}
        />
      ) : null}
    </>
  );
}

function ContactDialog({ lead, onClose, onSaved }: { lead: LeadCard; onClose: () => void; onSaved: () => void }) {
  const [channel, setChannel] = useState("whatsapp");
  const [notes, setNotes] = useState("");
  const action = useAction();
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (await action.run(`/leads/${lead.id}/contacts`, "POST", { channel, notes })) onSaved();
  }
  return (
    <Modal title={`Contato com ${lead.fullName}`} onClose={onClose} busy={action.busy} size="sm">
      <form className="form" onSubmit={save}>
        <label className="field">
          <span>Canal</span>
          <select value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option value="whatsapp">WhatsApp</option>
            <option value="phone">Telefone</option>
            <option value="email">E-mail</option>
            <option value="in_person">Presencial</option>
            <option value="note">Anotação</option>
          </select>
        </label>
        <label className="field">
          <span>O que foi conversado</span>
          <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} required minLength={2} />
        </label>
        {action.error ? <p className="form-error">{action.error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>
            Voltar
          </button>
          <button type="submit" className="primary-button" disabled={action.busy}>
            {action.busy ? "Salvando…" : "Registrar contato"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LostDialog({ lead, reasons, onClose, onSaved }: { lead: LeadCard; reasons: string[]; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState("");
  const action = useAction();
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (await action.run(`/leads/${lead.id}/stage`, "PATCH", { stage: "lost", lostReason: reason })) onSaved();
  }
  return (
    <Modal title={`Perder ${lead.fullName}`} onClose={onClose} busy={action.busy} size="sm">
      <form className="form" onSubmit={save}>
        <label className="field">
          <span>Motivo da perda</span>
          <input list="lost-reasons" value={reason} onChange={(event) => setReason(event.target.value)} required />
          <datalist id="lost-reasons">
            {reasons.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </label>
        {action.error ? <p className="form-error">{action.error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>
            Voltar
          </button>
          <button type="submit" className="danger-button" disabled={action.busy}>
            {action.busy ? "Salvando…" : "Marcar como perdido"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Converter → escolher turma → vender plano/inscrever, num fluxo só. */
function ConvertAndSellFlow({ lead, onClose, onDone }: { lead: LeadCard; onClose: () => void; onDone: (message: string) => void }) {
  const [line] = useLineFilter();
  const [cpf, setCpf] = useState("");
  const [patient, setPatient] = useState<Pick<ExternalPatientSummary, "id" | "fullName" | "phone"> | null>(null);
  const [group, setGroup] = useState<GroupRow | null>(null);
  const groups = useRemote<GroupsResponse>(patient ? withLine("/groups", line) : null);
  const action = useAction();

  async function convert(event: React.FormEvent) {
    event.preventDefault();
    const result = await action.run<{ patient: { id: string; fullName: string; phone: string } }>(`/leads/${lead.id}/convert`, "POST", { cpf });
    if (result) setPatient(result.patient);
  }

  if (patient && group)
    return <EnrollDialog group={group} planSale={groups.data?.features.planSale ?? false} initialPatient={patient} onClose={() => onDone(`${patient.fullName} virou cliente.`)} onDone={(result) => onDone(`${patient.fullName} virou cliente. ${result.message}`)} />;

  return (
    <Modal title={patient ? "Escolha a turma" : `Converter ${lead.fullName}`} onClose={patient ? () => onDone(`${patient.fullName} virou cliente.`) : onClose} busy={action.busy}>
      {!patient ? (
        <form className="form" onSubmit={convert}>
          <p className="panel-context">
            {lead.fullName} · {formatPhone(lead.phone)} · interesse em {lead.interest}
          </p>
          <label className="field">
            <span>CPF</span>
            <input inputMode="numeric" value={cpf} onChange={(event) => setCpf(event.target.value)} required />
          </label>
          {action.error ? <p className="form-error">{action.error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>
              Voltar
            </button>
            <button type="submit" className="primary-button" disabled={action.busy}>
              {action.busy ? "Salvando…" : "Converter em cliente"}
            </button>
          </div>
        </form>
      ) : (
        <>
          <Notice tone="success">{patient.fullName} agora é cliente. Escolha a turma para vender.</Notice>
          {groups.error ? <ErrorBanner message={groups.error} onRetry={groups.reload} /> : null}
          {!groups.data ? <Skeleton rows={3} /> : null}
          <div className="choice-list">
            {(groups.data?.groups ?? [])
              .filter((item) => item.active)
              .sort((a, b) => Number(b.serviceName === lead.interest) - Number(a.serviceName === lead.interest) || b.freeSeats - a.freeSeats)
              .map((item) => (
                <button key={item.id} type="button" className="choice" onClick={() => setGroup(item)}>
                  <span>{item.name}</span>
                  <small>
                    {item.schedule} · {item.freeSeats > 0 ? plural(item.freeSeats, "vaga", "vagas") : "cheia (entra na espera)"}
                  </small>
                </button>
              ))}
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => onDone(`${patient.fullName} virou cliente.`)}>
              Vender depois
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
