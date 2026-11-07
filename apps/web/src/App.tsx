import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { SessionInfo } from "@dash/shared";
import { Layout } from "./components/Layout";
import { Skeleton } from "./components/ui";
import { api, setCsrfToken, setUnauthorizedHandler } from "./lib/api";
import { SessionContext } from "./lib/session";
import { CalendarPage } from "./pages/CalendarPage";
import { GroupsPage } from "./pages/GroupsPage";
import { LoginPage } from "./pages/LoginPage";
import { WaitlistPage } from "./pages/WaitlistPage";

/** A tela inicial é a de turmas; o redirecionamento mantém os filtros da URL (linha, serviços). */
function ToGroups() {
  const { search } = useLocation();
  return <Navigate to={`/turmas${search}`} replace />;
}

export function AppRoutes() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [checking, setChecking] = useState(true);

  const accept = useCallback((value: SessionInfo | null) => {
    setCsrfToken(value?.csrfToken ?? "");
    setSession(value);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => accept(null));
    api<SessionInfo>("/session")
      .then(accept)
      .catch(() => accept(null))
      .finally(() => setChecking(false));
  }, [accept]);

  const logout = useCallback(() => {
    api("/auth/logout", { method: "POST" }).finally(() => accept(null));
  }, [accept]);

  if (checking) return <Skeleton rows={3} label="Abrindo o painel" />;
  if (!session) return <LoginPage onLogin={accept} />;

  return (
    <SessionContext.Provider value={{ session, logout }}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ToGroups />} />
          <Route path="turmas" element={<GroupsPage />} />
          <Route path="calendario" element={<CalendarPage />} />
          <Route path="espera" element={<WaitlistPage />} />
          <Route path="*" element={<ToGroups />} />
        </Route>
      </Routes>
    </SessionContext.Provider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
