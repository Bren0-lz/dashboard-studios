import { Search, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import {
  addDays,
  formatMoney,
  formatPhone,
  type EnrollResult,
  type ExternalPatientSummary,
  type GroupRow,
  type PlanTemplate,
} from "@dash/shared";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { useAction } from "../lib/useAction";
import { Modal, Notice } from "./ui";

type Mode = "enroll" | "sell";

/**
 * Inscrever em 3 passos: cliente (busca ou cadastro) → só inscrever ou vender plano → confirmar.
 * Turma cheia: avisa que a pessoa entra na espera.
 */
export function EnrollDialog({
  group,
  planSale,
  initialPatient,
  onClose,
  onDone,
}: {
  group: Pick<GroupRow, "id" | "name" | "schedule" | "freeSeats" | "serviceId">;
  planSale: boolean;
  initialPatient?: Pick<ExternalPatientSummary, "id" | "fullName" | "phone">;
  onClose: () => void;
  onDone: (result: EnrollResult) => void;
}) {
  const { session } = useSession();
  const [patient, setPatient] = useState<Pick<ExternalPatientSummary, "id" | "fullName" | "phone"> | null>(initialPatient ?? null);
  const canSell = planSale && session.can.sellPlan;
  const [mode, setMode] = useState<Mode>(session.can.enroll ? "enroll" : "sell");
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [installments, setInstallments] = useState(1);
  const [firstDueDate, setFirstDueDate] = useState(() => addDays(new Date().toISOString().slice(0, 10), 5));
  const action = useAction();
  const full = group.freeSeats <= 0;

  useEffect(() => {
    if (!canSell) return;
    api<{ templates: PlanTemplate[] }>("/plan-templates")
      .then((result) => {
        const own = result.templates.filter((template) => template.services.some((item) => item.serviceId === group.serviceId));
        setTemplates(own.length ? own : result.templates);
      })
      .catch(() => setTemplates([]));
  }, [canSell, group.serviceId]);

  const template = templates.find((item) => item.id === templateId);
  const maxInstallments = template?.maxInstallments ?? 12;

  async function confirm() {
    if (!patient) return;
    const result =
      mode === "enroll"
        ? await action.run<EnrollResult>(`/groups/${group.id}/enroll`, "POST", { patientId: patient.id })
        : await action.run<EnrollResult>(`/groups/${group.id}/sell`, "POST", { patientId: patient.id, planTemplateId: templateId, installments, firstDueDate });
    if (result) onDone(result);
  }

  return (
    <Modal title={`Inscrever em ${group.name}`} onClose={onClose} busy={action.busy}>
      <p className="panel-context">
        {group.schedule} · {full ? "turma cheia" : `${group.freeSeats} ${group.freeSeats === 1 ? "vaga livre" : "vagas livres"}`}
      </p>
      {full ? <Notice tone="warning">A turma está cheia: a pessoa entra na lista de espera da turma e sobe quando abrir vaga.</Notice> : null}

      <h3 className="step-title">1. Cliente</h3>
      {patient ? (
        <div className="picked">
          <div>
            <strong>{patient.fullName}</strong>
            <span>{formatPhone(patient.phone)}</span>
          </div>
          {initialPatient ? null : (
            <button type="button" className="link-button" onClick={() => setPatient(null)} disabled={action.busy}>
              Trocar
            </button>
          )}
        </div>
      ) : (
        <PatientPicker onPick={setPatient} />
      )}

      {patient ? (
        <>
          <h3 className="step-title">2. Como vender</h3>
          <div className="choice-row" role="radiogroup" aria-label="Como vender">
            {session.can.enroll ? (
              <label className={`choice${mode === "enroll" ? " active" : ""}`}>
                <input type="radio" name="mode" checked={mode === "enroll"} onChange={() => setMode("enroll")} />
                <span>Só inscrever</span>
                <small>Cliente já tem plano</small>
              </label>
            ) : null}
            {canSell ? (
              <label className={`choice${mode === "sell" ? " active" : ""}`}>
                <input type="radio" name="mode" checked={mode === "sell"} onChange={() => setMode("sell")} />
                <span>Vender plano</span>
                <small>Gera as parcelas no financeiro</small>
              </label>
            ) : null}
          </div>
          {mode === "sell" ? (
            <div className="form-grid">
              <label className="field field-wide">
                <span>Plano</span>
                <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                  <option value="">Escolha o plano</option>
                  {templates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} — {formatMoney(item.totalValueInCents)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Parcelas</span>
                <select value={installments} onChange={(event) => setInstallments(Number(event.target.value))}>
                  {Array.from({ length: maxInstallments }, (_, index) => index + 1).map((value) => (
                    <option key={value} value={value}>
                      {value}x{template ? ` de ${formatMoney(Math.round(template.totalValueInCents / value))}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>1º vencimento</span>
                <input type="date" value={firstDueDate} onChange={(event) => setFirstDueDate(event.target.value)} />
              </label>
            </div>
          ) : null}
        </>
      ) : null}

      {action.error ? <p className="form-error">{action.error}</p> : null}
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>
          Voltar
        </button>
        <button type="button" className="primary-button" onClick={confirm} disabled={!patient || action.busy || (mode === "sell" && !templateId)}>
          {action.busy ? "Salvando…" : full ? "Colocar na espera" : mode === "sell" ? "Vender e inscrever" : "Confirmar inscrição"}
        </button>
      </div>
    </Modal>
  );
}

export function PatientPicker({ onPick }: { onPick: (patient: ExternalPatientSummary) => void }) {
  const { session } = useSession();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ExternalPatientSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      api<ExternalPatientSummary[]>(`/patients?search=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((value) => {
          setResults(value);
          setError(null);
        })
        .catch((err: Error) => {
          if (err.name !== "AbortError") setError(err.message);
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  if (creating) return <NewPatientForm initialName={search} onCancel={() => setCreating(false)} onCreated={onPick} />;

  return (
    <div className="picker">
      <label className="search-field">
        <Search size={16} aria-hidden />
        <input placeholder="Buscar cliente por nome ou telefone" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Buscar cliente" />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <p className="muted">Buscando…</p> : null}
      {results.length > 0 ? (
        <ul className="picker-list">
          {results.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => onPick(item)}>
                <strong>{item.fullName}</strong>
                <span>
                  {formatPhone(item.phone)}
                  {item.activePlans.length ? ` · ${item.activePlans.map((plan) => plan.name).join(", ")}` : " · sem plano ativo"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : search.trim().length >= 2 && !loading ? (
        <p className="muted">Nenhum cliente encontrado.</p>
      ) : null}
      {session.can.createPatient ? (
        <button type="button" className="link-button" onClick={() => setCreating(true)}>
          <UserPlus size={16} aria-hidden /> Novo cliente
        </button>
      ) : null}
    </div>
  );
}

function NewPatientForm({ initialName, onCancel, onCreated }: { initialName: string; onCancel: () => void; onCreated: (patient: ExternalPatientSummary) => void }) {
  const [fullName, setFullName] = useState(/\d/.test(initialName) ? "" : initialName);
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState(/\d/.test(initialName) ? initialName : "");
  const [email, setEmail] = useState("");
  const action = useAction();
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const created = await action.run<{ id: string; fullName: string; phone: string }>("/patients", "POST", { fullName, cpf, phone, email });
    if (created) onCreated({ ...created, tags: [], activePlans: [], activeGroups: [] });
  }
  return (
    <form className="form-grid nested-form" onSubmit={save}>
      <label className="field field-wide">
        <span>Nome completo</span>
        <input value={fullName} onChange={(event) => setFullName(event.target.value)} required minLength={3} />
      </label>
      <label className="field">
        <span>CPF</span>
        <input inputMode="numeric" value={cpf} onChange={(event) => setCpf(event.target.value)} required />
      </label>
      <label className="field">
        <span>Telefone (WhatsApp)</span>
        <input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required />
      </label>
      <label className="field field-wide">
        <span>E-mail (opcional)</span>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      {action.error ? <p className="form-error field-wide">{action.error}</p> : null}
      <div className="modal-actions field-wide">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={action.busy}>
          Voltar à busca
        </button>
        <button type="submit" className="primary-button" disabled={action.busy}>
          {action.busy ? "Salvando…" : "Cadastrar cliente"}
        </button>
      </div>
    </form>
  );
}
