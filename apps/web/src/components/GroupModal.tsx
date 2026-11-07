import { ArrowUpCircle, UserMinus, UserPlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  firstName,
  formatMoney,
  formatPhone,
  initials,
  seatOfferMessage,
  whatsappLink,
  chargeMessage,
  type CancelEnrollmentResult,
  type ExternalGroupMember,
  type GroupDetailsResponse,
  type GroupRow,
} from "@dash/shared";
import { useSession } from "../lib/session";
import { useAction } from "../lib/useAction";
import { useRemote } from "../lib/useRemote";
import { canOpenPatient, PatientModal, type PatientRef } from "./PatientModal";
import { ConfirmDialog, EmptyState, ErrorBanner, LinePill, MemberOverdueMark, Modal, Notice, OccupancyBar, Skeleton, WhatsAppButton } from "./ui";

/** Número para o WhatsApp: o WhatsApp do cadastro e, sem ele, o telefone. Sem `patients.view` não vem nenhum. */
const whatsappOf = (member: ExternalGroupMember) => member.whatsapp ?? member.phone;

/** Telefone e WhatsApp (quando diferente) do aluno; vazio quando o CRM não manda o contato. */
function contactLine(member: ExternalGroupMember): string {
  const parts: string[] = [];
  if (member.phone) parts.push(formatPhone(member.phone));
  if (member.whatsapp && member.whatsapp !== member.phone) parts.push(`WhatsApp ${formatPhone(member.whatsapp)}`);
  return parts.join(" · ");
}

/** Nome do aluno; com `onSelect` (PT8), o nome é um botão que abre a ficha do cliente. */
function MemberName({ member, children, onSelect }: { member: ExternalGroupMember; children?: ReactNode; onSelect?: (() => void) | undefined }) {
  return (
    <div className="member-who">
      <span className="avatar" aria-hidden>
        {initials(member.patientName)}
      </span>
      <strong>
        {children}
        {onSelect ? (
          <button type="button" className="row-title member-link" onClick={onSelect} title="Ver ficha do cliente">
            {member.patientName}
          </button>
        ) : (
          member.patientName
        )}
      </strong>
    </div>
  );
}

