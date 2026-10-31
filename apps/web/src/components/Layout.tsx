import { CalendarDays, CircleDollarSign, Clock3, Filter, LayoutDashboard, LogOut, Receipt, RefreshCw, Users } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { businessLineLabels, type LineFilter } from "@dash/shared";
import { useLineFilter } from "../lib/filters";
import { useSession } from "../lib/session";

const nav = [
  { to: "/", label: "Visão geral", icon: LayoutDashboard },
  { to: "/turmas", label: "Turmas", icon: Users },
  { to: "/calendario", label: "Calendário", icon: CalendarDays },
  { to: "/espera", label: "Lista de espera", icon: Clock3 },
  { to: "/inadimplencia", label: "Inadimplência", icon: Receipt },
  { to: "/funil", label: "Funil de leads", icon: Filter },
  { to: "/vendas", label: "Vendas", icon: CircleDollarSign },
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

export function Layout() {
  const { session, logout } = useSession();
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const keep = search.get("linha") ? `?linha=${search.get("linha")}` : "";
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
          <LineSwitch />
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
