import { initials, memberBubbles } from "@dash/shared";

/**
 * Bolinhas com as iniciais dos alunos (até `max`, depois "+N"). Com `onOpen` vira botão (cartão da
 * turma); sem ele é só visual, para caber dentro de outro botão (cartões do calendário).
 */
export function MemberAvatars({
  names,
  groupName,
  max = 6,
  size = "md",
  onOpen,
}: {
  names: readonly string[];
  groupName: string;
  max?: number;
  size?: "sm" | "md";
  onOpen?: () => void;
}) {
  const { shown, extra } = memberBubbles(names, max);
  if (shown.length === 0) return null;
  const className = `avatar-stack${size === "sm" ? " avatar-stack-sm" : ""}`;
  const bubbles = (
    <>
      {shown.map((name, index) => (
        <span key={`${name}-${index}`} className="avatar" title={onOpen ? name : undefined}>
          {initials(name)}
        </span>
      ))}
      {extra > 0 ? <span className="avatar avatar-more">+{extra}</span> : null}
    </>
  );
  if (onOpen)
    return (
      <button type="button" className={className} onClick={onOpen} aria-label={`Ver alunos de ${groupName}`}>
        {bubbles}
      </button>
    );
  return (
    <span className={className} title={names.join(", ")} aria-hidden="true">
      {bubbles}
    </span>
  );
}
