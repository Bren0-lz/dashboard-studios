import { randomBytes } from "node:crypto";
import type { CrmUser } from "@dash/shared";

export interface Session {
  id: string;
  csrfToken: string;
  crmToken: string;
  user: CrmUser;
  expiresAt: number;
}

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Sessões no servidor: o token do usuário no CRM fica aqui e nunca vai para o navegador
 * (o cookie só carrega o id aleatório, assinado). Memória basta para um processo na Hostinger;
 * reiniciar o servidor pede login de novo.
 */
export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly now: () => number = Date.now) {}

  create(crmToken: string, user: CrmUser): Session {
    this.prune();
    const session: Session = {
      id: randomBytes(32).toString("base64url"),
      csrfToken: randomBytes(24).toString("base64url"),
      crmToken,
      user,
      expiresAt: this.now() + SESSION_TTL_MS,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string | undefined): Session | undefined {
    if (!id) return undefined;
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (session.expiresAt <= this.now()) {
      this.sessions.delete(id);
      return undefined;
    }
    return session;
  }

  delete(id: string | undefined): void {
    if (id) this.sessions.delete(id);
  }

  private prune(): void {
    const now = this.now();
    for (const [id, session] of this.sessions) if (session.expiresAt <= now) this.sessions.delete(id);
  }
}
