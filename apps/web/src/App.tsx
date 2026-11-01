import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { SessionInfo } from "@dash/shared";
import { Layout } from "./components/Layout";
import { Skeleton } from "./components/ui";
import { api, setCsrfToken, setUnauthorizedHandler } from "./lib/api";
import { SessionContext } from "./lib/session";
import { CalendarPage } from "./pages/CalendarPage";
import { GroupsPage } from "./pages/GroupsPage";
import { LoginPage } from "./pages/LoginPage";
import { OverduePage } from "./pages/OverduePage";
import { OverviewPage } from "./pages/OverviewPage";
import { WaitlistPage } from "./pages/WaitlistPage";

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
          <Route index element={<OverviewPage />} />
          <Route path="turmas" element={<GroupsPage />} />
          <Route path="calendario" element={<CalendarPage />} />
          <Route path="espera" element={<WaitlistPage />} />
          <Route path="inadimplencia" element={<OverduePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
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
