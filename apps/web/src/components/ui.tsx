import { AlertTriangle, Inbox, MessageCircle, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import {
  formatMoney,
  lineKeyLabels,
  lineKeyOf,
  occupancyTone,
  overdueTone,
  plural,
  type BusinessLine,
  type MemberOverdue,
} from "@dash/shared";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

/** Esqueleto enquanto carrega. */
export function Skeleton({ rows = 4, label = "Carregando" }: { rows?: number; label?: string }) {
  return (
    <div className="skeleton" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton-line" />
      ))}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <Inbox size={28} aria-hidden />
      <strong>{title}</strong>
      {hint ? <p>{hint}</p> : null}
      {action}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-banner" role="alert">
      <AlertTriangle size={18} aria-hidden />
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="secondary-button" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden /> Tentar de novo
        </button>
      ) : null}
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "success" | "warning" }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === "success" ? "status" : undefined}>
      {children}
    </div>
  );
}

/** `null` = sem classificação no CRM ("Outros"). */
export function LinePill({ line }: { line: BusinessLine | null }) {
  const key = lineKeyOf(line);
  return <span className={`line-pill line-${key}`}>{lineKeyLabels[key]}</span>;
}

export function OccupancyBar({ enrolled, capacity, percent }: { enrolled: number; capacity: number; percent: number }) {
  const tone = occupancyTone(percent);
  return (
    <div className="occupancy" title={`${percent}% ocupada`}>
      <div className={`occupancy-track tone-${tone}`}>
        <div className="occupancy-fill" style={{ "--fill": `${Math.min(100, percent)}%` } as React.CSSProperties} />
      </div>
      <span className="occupancy-label">
        {enrolled}/{capacity}
      </span>
    </div>
  );
}

export function OverdueBadge({ overdue }: { overdue: Pick<MemberOverdue, "daysOverdue" | "amountInCents"> }) {
  return (
    <span className={`overdue-badge tone-${overdueTone(overdue.daysOverdue)}`}>
      Atrasado há {plural(overdue.daysOverdue, "dia", "dias")} · {formatMoney(overdue.amountInCents)}
    </span>
  );
}

export function WhatsAppButton({ href, label = "WhatsApp", compact = false }: { href: string | null | undefined; label?: string; compact?: boolean }) {
  if (!href) return null;
  return (
    <a className={`whatsapp-button${compact ? " compact" : ""}`} href={href} target="_blank" rel="noreferrer" aria-label={compact ? label : undefined}>
      <MessageCircle size={16} aria-hidden />
      {compact ? null : label}
    </a>
  );
}

export function Modal({ title, onClose, busy = false, children, size = "md" }: { title: string; onClose: () => void; busy?: boolean; children: ReactNode; size?: "sm" | "md" }) {
  useEscape(onClose, busy);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("input, select, textarea, button:not(.icon-button)")?.focus();
  }, []);
  return (
    <div className="overlay overlay-center">
      <div className="overlay-backdrop" />
      <div ref={ref} className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Confirmação só para ações destrutivas, com o efeito explicado. */
export function ConfirmDialog({ title, message, confirmLabel, busy, error, onConfirm, onCancel }: { title: string; message: ReactNode; confirmLabel: string; busy: boolean; error?: string | null; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal title={title} onClose={onCancel} busy={busy} size="sm">
      <div className="confirm-message">{message}</div>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>
          Voltar
        </button>
        <button type="button" className="danger-button" onClick={onConfirm} disabled={busy}>
          {busy ? "Salvando…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

const stack: (() => void)[] = [];

/** Esc fecha só o de cima. */
function useEscape(onClose: () => void, busy: boolean) {
  const latest = useRef({ onClose, busy });
  latest.current = { onClose, busy };
  useEffect(() => {
    const handler = () => {
      if (!latest.current.busy) latest.current.onClose();
    };
    stack.push(handler);
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && stack[stack.length - 1] === handler) handler();
    };
    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
      stack.splice(stack.indexOf(handler), 1);
    };
  }, []);
}

export function Kpi({ label, value, detail, tone, onClick, children }: { label: string; value: string; detail?: ReactNode; tone?: "good" | "bad" | "warn"; onClick?: () => void; children?: ReactNode }) {
  const content = (
    <>
      <span className="kpi-label">{label}</span>
      <strong className={`kpi-value${tone ? ` kpi-${tone}` : ""}`}>{value}</strong>
      {detail ? <span className="kpi-detail">{detail}</span> : null}
      {children}
    </>
  );
  return onClick ? (
    <button type="button" className="kpi kpi-link" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="kpi">{content}</div>
  );
}
