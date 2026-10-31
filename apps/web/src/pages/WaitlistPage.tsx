import { CheckCircle2, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import {
  formatPhone,
  plural,
  seatOfferMessage,
  whatsappLink,
  type CompatibleGroup,
  type EnrollResult,
  type ExternalPatientSummary,
  type WaitlistResponse,
  type WaitlistRow,
} from "@dash/shared";
import { PatientPicker } from "../components/EnrollDialog";
import { ConfirmDialog, EmptyState, ErrorBanner, Modal, Notice, PageHeader, Skeleton, WhatsAppButton, LinePill } from "../components/ui";
import { useLineFilter, withLine } from "../lib/filters";
import { useSession } from "../lib/session";
import { useAction } from "../lib/useAction";
import { useRemote } from "../lib/useRemote";

export function WaitlistPage() {
  const [line] = useLineFilter();
  const { session } = useSession();
  const list = useRemote<WaitlistResponse>(withLine("/waitlist", line));
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WaitlistRow | null>(null);
  const [removing, setRemoving] = useState<WaitlistRow | null>(null);
  const [enrolling, setEnrolling] = useState<{ row: WaitlistRow; group: CompatibleGroup } | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "warning" } | null>(null);
  const action = useAction();
  const rows = list.data?.rows ?? [];
  const ready = rows.filter((row) => row.compatibleGroups.length > 0).length;

  async function remove() {
    if (!removing) return;
    if ((await action.run(`/waitlist/${removing.id}`, "DELETE")) === null) return;
    setRemoving(null);
    setMessage({ text: `${removing.patientName} saiu da lista de espera.`, tone: "success" });
    list.reload();
  }

  return (
    <>
      <PageHeader
        title="Quem está pronto para comprar?"
        subtitle={list.data ? `${plural(rows.length, "pessoa aguardando", "pessoas aguardando")} · ${plural(ready, "já tem vaga compatível", "já têm vaga compatível")}` : undefined}
        actions={
          session.can.manageWaitlist ? (
            <button type="button" className="primary-button" onClick={() => setAdding(true)}>
              <Plus size={16} aria-hidden /> Adicionar à espera
            </button>
          ) : null
        }
      />
      {list.error ? <ErrorBanner message={list.error} onRetry={list.reload} /> : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {!list.data && list.loading ? <Skeleton rows={6} /> : null}
      {list.data ? (
        <section className="panel">
          {rows.length === 0 ? (
            <EmptyState title="Ninguém na lista de espera" hint="Quando alguém pedir um horário sem vaga, adicione aqui para oferecer assim que abrir." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th>Aguarda</th>
                    <th className="num">Há</th>
                    <th className="num">Posição</th>
                    <th>Observação</th>
                    <th>Vaga agora</th>
                    <th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const best = row.compatibleGroups[0];
                    return (
                      <tr key={row.id} className={best ? "highlight" : ""}>
                        <td data-label="Pessoa">
                          <strong>{row.patientName}</strong>
                          <span className="muted cell-sub">{formatPhone(row.patientPhone)}</span>
                        </td>
                        <td data-label="Aguarda">
                          {row.itemName} <LinePill line={row.businessLine} />
                        </td>
                        <td data-label="Há" className="num">
                          {plural(row.waitingDays, "dia", "dias")}
                        </td>
                        <td data-label="Posição" className="num">
                          {row.position ? `${row.position}º` : "—"}
                        </td>
                        <td data-label="Observação">{row.notes || <span className="muted">—</span>}</td>
                        <td data-label="Vaga agora">
                          {best ? (
                            <span className="seat-match">
                              <CheckCircle2 size={14} aria-hidden /> Há vaga compatível agora: {best.name} ({plural(best.freeSeats, "vaga", "vagas")})
                            </span>
                          ) : (
                            <span className="muted">Sem vaga</span>
                          )}
                        </td>
                        <td className="cell-actions">
                          <WhatsAppButton
                            compact={!best}
                            label={best ? "Oferecer vaga" : `WhatsApp de ${row.patientName}`}
                            href={whatsappLink(row.patientPhone, seatOfferMessage({ patientName: row.patientName, itemName: best?.name ?? row.itemName, clinicName: session.clinicName, schedule: best?.schedule }))}
                          />
                          {best && session.can.enroll ? (
                            <button type="button" className="primary-button small" onClick={() => setEnrolling({ row, group: best })}>
                              <UserPlus size={16} aria-hidden /> Inscrever
                            </button>
                          ) : null}
                          {session.can.manageWaitlist ? (
                            <>
                              <button type="button" className="icon-button" onClick={() => setEditing(row)} aria-label={`Editar observação de ${row.patientName}`} title="Editar observação">
                                <Pencil size={16} />
                              </button>
                              <button type="button" className="icon-button danger" onClick={() => setRemoving(row)} aria-label={`Remover ${row.patientName} da espera`} title="Remover da espera">
                                <Trash2 size={16} />
                              </button>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
      {adding && list.data ? (
        <AddWaitlistDialog
          services={list.data.services}
          onClose={() => setAdding(false)}
          onSaved={(name) => {
            setAdding(false);
            setMessage({ text: `${name} entrou na lista de espera.`, tone: "success" });
            list.reload();
          }}
        />
      ) : null}
      {editing ? (
        <EditNotesDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      ) : null}
      {enrolling ? (
        <EnrollFromWaitlistDialog
          row={enrolling.row}
          groups={enrolling.row.compatibleGroups}
          onClose={() => setEnrolling(null)}
          onDone={(result) => {
            setEnrolling(null);
            setMessage({ text: result.message, tone: result.status === "active" ? "success" : "warning" });
            list.reload();
          }}
        />
      ) : null}
      {removing ? (
        <ConfirmDialog
          title="Remover da espera"
          message={
            <p>
              <strong>{removing.patientName}</strong> sai da fila de {removing.itemName}
              {removing.position ? ` (hoje na ${removing.position}ª posição); quem está atrás sobe uma posição.` : "."}
            </p>
          }
          confirmLabel="Remover da espera"
          busy={action.busy}
          error={action.error}
          onConfirm={remove}
          onCancel={() => setRemoving(null)}
        />
      ) : null}
    </>
  );
}

function AddWaitlistDialog({ services, onClose, onSaved }: { services: { id: string; name: string }[]; onClose: () => void; onSaved: (name: string) => void }) {
  const [patient, setPatient] = useState<ExternalPatientSummary | null>(null);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const action = useAction();
  async function save() {
    if (!patient) return;
    if (await action.run("/waitlist", "POST", { patientId: patient.id, serviceId, notes })) onSaved(patient.fullName);
  }
  return (
    <Modal title="Adicionar à lista de espera" onClose={onClose} busy={action.busy}>
      <h3 className="step-title">Cliente</h3>
      {patient ? (
        <div className="picked">
          <div>
            <strong>{patient.fullName}</strong>
            <span>{formatPhone(patient.phone)}</span>
          </div>
          <button type="button" className="link-button" onClick={() => setPatient(null)}>
            Trocar
          </button>
        </div>
      ) : (
        <PatientPicker onPick={setPatient} />
      )}
      <div className="form-grid">
        <label className="field">
          <span>Serviço</span>
          <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Observação</span>
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: só à noite" maxLength={500} />
        </label>
      </div>
      {action.error ? <p className="form-error">{action.error}</p> : null}
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>
          Voltar
        </button>
        <button type="button" className="primary-button" onClick={save} disabled={!patient || !serviceId || action.busy}>
          {action.busy ? "Salvando…" : "Adicionar"}
        </button>
      </div>
    </Modal>
  );
}

function EditNotesDialog({ row, onClose, onSaved }: { row: WaitlistRow; onClose: () => void; onSaved: () => void }) {
  const [notes, setNotes] = useState(row.notes);
  const [contacted, setContacted] = useState(row.status === "contacted");
  const action = useAction();
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (await action.run(`/waitlist/${row.id}`, "PATCH", { notes, status: contacted ? "contacted" : "waiting" })) onSaved();
  }
  return (
    <Modal title={`Espera de ${row.patientName}`} onClose={onClose} busy={action.busy} size="sm">
      <form className="form" onSubmit={save}>
        <label className="field">
          <span>Observação</span>
          <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} />
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={contacted} onChange={(event) => setContacted(event.target.checked)} /> Já foi avisada
        </label>
        {action.error ? <p className="form-error">{action.error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>
            Voltar
          </button>
          <button type="submit" className="primary-button" disabled={action.busy}>
            {action.busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EnrollFromWaitlistDialog({ row, groups, onClose, onDone }: { row: WaitlistRow; groups: CompatibleGroup[]; onClose: () => void; onDone: (result: EnrollResult) => void }) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const action = useAction();
  async function confirm() {
    const result = await action.run<EnrollResult>(`/waitlist/${row.id}/enroll`, "POST", { groupId, patientId: row.patientId });
    if (result) onDone(result);
  }
  return (
    <Modal title={`Inscrever ${row.patientName}`} onClose={onClose} busy={action.busy} size="sm">
      <p className="panel-context">Ao confirmar, a pessoa entra na turma e sai da lista de espera.</p>
      <div className="choice-list" role="radiogroup" aria-label="Turma">
        {groups.map((group) => (
          <label key={group.id} className={`choice${groupId === group.id ? " active" : ""}`}>
            <input type="radio" name="group" checked={groupId === group.id} onChange={() => setGroupId(group.id)} />
            <span>{group.name}</span>
            <small>
              {group.schedule} · {plural(group.freeSeats, "vaga", "vagas")}
            </small>
          </label>
        ))}
      </div>
      {action.error ? <p className="form-error">{action.error}</p> : null}
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>
          Voltar
        </button>
        <button type="button" className="primary-button" onClick={confirm} disabled={!groupId || action.busy}>
          {action.busy ? "Salvando…" : "Confirmar inscrição"}
        </button>
      </div>
    </Modal>
  );
}
