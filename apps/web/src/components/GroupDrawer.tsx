import { ArrowUpCircle, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import {
  firstName,
  formatMoney,
  formatPhone,
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
import { ConfirmDialog, Drawer, EmptyState, ErrorBanner, LinePill, Notice, OccupancyBar, OverdueBadge, Skeleton, WhatsAppButton } from "./ui";

/** Gaveta da turma: inscritos (com selo de atraso), espera e ações. Usada na tabela e no calendário. */
export function GroupDrawer({ groupId, onClose, onEnroll, onChanged }: { groupId: string; onClose: () => void; onEnroll: (group: GroupRow | GroupDetailsResponse) => void; onChanged: () => void }) {
  const { session } = useSession();
  const details = useRemote<GroupDetailsResponse>(`/groups/${groupId}`);
  const [removing, setRemoving] = useState<ExternalGroupMember | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
    <Drawer
      title={group?.name ?? "Turma"}
      subtitle={group ? `${group.schedule} · ${group.professionalName} · ${group.roomName}` : undefined}
      onClose={onClose}
      busy={action.busy}
      footer={
        group && session.can.enroll ? (
          <button type="button" className="primary-button" onClick={() => onEnroll(group)}>
            <UserPlus size={16} aria-hidden /> {group.freeSeats > 0 ? "Inscrever" : "Colocar na espera"}
          </button>
        ) : null
      }
    >
      {details.error ? <ErrorBanner message={details.error} onRetry={details.reload} /> : null}
      {!group && details.loading ? <Skeleton rows={5} /> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {action.error && !removing ? <p className="form-error">{action.error}</p> : null}
      {group ? (
        <>
          <div className="drawer-summary">
            <LinePill line={group.businessLine} />
            <OccupancyBar enrolled={group.enrolled} capacity={group.capacity} percent={group.occupancyPercent} />
            <span>{group.freeSeats > 0 ? `${group.freeSeats} ${group.freeSeats === 1 ? "vaga para vender" : "vagas para vender"}` : "Turma cheia"}</span>
            <span>{formatMoney(group.monthlyRevenueInCents)}/mês</span>
          </div>

          <h3 className="section-title">Inscritos ({group.members.length})</h3>
          {group.members.length === 0 ? (
            <EmptyState title="Nenhum inscrito ainda" hint="Use “Inscrever” para vender a primeira vaga." />
          ) : (
            <ul className="member-list">
              {group.members.map((member) => (
                <li key={member.enrollmentId} className="member">
                  <div className="member-main">
                    <strong>{member.patientName}</strong>
                    <span className="muted">
                      {formatPhone(member.phone)}
                      {member.monthlyInCents !== null ? ` · ${formatMoney(member.monthlyInCents)}/mês` : " · sem plano ativo"}
                    </span>
                    {member.overdue ? <OverdueBadge overdue={member.overdue} /> : null}
                  </div>
                  <div className="member-actions">
                    <WhatsAppButton
                      compact
                      label={`WhatsApp de ${member.patientName}`}
                      href={whatsappLink(
                        member.phone,
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
                    <strong>
                      {member.queuePosition ? `${member.queuePosition}º · ` : ""}
                      {member.patientName}
                    </strong>
                    <span className="muted">{formatPhone(member.phone)}</span>
                  </div>
                  <div className="member-actions">
                    <WhatsAppButton compact label={`Oferecer vaga a ${member.patientName}`} href={whatsappLink(member.phone, seatOfferMessage({ patientName: member.patientName, itemName: group.name, clinicName: session.clinicName, schedule: group.schedule }))} />
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
        </>
      ) : null}
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
    </Drawer>
  );
}
