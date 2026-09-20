import webpush from "web-push";
import { vapidDetails } from "./vapid.server";

type DueRow = {
  alarm_id: string;
  device_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

export async function dispatchDuePushes() {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const due = await sql<DueRow>`
    select
      a.alarm_id,
      a.device_id,
      d.endpoint,
      d.p256dh,
      d.auth_key
    from push_alarms a
    join push_devices d on d.device_id = a.device_id
    where a.sent_at is null
      and a.fire_at <= now() + interval '20 seconds'
    order by a.fire_at asc
    limit 80
  `;

  let sent = 0;
  let failed = 0;

  webpush.setVapidDetails(
    vapidDetails.subject,
    vapidDetails.publicKey,
    vapidDetails.privateKey,
  );

  for (const row of due) {
    const occurrenceId = row.alarm_id.replace(/:[0-2]$/, "");
    const payload = JSON.stringify({
      type: "dose",
      occurrenceId,
      alarmId: row.alarm_id,
    });
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth_key },
        },
        payload,
        { TTL: 180, urgency: "high" },
      );
      sent += 1;
      await sql`
        update push_alarms
        set sent_at = now()
        where device_id = ${row.device_id} and alarm_id = ${row.alarm_id}
      `;
    } catch (err) {
      failed += 1;
      const status =
        err && typeof err === "object" && "statusCode" in err
          ? Number((err as { statusCode?: number }).statusCode)
          : 0;
      if (status === 404 || status === 410) {
        await sql`delete from push_devices where device_id = ${row.device_id}`;
      } else {
        await sql`
          update push_alarms
          set sent_at = now()
          where device_id = ${row.device_id} and alarm_id = ${row.alarm_id}
        `;
      }
    }
  }

  return { scanned: due.length, sent, failed };
}
