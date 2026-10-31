import type { Capabilities, CrmUser } from "@dash/shared";

/** Ações visíveis para o usuário (a API do CRM recusa de qualquer forma). */
export function capabilitiesOf(user: CrmUser): Capabilities {
  const admin = user.role === "admin";
  const has = (key: string) => admin || user.permissions.includes(key);
  return {
    enroll: has("groups.enroll"),
    cancelEnrollment: has("groups.cancel_enrollment"),
    sellPlan: has("plans.purchase"),
    createPatient: has("patients.create"),
    manageWaitlist: has("waitlist.manage"),
    seeFinance: admin || user.modules.includes("finance") || user.permissions.includes("finance.view"),
    moveLeads: has("crm.stage"),
    contactLeads: has("crm.contacts_create"),
    convertLeads: has("crm.convert"),
  };
}
