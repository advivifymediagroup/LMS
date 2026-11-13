import { decideLeave } from "../leaves/actions";
import { SubmitButton } from "../../submit-button";

/** Approve in one click; Decline opens a reason field (a reason is required to reject). */
export function LeaveDecision({ id, back }: { id: number; back: "/dashboard" | "/leave" }) {
  const action = decideLeave.bind(null, id);
  return (
    <div className="flex flex-wrap items-start justify-end gap-1.5">
      <details className="group">
        <summary className="btn btn-sm list-none [&::-webkit-details-marker]:hidden">Decline</summary>
        <form action={action} className="mt-2 flex w-64 flex-col gap-2 rounded-[10px] border border-gray-300 bg-white p-2.5">
          <input type="hidden" name="back" value={back} />
          <input className="input h-9" name="reason" placeholder="Reason (sent to the employee)" required minLength={3} />
          <SubmitButton className="btn btn-sm btn-danger" name="decision" value="REJECT" pendingText="Declining…">Decline request</SubmitButton>
        </form>
      </details>
      <form action={action}>
        <input type="hidden" name="back" value={back} />
        <SubmitButton className="btn btn-sm btn-primary" name="decision" value="APPROVE" pendingText="Approving…">Approve</SubmitButton>
      </form>
    </div>
  );
}
