import { createContext, useContext } from "react";
import type { SessionInfo } from "@dash/shared";

export interface SessionContextValue {
  session: SessionInfo;
  logout: () => void;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession fora do SessionContext");
  return value;
}
