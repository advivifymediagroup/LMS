"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { LoadingSpinner } from "../../../loading-ui";
import { SubmitButton } from "../../../submit-button";
import { applyLeave, previewLeave, type Preview } from "../actions";

type TypeOption = { id: number; name: string; allowHalfDay: boolean; hint: string };

export function ApplyForm({ types, today }: { types: TypeOption[]; today: string }) {
  const [error, action, pending] = useActionState(applyLeave, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [typeId, setTypeId] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [preview, setPreview] = useState<Preview>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [tick, setTick] = useState(0); // refreshes the preview when a half-day option changes
  const seq = useRef(0);

  const type = types.find((t) => String(t.id) === typeId);
  const single = !end || start === end;

  useEffect(() => {
    const n = ++seq.current;
    if (!formRef.current || !typeId || !start) {
      setPreview(null);
      setPreviewPending(false);
      return;
    }

    const data = new FormData(formRef.current);
    setPreview(null);
    setPreviewPending(true);
    const timer = setTimeout(async () => {
      try {
        const res = await previewLeave(data);
        if (n === seq.current) setPreview(res); // ignore stale responses
      } finally {
        if (n === seq.current) setPreviewPending(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [typeId, start, end, tick]);

  return (
    <form ref={formRef} action={action} className="card space-y-4">
      {error && <p className="error">{error}</p>}

      <div>
        <label className="label" htmlFor="leaveTypeId">Leave type</label>
        <select className="input" id="leaveTypeId" name="leaveTypeId" value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
          <option value="" disabled>Choose…</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.hint}</option>)}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="startDate">From</label>
          <input className="input" id="startDate" name="startDate" type="date" value={start} required
            onChange={(e) => { setStart(e.target.value); if (!end || end < e.target.value) setEnd(e.target.value); }} />
        </div>
        <div>
          <label className="label" htmlFor="endDate">To</label>
          <input className="input" id="endDate" name="endDate" type="date" value={end} min={start} required onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>

      {type?.allowHalfDay !== false && (single ? (
        <div>
          <label className="label" htmlFor="startHalf">Duration</label>
          <select className="input" id="startHalf" name="startHalf" defaultValue="FULL" onChange={() => setTick((t) => t + 1)}>
            <option value="FULL">Full day</option>
            <option value="FIRST">First half</option>
            <option value="SECOND">Second half</option>
          </select>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="startHalf">First day</label>
            <select className="input" id="startHalf" name="startHalf" defaultValue="FULL" onChange={() => setTick((t) => t + 1)}>
              <option value="FULL">Full day</option>
              <option value="SECOND">From second half</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="endHalf">Last day</label>
            <select className="input" id="endHalf" name="endHalf" defaultValue="FULL" onChange={() => setTick((t) => t + 1)}>
              <option value="FULL">Full day</option>
              <option value="FIRST">Until first half</option>
            </select>
          </div>
        </div>
      ))}

      {previewPending && (
        <p role="status" aria-live="polite" className="notice flex items-center gap-2">
          <LoadingSpinner />
          Checking leave dates…
        </p>
      )}
      {!previewPending && preview && (preview.ok
        ? <p className={preview.warning ? "notice" : "success"}>
            {preview.days} day(s) will be charged
            {preview.available !== null && <>; {preview.available} available, {preview.available - preview.days} left after</>}.
            {preview.warning && <> {preview.warning}</>}
          </p>
        : <p className="error">{preview.error}</p>)}

      <div>
        <label className="label" htmlFor="reason">Reason</label>
        <textarea className="input" id="reason" name="reason" rows={3} required minLength={3} maxLength={1000} />
      </div>
      <div>
        <label className="label" htmlFor="cc">Team members to notify (emails, comma separated)</label>
        <input className="input" id="cc" name="cc" placeholder="name@company.com, other@company.com" />
      </div>
      <div>
        <label className="label" htmlFor="note">Note for the email (optional)</label>
        <textarea className="input" id="note" name="note" rows={2} maxLength={1000} />
      </div>

      <SubmitButton className="btn btn-primary hover:cursor-pointer" disabled={pending || previewPending || (preview !== null && !preview.ok)} pendingText="Submitting request…">
        Submit request
      </SubmitButton>
    </form>
  );
}
