import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const subSchema = z.object({
  deviceId: z.string().min(8).max(80),
  endpoint: z.string().url().max(2048),
  p256dh: z.string().min(10).max(256),
  auth: z.string().min(4).max(128),
});

const syncSchema = z.object({
  deviceId: z.string().min(8).max(80),
  fires: z
    .array(
      z.object({
        id: z.string().min(3).max(160),
        at: z.number().int().positive(),
      }),
    )
    .max(180),
});

const ackSchema = z.object({
  deviceId: z.string().min(8).max(80),
  occurrenceId: z.string().min(3).max(160),
});

export const subscribeDevice = createServerFn({ method: "POST" })
  .validator(subSchema)
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      insert into push_devices (device_id, endpoint, p256dh, auth_key, updated_at)
      values (${data.deviceId}, ${data.endpoint}, ${data.p256dh}, ${data.auth}, now())
      on conflict (device_id) do update set
        endpoint = excluded.endpoint,
        p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        updated_at = now()
    `;
    return { ok: true as const };
  });

export const syncPushAlarms = createServerFn({ method: "POST" })
  .validator(syncSchema)
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const exists = await sql<{ device_id: string }>`
      select device_id from push_devices where device_id = ${data.deviceId} limit 1
    `;
    if (!exists[0]) return { ok: false as const, reason: "no-device" };

    await sql`delete from push_alarms where device_id = ${data.deviceId} and sent_at is null`;

    for (const fire of data.fires) {
      const iso = new Date(fire.at).toISOString();
      await sql`
        insert into push_alarms (alarm_id, device_id, fire_at, sent_at)
        values (${fire.id}, ${data.deviceId}, ${iso}, null)
        on conflict (device_id, alarm_id) do update set
          fire_at = excluded.fire_at,
          sent_at = null
      `;
    }
    return { ok: true as const, count: data.fires.length };
  });

export const ackPushOccurrence = createServerFn({ method: "POST" })
  .validator(ackSchema)
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const like = `${data.occurrenceId}%`;
    await sql`
      delete from push_alarms
      where device_id = ${data.deviceId}
        and alarm_id like ${like}
        and sent_at is null
    `;
    return { ok: true as const };
  });
