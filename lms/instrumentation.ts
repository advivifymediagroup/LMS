// Runs once when the server starts: kicks off the hourly job loop (Node runtime only).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runAllJobs } = await import("./lib/jobs");
  const g = globalThis as unknown as { lmsScheduler?: boolean };
  if (g.lmsScheduler) return; // dev hot reload
  g.lmsScheduler = true;

  // ponytail: in-process timer, fine for one server. With several instances, call the jobs from one cron instead.
  const run = () => runAllJobs().then((r) => console.log("[jobs]", r)).catch((e) => console.error("[jobs]", e));
  setTimeout(run, 15_000);
  setInterval(run, 60 * 60 * 1000);
}
