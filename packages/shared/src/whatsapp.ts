import { firstName, formatMoney, onlyDigits, shortDate } from "./format.js";

/** Link `wa.me` com DDI 55 quando o número vier só com DDD. */
export function whatsappLink(phone: string | undefined, message: string): string | null {
  if (!phone) return null;
  let digits = onlyDigits(phone);
  if (digits.length < 10) return null;
  if (digits.length <= 11) digits = `55${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function chargeMessage(input: {
  patientName: string;
  amountInCents: number;
  oldestDueDate: string;
  clinicName: string;
  pixKey?: string | undefined;
}): string {
  const pix = input.pixKey ? ` Se preferir, a chave Pix é ${input.pixKey}.` : "";
  return (
    `Olá, ${firstName(input.patientName)}! Tudo bem? Aqui é do ${input.clinicName}. ` +
    `Identificamos um pagamento em aberto de ${formatMoney(input.amountInCents)}, com vencimento em ${shortDate(input.oldestDueDate)}.` +
    `${pix} Qualquer dúvida, estamos à disposição.`
  );
}

export function seatOfferMessage(input: { patientName: string; itemName: string; clinicName: string; schedule?: string | undefined }): string {
  const when = input.schedule ? ` (${input.schedule})` : "";
  return (
    `Olá, ${firstName(input.patientName)}! Aqui é do ${input.clinicName}. ` +
    `Abriu uma vaga em ${input.itemName}${when}, que você estava aguardando. Quer garantir o seu lugar?`
  );
}

export function renewalMessage(input: { patientName: string; planName: string; validUntil: string; clinicName: string }): string {
  return (
    `Olá, ${firstName(input.patientName)}! Aqui é do ${input.clinicName}. ` +
    `Seu plano ${input.planName} vence em ${shortDate(input.validUntil)}. Vamos renovar para você não perder seu horário?`
  );
}

export function leadFollowUpMessage(input: { leadName: string; interest: string; clinicName: string }): string {
  return (
    `Olá, ${firstName(input.leadName)}! Aqui é do ${input.clinicName}. ` +
    `Ainda tem interesse em ${input.interest}? Posso te ajudar a escolher o melhor horário.`
  );
}
