import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { EnrollResult, GroupDetailsResponse, GroupRow } from "@dash/shared";
import { EnrollDialog } from "../components/EnrollDialog";
import { GroupDrawer } from "../components/GroupDrawer";
import { Notice } from "../components/ui";

/** Gaveta da turma (`?turma=`) + inscrição, compartilhadas entre tabela e calendário. */
export function useGroupFlow(planSale: boolean, onChanged: () => void) {
  const [params, setParams] = useSearchParams();
  const openId = params.get("turma");
  const [enrolling, setEnrolling] = useState<GroupRow | GroupDetailsResponse | null>(null);
  const [message, setMessage] = useState<EnrollResult | null>(null);
  const [drawerKey, setDrawerKey] = useState(0);

  const setOpen = (id: string | null) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (id) copy.set("turma", id);
        else copy.delete("turma");
        return copy;
      },
      { replace: true },
    );

  const ui = (
    <>
      {message ? <Notice tone={message.status === "active" ? "success" : "warning"}>{message.message}</Notice> : null}
      {openId ? (
        <GroupDrawer key={`${openId}:${drawerKey}`} groupId={openId} onClose={() => setOpen(null)} onEnroll={setEnrolling} onChanged={onChanged} />
      ) : null}
      {enrolling ? (
        <EnrollDialog
          group={enrolling}
          planSale={planSale}
          onClose={() => setEnrolling(null)}
          onDone={(result) => {
            setEnrolling(null);
            setMessage(result);
            setDrawerKey((value) => value + 1);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
  return { open: setOpen, enroll: setEnrolling, ui };
}
