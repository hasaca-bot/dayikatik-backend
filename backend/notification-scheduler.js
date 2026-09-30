// Load pending jobs once, then wake only when a job is due. No database polling.
function createNotificationScheduler({ db, send, enabled = true, now = Date.now,
  setTimer = setTimeout, clearTimer = clearTimeout, onError = console.error }) {
  const jobs = new Map();
  const placeholder = n => db.type === 'pg' ? `$${n}` : '?';
  const maxDelay = 2 ** 31 - 1;
  const retryDelay = 10 * 60 * 1000;
  let stopped = false;

  function cancel(id) {
    const job = jobs.get(id);
    if (job) clearTimer(job.timer);
    jobs.delete(id);
  }

  function arm(job, dueAt = job.dueAt) {
    if (stopped || jobs.get(job.id) !== job) return;
    const remaining = Math.max(0, dueAt - now());
    job.timer = setTimer(() => {
      // Long delays are split in memory, without waking the database.
      if (dueAt > now()) return arm(job, dueAt);
      return run(job);
    }, Math.min(remaining, maxDelay));
    job.timer.unref?.();
  }

  async function run(job) {
    if (stopped || jobs.get(job.id) !== job) return;
    let notification;
    try {
      // Atomic claim prevents two application instances from sending the same job.
      notification = await db.get(
        `UPDATE notifications SET status = 'sending' WHERE id = ${placeholder(1)} AND status = 'pending' RETURNING *`,
        [job.id]
      );
    } catch (error) {
      onError('[SCHEDULER] Job claim failed; retrying in ten minutes.', error);
      arm(job, now() + retryDelay);
      return;
    }
    jobs.delete(job.id);
    if (!notification) return; // Deleted or already claimed by another instance.
    try {
      await send(notification);
    } catch (error) {
      onError('[SCHEDULER] Notification delivery failed.', error);
      try {
        await db.run(`UPDATE notifications SET status = 'failed' WHERE id = ${placeholder(1)} AND status = 'sending'`, [job.id]);
      } catch (updateError) { onError('[SCHEDULER] Could not record delivery failure.', updateError); }
    }
  }

  function schedule(notification) {
    if (!enabled || stopped) return;
    const dueAt = Date.parse(notification.scheduled_at);
    if (!Number.isFinite(dueAt)) {
      onError(`[SCHEDULER] Invalid scheduled date for ${notification.id}`);
      return;
    }
    cancel(notification.id);
    const job = { id: notification.id, dueAt, timer: null };
    jobs.set(job.id, job);
    arm(job);
  }

  return {
    async start() {
      if (!enabled || stopped) return;
      const pending = await db.all("SELECT id, scheduled_at FROM notifications WHERE status = 'pending' AND scheduled_at IS NOT NULL");
      pending.forEach(schedule);
    },
    schedule, cancel,
    stop() {
      stopped = true;
      for (const id of jobs.keys()) cancel(id);
    }
  };
}

module.exports = { createNotificationScheduler };
