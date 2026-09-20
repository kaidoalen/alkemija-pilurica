import { createFileRoute } from "@tanstack/react-router";

function isAuthorized(request: Request): boolean {
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}

export const Route = createFileRoute("/api/cron/push")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthorized(request)) {
          return new Response("forbidden", { status: 403 });
        }
        const { dispatchDuePushes } = await import("@/lib/push/dispatch.server");
        const result = await dispatchDuePushes();
        return Response.json(result);
      },
    },
  },
});
