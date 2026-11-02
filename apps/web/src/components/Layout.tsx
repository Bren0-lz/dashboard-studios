import { useEffect } from "react";
import { CalendarDays, Clock3, LayoutDashboard, LogOut, Receipt, RefreshCw, Users } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { businessLineLabels, type BranchesResponse, type LineFilter } from "@dash/shared";
import { setActiveBranch } from "../lib/api";
import { globalFilters, useBranchFilter, useLineFilter } from "../lib/filters";
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
  { value: "studio", label: businessLineLabels.studio },
  { value: "aesthetics", label: businessLineLabels.aesthetics },
];

export function LineSwitch() {
  const [line, setLine] = useLineFilter();
  return (
    <div className="segmented" role="group" aria-label="Linha de negócio">
      {lineOptions.map((option) => (
        <button key={option.value} type="button" className={line === option.value ? "active" : ""} aria-pressed={line === option.value} onClick={() => setLine(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
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
            <BranchSelect />
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