/** Modal da turma: alunos com telefone e WhatsApp, selo de atraso, espera e ações. Usado nos cartões, na tabela e no calendário. */
export function GroupModal({ groupId, onClose, onEnroll, onChanged }: { groupId: string; onClose: () => void; onEnroll: (group: GroupRow | GroupDetailsResponse) => void; onChanged: () => void }) {
  const { session } = useSession();
  const details = useRemote<GroupDetailsResponse>(`/groups/${groupId}`);
  const [removing, setRemoving] = useState<ExternalGroupMember | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Ficha do cliente (PT8) num modal sobre a turma; fechar volta para a lista de alunos.
  const [patient, setPatient] = useState<PatientRef | null>(null);
  const canOpen = canOpenPatient(session.can);
  const action = useAction();
  const group = details.data;

  async function remove() {
    if (!removing || !group) return;
    const result = await action.run<CancelEnrollmentResult>(`/groups/${group.id}/enrollments/${removing.enrollmentId}/cancel`, "POST");
    if (!result) return;
    setRemoving(null);
    setNotice(result.message);
    details.reload();
    onChanged();
  }

  async function promote(member: ExternalGroupMember) {
    if (!group) return;
    const result = await action.run<{ message: string }>(`/groups/${group.id}/waitlist/${member.enrollmentId}/promote`, "POST");
    if (!result) return;
    setNotice(`${member.patientName} entrou na turma.`);
    details.reload();
    onChanged();
  }

  const nextInLine = group?.waitlist[0];
  return (
    <Modal title={group?.name ?? "Turma"} onClose={onClose} busy={action.busy}>
      {group ? <p className="panel-context">{`${group.schedule} · ${group.professionalName} · ${group.roomName}`}</p> : null}
      {details.error ? <ErrorBanner message={details.error} onRetry={details.reload} /> : null}
      {!group && details.loading ? <Skeleton rows={5} /> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {action.error && !removing ? <p className="form-error">{action.error}</p> : null}
      {group ? (
        <>
          <div className="group-summary">
            <LinePill line={group.businessLine} />
            <OccupancyBar enrolled={group.enrolled} capacity={group.capacity} percent={group.occupancyPercent} />
            <span>{group.freeSeats > 0 ? `${group.freeSeats} ${group.freeSeats === 1 ? "vaga para vender" : "vagas para vender"}` : "Turma cheia"}</span>
            <span>{formatMoney(group.monthlyRevenueInCents)}/mês</span>
          </div>

          <h3 className="section-title">Alunos ({group.members.length})</h3>
          {group.members.length === 0 ? (
            <EmptyState title="Nenhum inscrito ainda" hint="Use “Inscrever” para vender a primeira vaga." />
          ) : (
            <ul className="member-list">
              {group.members.map((member) => (
                <li key={member.enrollmentId} className="member">
                  <div className="member-main">
                    <MemberName member={member} onSelect={canOpen ? () => setPatient({ id: member.patientId, name: member.patientName }) : undefined} />
                    <span className="muted">{[contactLine(member), member.monthlyInCents !== null ? `${formatMoney(member.monthlyInCents)}/mês` : "sem plano ativo"].filter(Boolean).join(" · ")}</span>
                    {member.overdue && session.can.seeFinance ? <MemberOverdueMark overdue={member.overdue} /> : null}
                  </div>
                  <div className="member-actions">
                    <WhatsAppButton
                      compact
                      label={`WhatsApp de ${member.patientName}`}
                      href={whatsappLink(
                        whatsappOf(member),
                        member.overdue
                          ? chargeMessage({ patientName: member.patientName, amountInCents: member.overdue.amountInCents, oldestDueDate: member.overdue.oldestDueDate, clinicName: session.clinicName, pixKey: session.pixKey })
                          : `Olá, ${firstName(member.patientName)}! Aqui é do ${session.clinicName}.`,
                      )}
                    />
                    {session.can.cancelEnrollment ? (
                      <button type="button" className="icon-button danger" onClick={() => setRemoving(member)} aria-label={`Remover ${member.patientName} da turma`} title="Remover da turma">
                        <UserMinus size={16} />
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h3 className="section-title">Lista de espera da turma ({group.waitlist.length})</h3>
          {group.waitlist.length === 0 ? (
            <p className="muted">Ninguém esperando por esta turma.</p>
          ) : (
            <ul className="member-list">
              {group.waitlist.map((member) => (
                <li key={member.enrollmentId} className="member">
                  <div className="member-main">
                    <MemberName member={member}>{member.queuePosition ? `${member.queuePosition}º · ` : ""}</MemberName>
                    {contactLine(member) ? <span className="muted">{contactLine(member)}</span> : null}
                  </div>
                  <div className="member-actions">
                    <WhatsAppButton compact label={`Oferecer vaga a ${member.patientName}`} href={whatsappLink(whatsappOf(member), seatOfferMessage({ patientName: member.patientName, itemName: group.name, clinicName: session.clinicName, schedule: group.schedule }))} />
                    {session.can.enroll && group.freeSeats > 0 ? (
                      <button type="button" className="secondary-button" onClick={() => promote(member)} disabled={action.busy}>
                        <ArrowUpCircle size={16} aria-hidden /> Promover
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {session.can.enroll ? (
            <div className="modal-actions">
              <button type="button" className="primary-button" onClick={() => onEnroll(group)} disabled={action.busy}>
                <UserPlus size={16} aria-hidden /> {group.freeSeats > 0 ? "Inscrever" : "Colocar na espera"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      {patient ? <PatientModal patient={patient} onClose={() => setPatient(null)} /> : null}
      {removing && group ? (
        <ConfirmDialog
          title="Remover da turma"
          message={
            <>
              <p>
                A inscrição de <strong>{removing.patientName}</strong> em {group.name} será cancelada.
              </p>
              {nextInLine ? (
                <p>
                  A próxima da fila, <strong>{firstName(nextInLine.patientName)}</strong>, entra automaticamente.
                </p>
              ) : (
                <p>A vaga fica livre para vender.</p>
              )}
            </>
          }
          confirmLabel="Remover da turma"
          busy={action.busy}
          error={action.error}
          onConfirm={remove}
          onCancel={() => {
            setRemoving(null);
            action.setError(null);
          }}
        />
      ) : null}
    </Modal>
  );
}
