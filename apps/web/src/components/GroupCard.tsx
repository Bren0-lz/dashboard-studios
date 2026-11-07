import { AlertCircle, UserPlus } from "lucide-react";
import { formatMoney, initials, memberBubbles, plural, seatsLabel, slotLabel, type GroupRow } from "@dash/shared";
import { LinePill } from "./ui";

/**
 * Cartão da turma: alunos em bolinhas de iniciais (até 6, depois "+N"), "15/20 · 5 vagas",
 * pagamentos atrasados (abre o modal da turma, com os inadimplentes marcados) e inscrever.
 */
export function GroupCard({ group, showOverdue, canEnroll, onOpen, onEnroll }: { group: GroupRow; showOverdue: boolean; canEnroll: boolean; onOpen: () => void; onEnroll: () => void }) {
  const names = group.memberNames;
  const bubbles = names ? memberBubbles(names) : null;
  return (
    <article className="group-card" aria-label={group.name}>
      <header className="group-card-head">
        <div>
          <h3>
            <button type="button" className="row-title" onClick={onOpen}>
              {group.name}
            </button>
          </h3>
          <span className="muted">{group.professionalName}</span>
        </div>
        <LinePill line={group.businessLine} />
      </header>
      <p className="group-card-schedule muted">{group.weeklySlots.length ? group.weeklySlots.map(slotLabel).join(", ") : "Horários ainda não definidos"}</p>
      <div className="group-card-members">
        {bubbles && bubbles.shown.length > 0 ? (
          <button type="button" className="avatar-stack" onClick={onOpen} aria-label={`Ver alunos de ${group.name}`}>
            {bubbles.shown.map((name, index) => (
              <span key={`${name}-${index}`} className="avatar" title={name}>
                {initials(name)}
              </span>
            ))}
            {bubbles.extra > 0 ? <span className="avatar avatar-more">+{bubbles.extra}</span> : null}
          </button>
        ) : names ? (
          <span className="muted">Nenhum aluno ainda</span>
        ) : null}
        <strong className="group-card-seats">{seatsLabel(group)}</strong>
      </div>
      {showOverdue ? (
        group.overdueMembers > 0 ? (
          <button type="button" className="group-card-overdue" onClick={onOpen}>
            <AlertCircle size={16} aria-hidden />
            <span>
              Pagamentos atrasados: {plural(group.overdueMembers, "cliente", "clientes")} · {formatMoney(group.overdueInCents)}
            </span>
          </button>
        ) : (
          <span className="group-card-ok muted">Pagamentos em dia</span>
        )
      ) : null}
      {canEnroll ? (
        <footer className="group-card-actions">
          <button type="button" className={group.freeSeats > 0 ? "primary-button small" : "secondary-button small"} onClick={onEnroll}>
            <UserPlus size={16} aria-hidden /> {group.freeSeats > 0 ? "Inscrever" : "Espera"}
          </button>
        </footer>
      ) : null}
    </article>
  );
}
