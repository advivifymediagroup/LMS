import { requireUser } from "@/lib/auth";
import { getSetting } from "@/lib/leave";
import type { SmtpSettings } from "@/lib/mail";
import { ActionForm } from "../../action-form";
import { runJobsNow, saveSettings, sendRemindersNow, sendTestEmail } from "../policy-actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function SettingsPage() {
  await requireUser(["ADMIN"]);
  const [workingDays, timezone, probationMonths, creditsFrom, notifyAlways, smtp] = await Promise.all([
    getSetting("workingDays", [1, 2, 3, 4, 5]),
    getSetting("timezone", "Asia/Kolkata"),
    getSetting("probationMonths", 3),
    getSetting("creditsFrom", ""),
    getSetting<string[]>("notifyAlways", []),
    getSetting<SmtpSettings | null>("smtp", null),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="h1">System settings</h1>
      <ActionForm action={saveSettings} submit="Save settings">
        <h2 className="font-medium">Company</h2>
        <div>
          <span className="label">Working days</span>
          <div className="flex flex-wrap gap-4">
            {DAYS.map((d, i) => (
              <label key={d} className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="workingDays" value={i} defaultChecked={workingDays.includes(i)} /> {d}
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="timezone">Timezone</label>
            <input className="input" id="timezone" name="timezone" defaultValue={timezone} required />
          </div>
          <div>
            <label className="label" htmlFor="probationMonths">Probation (months)</label>
            <input className="input" id="probationMonths" name="probationMonths" type="number" min={0} max={24} defaultValue={probationMonths} />
          </div>
          <div>
            <label className="label" htmlFor="creditsFrom">Automatic credits from</label>
            <input className="input" id="creditsFrom" name="creditsFrom" type="month" defaultValue={creditsFrom} required />
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Monthly and yearly credits are only added from this month on; opening balances cover the time before it.
          Moving it earlier credits the missed months to everyone on the next run.
        </p>
        <div>
          <label className="label" htmlFor="notifyAlways">Always email on every application (HR, Finance)</label>
          <input className="input" id="notifyAlways" name="notifyAlways" defaultValue={notifyAlways.join(", ")} />
        </div>

        <h2 className="pt-2 font-medium">Email (SMTP)</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="smtpHost">Host</label>
            <input className="input" id="smtpHost" name="smtpHost" defaultValue={smtp?.host} placeholder="smtp.gmail.com" />
          </div>
          <div>
            <label className="label" htmlFor="smtpPort">Port</label>
            <input className="input" id="smtpPort" name="smtpPort" type="number" defaultValue={smtp?.port ?? 587} />
          </div>
          <div>
            <label className="label" htmlFor="smtpUser">Username</label>
            <input className="input" id="smtpUser" name="smtpUser" defaultValue={smtp?.user} autoComplete="off" />
          </div>
          <div>
            <label className="label" htmlFor="smtpPass">Password</label>
            <input className="input" id="smtpPass" name="smtpPass" type="password" autoComplete="new-password"
              placeholder={smtp?.pass ? "Saved; leave blank to keep" : ""} />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="smtpSecure" defaultChecked={smtp?.secure} /> Use TLS (port 465)
          </label>
          <div className="sm:col-span-3">
            <label className="label" htmlFor="smtpFrom">From</label>
            <input className="input" id="smtpFrom" name="smtpFrom" defaultValue={smtp?.from} placeholder="Leave Management <lms@company.com>" />
          </div>
        </div>
      </ActionForm>

      <div className="grid gap-4 sm:grid-cols-3">
        <ActionForm action={sendTestEmail} submit="Send test email" submitClass="btn">
          <p className="text-sm text-gray-600">Sends a test email to you with the saved settings.</p>
        </ActionForm>
        <ActionForm action={runJobsNow} submit="Run jobs now" submitClass="btn">
          <p className="text-sm text-gray-600">Credits and year-end run every hour automatically. Running again adds nothing twice.</p>
        </ActionForm>
        <ActionForm action={sendRemindersNow} submit="Send reminders now" submitClass="btn">
          <p className="text-sm text-gray-600">Approvers get a daily digest of pending requests after 9:00.</p>
        </ActionForm>
      </div>
    </div>
  );
}
export const metadata = { title: "System settings" };
