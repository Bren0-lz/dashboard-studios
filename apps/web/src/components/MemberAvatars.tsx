import { initials, memberBubbles } from "@dash/shared";

/**
 * Bolinhas com as iniciais dos alunos (até `max`, depois "+N"). Só visuais, para caber dentro de
 * outro botão (cartões do calendário).
 */
export function MemberAvatars({ names, max = 6, size = "md" }: { names: readonly string[]; max?: number; size?: "sm" | "md" }) {
  const { shown, extra } = memberBubbles(names, max);
  if (shown.length === 0) return null;
  return (
    <span className={`avatar-stack${size === "sm" ? " avatar-stack-sm" : ""}`} title={names.join(", ")} aria-hidden="true">
      {shown.map((name, index) => (
        <span key={`${name}-${index}`} className="avatar">
          {initials(name)}
        </span>
      ))}
      {extra > 0 ? <span className="avatar avatar-more">+{extra}</span> : null}
    </span>
  );
}
