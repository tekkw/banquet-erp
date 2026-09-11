import webpush from "npm:web-push@3.6.7";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const subject = Deno.env.get("VAPID_SUBJECT") ?? "https://banquet-erp.vercel.app";
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
async function rest(path: string, options: RequestInit = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  const text = await response.text(); return text ? JSON.parse(text) : null;
}
function kstParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "00";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, hour: Number(value("hour")), minute: Number(value("minute")) };
}
function scheduledAt(date: string, time: string, offset: number) {
  const [year, month, day] = date.split("-").map(Number); const [hour, minute] = time.slice(0, 5).split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute) - offset * 60000);
}

Deno.serve(async (request) => {
  if (request.method === "GET") return publicKey ? json({ publicKey }) : json({ message: "VAPID_PUBLIC_KEY is not configured" }, 503);
  if (request.method !== "POST") return json({ message: "POST only" }, 405);
  if (!url || !serviceKey || !publicKey || !privateKey) return json({ message: "Push secrets are not configured" }, 503);
  webpush.setVapidDetails(subject, publicKey, privateKey);
  try {
    const now = new Date(); const { date } = kstParts(now);
    const items = await rest(`operation_board_items?select=*&board_date=eq.${date}&is_completed=eq.false`);
    const due = (items || []).filter((item: any) => {
      const metadata = item.metadata || {}; if (!metadata.reminderEnabled || !item.item_time) return false;
      const fireAt = scheduledAt(item.board_date, item.item_time, Number(metadata.reminderOffsetMinutes) || 0);
      return fireAt <= now && now.getTime() - fireAt.getTime() < 90000;
    });
    const subscriptions = await rest("push_subscriptions?select=*&is_active=eq.true"); let sent = 0;
    for (const item of due) for (const subscription of subscriptions || []) {
      const fireAt = scheduledAt(item.board_date, item.item_time, Number(item.metadata.reminderOffsetMinutes) || 0).toISOString();
      try {
        const claimed = await rest("operation_push_deliveries?on_conflict=board_date,item_key,scheduled_at,subscription_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ board_date: item.board_date, item_key: item.item_key, scheduled_at: fireAt, subscription_id: subscription.id }) });
        if (!claimed?.length) continue;
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: "VENEZIA 연회 운영", body: `${item.metadata.reminderOffsetMinutes}분 후 ${item.venue_name} ${item.title}\n${String(item.item_time).slice(0, 5)} · ${item.venue_name}`, tag: `${item.board_date}:${item.item_key}`, url: "https://banquet-erp.vercel.app/" }));
        sent += 1;
      } catch (error) {
        await rest(`operation_push_deliveries?board_date=eq.${item.board_date}&item_key=eq.${encodeURIComponent(item.item_key)}&scheduled_at=eq.${encodeURIComponent(fireAt)}&subscription_id=eq.${subscription.id}`, { method: "DELETE" }).catch(() => null);
        if ([404, 410].includes(Number((error as any)?.statusCode))) await rest(`push_subscriptions?id=eq.${subscription.id}`, { method: "PATCH", body: JSON.stringify({ is_active: false }) });
      }
    }
    return json({ checked: due.length, sent });
  } catch (error) { return json({ message: String(error) }, 500); }
});
