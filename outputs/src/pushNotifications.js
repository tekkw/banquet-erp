(function registerPushNotifications() {
  const config = window.BANQUET_ERP_CONSTANTS?.supabaseConfig;
  const functionUrl = `${config?.url || ""}/functions/v1/send-operation-push`;

  function decodeKey(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const bytes = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bytes, (char) => char.charCodeAt(0));
  }

  async function request(path, options = {}) {
    const response = await fetch(`${config.url}/rest/v1/${path}`, {
      ...options,
      headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}`, "Content-Type": "application/json", ...(options.headers || {}) },
    });
    if (!response.ok) throw new Error(`Push subscription storage ${response.status}`);
    return response;
  }

  async function registration() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("이 브라우저는 Web Push를 지원하지 않습니다.");
    return navigator.serviceWorker.register("./push-sw.js", { scope: "./" });
  }

  async function currentSubscription() {
    const worker = await registration();
    return { worker, subscription: await worker.pushManager.getSubscription() };
  }

  async function enable() {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("알림 권한이 허용되지 않았습니다.");
    const { worker, subscription: existing } = await currentSubscription();
    const keyResponse = await fetch(functionUrl, { headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` } });
    if (!keyResponse.ok) throw new Error("Push 공개키를 불러오지 못했습니다.");
    const { publicKey } = await keyResponse.json();
    const subscription = existing || await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
    const json = subscription.toJSON();
    await request("push_subscriptions?on_conflict=endpoint", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ endpoint: subscription.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, device_name: navigator.userAgentData?.platform || navigator.platform || "Web device", is_active: true, updated_at: new Date().toISOString() }),
    });
    bind();
  }

  async function disable() {
    const { subscription } = await currentSubscription();
    if (subscription) {
      await request(`push_subscriptions?endpoint=eq.${encodeURIComponent(subscription.endpoint)}`, { method: "PATCH", body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }) });
      await subscription.unsubscribe();
    }
    bind();
  }

  async function bind() {
    const button = document.querySelector("[data-push-toggle]");
    if (!button) return;
    try {
      const { subscription } = await currentSubscription();
      const enabled = Notification.permission === "granted" && Boolean(subscription);
      button.textContent = enabled ? "🔔 알림 켜짐 · 끄기" : "🔔 휴대폰 알림 켜기";
      button.dataset.pushEnabled = String(enabled);
      button.onclick = async () => {
        button.disabled = true;
        try { if (button.dataset.pushEnabled === "true") await disable(); else await enable(); }
        catch (error) { alert(error.message || "알림 설정에 실패했습니다."); }
        finally { button.disabled = false; }
      };
    } catch (error) {
      button.textContent = "알림 미지원"; button.disabled = true; button.title = error.message;
    }
  }

  window.addEventListener("banquet:operation-board-rendered", bind);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true }); else bind();
})();
