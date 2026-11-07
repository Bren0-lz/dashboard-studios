import { useEffect } from "react";
import { CalendarDays, Clock3, Filter, LayoutDashboard, LogOut, Receipt, RefreshCw, Users } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { lineKeyLabels, lineKeys, type BranchesResponse, type FiltersResponse, type LineFilter } from "@dash/shared";
import { setActiveBranch } from "../lib/api";
import { globalFilters, useBranchFilter, usePanelFilter } from "../lib/filters";
import { useRemote } from "../lib/useRemote";
import { useSession } from "../lib/session";

const nav = [
  { to: "/", label: "Visão geral", icon: LayoutDashboard },
  { to: "/turmas", label: "Turmas", icon: Users },
  { to: "/calendario", label: "Calendário", icon: CalendarDays },
  { to: "/espera", label: "Lista de espera", icon: Clock3 },
  { to: "/inadimplencia", label: "Inadimplência", icon: Receipt },
];

const lineOptions: { value: LineFilter; label: string }[] = [
  { value: "all", label: "Tudo" },
  ...lineKeys.map((value) => ({ value, label: lineKeyLabels[value] })),
];

/**
 * Filtro do topo (PT6): linha (Tudo inclui Estética e Outros) e os serviços do CRM, vários ao
 * mesmo tempo, agrupados por linha. Serviço inativo que ainda tem turma aparece marcado. Trocar a
 * linha tira da escolha os serviços de outra linha.
 */
export function LineSwitch() {
  const [filter, setFilter] = usePanelFilter();
  const { data } = useRemote<FiltersResponse>("/filters");
  const options = data?.services ?? [];
  const lineOfService = (id: string) => options.find((option) => option.id === id)?.line;
  const chooseLine = (line: LineFilter) =>
    setFilter({ line, services: line === "all" ? filter.services : filter.services.filter((id) => (lineOfService(id) ?? line) === line) });
  const toggle = (id: string) =>
    setFilter({ ...filter, services: filter.services.includes(id) ? filter.services.filter((item) => item !== id) : [...filter.services, id] });
  const groups = (filter.line === "all" ? lineKeys : [filter.line])
    .map((line) => ({ line, services: options.filter((option) => option.line === line) }))
    .filter((group) => group.services.length > 0);
  const count = filter.services.length;
  return (
    <>
      <div className="segmented" role="group" aria-label="Linha de negócio">
        {lineOptions.map((option) => (
          <button key={option.value} type="button" className={filter.line === option.value ? "active" : ""} aria-pressed={filter.line === option.value} onClick={() => chooseLine(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
      {options.length > 0 ? (
        <details className="service-filter">
          <summary className={count > 0 ? "active" : undefined}>
            <Filter size={16} aria-hidden /> {count > 0 ? `Serviços (${count})` : "Serviços"}
          </summary>
          <div className="service-filter-menu" role="group" aria-label="Serviços">
            {groups.length === 0 ? <p className="service-filter-empty">Nenhum serviço nesta linha.</p> : null}
            {groups.map((group) => (
              <fieldset key={group.line}>
                <legend>{lineKeyLabels[group.line]}</legend>
                {group.services.map((option) => (
                  <label key={option.id} className="service-filter-option">
                    <input type="checkbox" checked={filter.services.includes(option.id)} onChange={() => toggle(option.id)} />
                    <span className={option.active ? undefined : "service-filter-inactive"}>{option.active ? option.name : `${option.name} (inativo)`}</span>
                  </label>
                ))}
              </fieldset>
            ))}
            {count > 0 ? (
              <button type="button" className="link-button" onClick={() => setFilter({ ...filter, services: [] })}>
                Limpar serviços
              </button>
            ) : null}
          </div>
        </details>
      ) : null}
    </>
  );
}

/**
 * Filial (rede toda ou uma só). Some quando o CRM ainda não informa as filiais ou o usuário só
 * tem uma; uma filial salva na URL que não está mais na lista volta para "Todas as filiais".
 */
export function BranchSelect() {
  const [branch, setBranch] = useBranchFilter();
  const { data } = useRemote<BranchesResponse>("/branches");
  const branches = data?.branches ?? [];
  const known = !branch || branches.some((item) => item.id === branch);

  useEffect(() => {
    if (data && !known) setBranch("");
  }, [data, known, setBranch]);

  if (!data?.available || branches.length < 2) return null;
  return (
    <label className="branch-select">
      <span className="sr-only">Filial</span>
      <select value={known ? branch : ""} onChange={(event) => setBranch(event.target.value)}>
        <option value="">Todas as filiais</option>
        {branches.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Layout() {
  const { session, logout } = useSession();
  const location = useLocation();
  const keep = globalFilters(location.search);
  const [branch] = useBranchFilter();

  // Gravações e buscas feitas fora do `useRemote` (inscrever, buscar cliente) usam a mesma filial.
  useEffect(() => setActiveBranch(branch), [branch]);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-name">Studios Aryana</span>
          <span className="brand-sub">Vendas</span>
        </div>
        <nav className="nav">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={`${to}${keep}`} end={to === "/"} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              <Icon size={18} aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="user-name">{session.user.fullName}</span>
          <button type="button" className="link-button" onClick={logout}>
            <LogOut size={16} aria-hidden /> Sair
          </button>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <div className="topbar-filters">
            <LineSwitch />
            {/* Na tela de turmas o seletor fica no topo da própria tela (PT1). */}
            {location.pathname === "/turmas" ? null : <BranchSelect />}
          </div>
          <button type="button" className="secondary-button" onClick={() => window.dispatchEvent(new Event("dash:refresh"))}>
            <RefreshCw size={16} aria-hidden /> Atualizar
          </button>
        </div>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
