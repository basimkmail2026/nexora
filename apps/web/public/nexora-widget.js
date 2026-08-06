(() => {
  const script = document.currentScript;
  const publicKey = script?.getAttribute("data-key") || "";
  if (!publicKey) {
    console.error("Nexora Widget: data-key is required.");
    return;
  }

  const apiBase = new URL(script.src).origin;
  const storagePrefix = `nexora_widget_${publicKey}`;
  const visitorId = localStorage.getItem(`${storagePrefix}_visitor`) ||
    (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  localStorage.setItem(`${storagePrefix}_visitor`, visitorId);
  let sessionKey = localStorage.getItem(`${storagePrefix}_session`) || "";
  let config = null;
  let busy = false;
  let handoffStatus = "AI";
  let pollTimer = null;
  const seenServerMessages = new Set();

  const host = document.createElement("div");
  host.id = `nexora-widget-${publicKey}`;
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .nx-root { --nx-primary:#6d4aff; --nx-bg:#fff; --nx-panel:#f7f7fb; --nx-text:#17171c; --nx-muted:#72727d; --nx-border:#e4e4ea; position:fixed; bottom:20px; right:20px; z-index:2147483000; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Tahoma,Arial,sans-serif; color:var(--nx-text); direction:rtl; }
      .nx-root.left { right:auto; left:20px; }
      .nx-root.dark { --nx-bg:#15151b; --nx-panel:#0e0e13; --nx-text:#f4f4f7; --nx-muted:#a5a5ad; --nx-border:#2c2c34; }
      .nx-launcher { display:flex; align-items:center; gap:9px; border:0; border-radius:999px; background:var(--nx-primary); color:#fff; min-height:58px; padding:0 18px; cursor:pointer; box-shadow:0 14px 38px rgba(0,0,0,.25); font:inherit; font-weight:700; }
      .nx-launcher-icon { display:grid; place-items:center; width:30px; height:30px; border-radius:50%; background:rgba(255,255,255,.18); font-size:17px; }
      .nx-box { display:none; flex-direction:column; width:min(390px,calc(100vw - 28px)); height:min(650px,calc(100dvh - 42px)); margin-bottom:12px; border:1px solid var(--nx-border); border-radius:22px; overflow:hidden; background:var(--nx-bg); box-shadow:0 24px 70px rgba(0,0,0,.3); }
      .nx-box.open { display:flex; }
      .nx-head { display:flex; align-items:center; gap:11px; padding:13px 14px; background:var(--nx-primary); color:#fff; }
      .nx-avatar { width:38px; height:38px; border-radius:50%; object-fit:cover; background:rgba(255,255,255,.18); display:grid; place-items:center; font-weight:800; }
      .nx-head-copy { flex:1; min-width:0; }
      .nx-title { font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .nx-status { font-size:12px; opacity:.85; margin-top:2px; }
      .nx-icon-btn { border:0; background:transparent; color:inherit; font-size:22px; cursor:pointer; padding:5px; border-radius:8px; }
      .nx-messages { flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain; padding:14px; background:var(--nx-panel); scroll-behavior:smooth; }
      .nx-row { display:flex; margin:8px 0; }
      .nx-row.mine { justify-content:flex-start; }
      .nx-row.bot { justify-content:flex-end; }
      .nx-bubble { max-width:86%; padding:10px 12px; border-radius:15px; white-space:pre-wrap; word-break:break-word; line-height:1.55; font-size:14px; }
      .nx-row.mine .nx-bubble { background:var(--nx-primary); color:#fff; border-bottom-right-radius:5px; }
      .nx-row.bot .nx-bubble { background:var(--nx-bg); color:var(--nx-text); border:1px solid var(--nx-border); border-bottom-left-radius:5px; }
      .nx-typing { display:flex; gap:4px; align-items:center; min-width:48px; }
      .nx-dot { width:6px; height:6px; border-radius:50%; background:var(--nx-muted); animation:nx-bounce 1.2s infinite; }
      .nx-dot:nth-child(2){animation-delay:.15s}.nx-dot:nth-child(3){animation-delay:.3s}
      @keyframes nx-bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
      .nx-info { padding:16px; background:var(--nx-panel); border-bottom:1px solid var(--nx-border); }
      .nx-info.hidden { display:none; }
      .nx-info p { margin:0 0 10px; color:var(--nx-muted); font-size:13px; }
      .nx-field { width:100%; border:1px solid var(--nx-border); background:var(--nx-bg); color:var(--nx-text); border-radius:11px; padding:10px 11px; margin-top:8px; font:inherit; }
      .nx-info button { width:100%; border:0; border-radius:11px; background:var(--nx-primary); color:#fff; padding:10px; margin-top:10px; cursor:pointer; font:inherit; font-weight:700; }
      .nx-form { display:flex; align-items:flex-end; gap:7px; padding:10px; border-top:1px solid var(--nx-border); background:var(--nx-bg); }
      .nx-input { flex:1; min-width:0; max-height:110px; resize:none; border:1px solid var(--nx-border); background:var(--nx-panel); color:var(--nx-text); border-radius:14px; padding:11px 12px; font:inherit; line-height:1.4; outline:none; }
      .nx-input:focus { border-color:var(--nx-primary); }
      .nx-send,.nx-mic { border:0; border-radius:12px; height:42px; min-width:42px; cursor:pointer; font:inherit; }
      .nx-send { background:var(--nx-primary); color:#fff; padding:0 13px; font-weight:700; }
      .nx-mic { background:var(--nx-panel); color:var(--nx-text); }
      .nx-send:disabled,.nx-mic:disabled { opacity:.5; cursor:not-allowed; }
      .nx-handoff { border:1px solid var(--nx-border); background:var(--nx-bg); color:var(--nx-text); border-radius:11px; padding:9px 12px; cursor:pointer; font:inherit; font-weight:700; white-space:nowrap; }
      .nx-handoff.active { background:#fff7e6; color:#8a5200; border-color:#f1c36d; }
      .nx-root.dark .nx-handoff.active { background:#302511; color:#ffd48a; border-color:#715520; }
      .nx-row.system { justify-content:center; }
      .nx-row.system .nx-bubble { max-width:94%; background:transparent; border:0; color:var(--nx-muted); font-size:12px; text-align:center; }
      .nx-row.agent { justify-content:flex-end; }
      .nx-row.agent .nx-bubble { background:var(--nx-bg); color:var(--nx-text); border:1px solid var(--nx-primary); border-bottom-left-radius:5px; }
      .nx-brand { text-align:center; padding:5px 10px 8px; color:var(--nx-muted); font-size:11px; background:var(--nx-bg); }
      .nx-brand.hidden { display:none; }
      .nx-error { color:#b42318; background:#fff0f1!important; border-color:#ffc7cd!important; }
      .nx-root.dark .nx-error { color:#ff9aa6; background:#32161d!important; border-color:#6f2a37!important; }
      .nx-retry { margin-top:9px; border:1px solid var(--nx-border); background:var(--nx-bg); color:var(--nx-text); border-radius:9px; padding:7px 10px; cursor:pointer; font:inherit; }
      @media (max-width:520px) {
        .nx-root,.nx-root.left { left:10px; right:10px; bottom:10px; }
        .nx-launcher { margin-inline-start:auto; }
        .nx-root.left .nx-launcher { margin-inline-start:0; margin-inline-end:auto; }
        .nx-box { width:100%; height:min(720px,calc(100dvh - 20px)); border-radius:18px; }
      }
    </style>
    <div class="nx-root">
      <div class="nx-box" role="dialog" aria-label="محادثة Nexora">
        <header class="nx-head">
          <div class="nx-avatar">N</div>
          <div class="nx-head-copy"><div class="nx-title">Nexora Assistant</div><div class="nx-status">متصل الآن</div></div>
          <button class="nx-icon-btn nx-reset" type="button" title="محادثة جديدة">↻</button>
          <button class="nx-icon-btn nx-close" type="button" aria-label="إغلاق">×</button>
        </header>
        <section class="nx-info hidden">
          <p>عرّفنا عنك لنقدم لك مساعدة أفضل.</p>
          <input class="nx-field nx-name" placeholder="الاسم (اختياري)" maxlength="120" />
          <input class="nx-field nx-email" type="email" placeholder="البريد الإلكتروني (اختياري)" maxlength="200" />
          <button type="button" class="nx-start">ابدأ المحادثة</button>
        </section>
        <div class="nx-messages" aria-live="polite"></div>
        <form class="nx-form">
          <button class="nx-handoff" type="button" title="التحدث مع موظف">موظف</button>
          <button class="nx-mic" type="button" title="إملاء صوتي">🎙️</button>
          <textarea class="nx-input" rows="1" placeholder="اكتب رسالتك..."></textarea>
          <button class="nx-send" type="submit">إرسال</button>
        </form>
        <div class="nx-brand">مدعوم بواسطة Nexora — صُنعت في فلسطين</div>
      </div>
      <button class="nx-launcher" type="button" aria-label="فتح المحادثة"><span class="nx-launcher-icon">✦</span><span class="nx-launcher-label">محادثة</span></button>
    </div>`;

  const $ = selector => shadow.querySelector(selector);
  const root = $(".nx-root");
  const box = $(".nx-box");
  const messages = $(".nx-messages");
  const input = $(".nx-input");
  const visitorName = $(".nx-name");
  const visitorEmail = $(".nx-email");

  function setTheme(theme) {
    const dark = theme === "dark" || (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark);
  }

  function bubble(text, mine, extraClass = "", role = "") {
    const row = document.createElement("div");
    row.className = `nx-row ${role || (mine ? "mine" : "bot")}`;
    const item = document.createElement("div");
    item.className = `nx-bubble ${extraClass}`;
    item.textContent = text;
    row.appendChild(item);
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
    return row;
  }

  function typing(show) {
    $(".nx-typing-row")?.remove();
    if (!show) return;
    const row = document.createElement("div");
    row.className = "nx-row bot nx-typing-row";
    row.innerHTML = '<div class="nx-bubble nx-typing"><span class="nx-dot"></span><span class="nx-dot"></span><span class="nx-dot"></span></div>';
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
  }

  function openWidget() {
    box.classList.add("open");
    ensurePolling();
    pollSession();
    $(".nx-launcher").style.display = "none";
    setTimeout(() => input.focus(), 100);
  }

  function closeWidget() {
    box.classList.remove("open");
    $(".nx-launcher").style.display = "flex";
  }

  function resetConversation() {
    sessionKey = "";
    handoffStatus = "AI";
    seenServerMessages.clear();
    clearInterval(pollTimer);
    pollTimer = null;
    updateHandoffUi();
    localStorage.removeItem(`${storagePrefix}_session`);
    messages.innerHTML = "";
    if (config?.welcomeMessage) bubble(config.welcomeMessage, false);
  }


  function updateHandoffUi() {
    const button = $(".nx-handoff");
    const status = $(".nx-status");
    button.classList.toggle("active", handoffStatus !== "AI");
    if (handoffStatus === "WAITING") {
      button.textContent = "بانتظار موظف";
      status.textContent = "بانتظار أحد الموظفين";
    } else if (handoffStatus === "AGENT") {
      button.textContent = "موظف متصل";
      status.textContent = "موظف الدعم متصل";
    } else {
      button.textContent = "موظف";
      status.textContent = "متصل الآن";
    }
  }

  function renderServerMessage(message) {
    if (!message?.id || seenServerMessages.has(message.id)) return;
    seenServerMessages.add(message.id);
    if (message.role === "user") return;
    if (message.role === "system") bubble(message.content, false, "", "system");
    else if (message.role === "agent") bubble(message.content, false, "", "agent");
  }

  async function pollSession() {
    if (!sessionKey || !box.classList.contains("open")) return;
    try {
      const pollUrl = `${apiBase}/api/public/assistants/widget/${encodeURIComponent(publicKey)}/session`;
      const response = await fetch(pollUrl, {
        method: "POST",
        cache: "no-store",
        credentials: "omit",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "Cache-Control": "no-cache"
        },
        body: JSON.stringify({ sessionKey, pageUrl: location.href })
      });
      if (!response.ok) {
        console.warn("Nexora Widget session polling returned", response.status);
        return;
      }
      const data = await response.json();
      handoffStatus = data.handoffStatus || "AI";
      updateHandoffUi();
      (data.messages || []).forEach(renderServerMessage);
    } catch (error) {
      console.warn("Nexora Widget polling failed", error);
    }
  }

  function ensurePolling() {
    if (pollTimer) return;
    pollTimer = setInterval(pollSession, 1500);
  }

  async function requestHandoff() {
    if (busy || handoffStatus !== "AI") return;
    busy = true;
    try {
      const response = await fetch(`${apiBase}/api/public/assistants/widget/${encodeURIComponent(publicKey)}/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionKey: sessionKey || undefined,
          visitorId,
          visitorName: visitorName.value.trim() || undefined,
          visitorEmail: visitorEmail.value.trim() || undefined,
          pageUrl: location.href
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر تحويل المحادثة");
      sessionKey = data.sessionKey;
      localStorage.setItem(`${storagePrefix}_session`, sessionKey);
      handoffStatus = data.handoffStatus || "WAITING";
      updateHandoffUi();
      bubble(data.message || "تم تحويل المحادثة إلى موظف.", false, "", "system");
      ensurePolling();
      window.setTimeout(pollSession, 250);
    } catch (error) {
      bubble(error.message || "تعذر تحويل المحادثة", false, "nx-error");
    } finally {
      busy = false;
    }
  }

  async function loadConfig() {
    try {
      const response = await fetch(`${apiBase}/api/public/assistants/widget/${encodeURIComponent(publicKey)}/config?pageUrl=${encodeURIComponent(location.href)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر تحميل المساعد");
      config = data;
      root.style.setProperty("--nx-primary", data.primaryColor || "#6d4aff");
      root.classList.toggle("left", data.position === "bottom-left");
      setTheme(data.theme || "auto");
      $(".nx-title").textContent = data.name || "Nexora Assistant";
      $(".nx-launcher-label").textContent = data.launcherLabel || "محادثة";
      input.placeholder = data.inputPlaceholder || "اكتب رسالتك...";
      $(".nx-brand").classList.toggle("hidden", data.showBranding === false);
      const avatar = $(".nx-avatar");
      if (data.avatarUrl) avatar.innerHTML = `<img alt="" src="${data.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      else avatar.textContent = String(data.name || "N").slice(0, 1).toUpperCase();
      if (data.collectVisitorInfo && !localStorage.getItem(`${storagePrefix}_profile_saved`)) {
        $(".nx-info").classList.remove("hidden");
      }
      bubble(data.welcomeMessage || "مرحبًا! كيف أقدر أساعدك؟", false);
    } catch (error) {
      const row = bubble(error.message || "تعذر تحميل المساعد", false, "nx-error");
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "nx-retry";
      retry.textContent = "إعادة المحاولة";
      retry.addEventListener("click", () => {
        row.remove();
        input.disabled = false;
        $(".nx-send").disabled = false;
        loadConfig();
      });
      row.querySelector(".nx-bubble")?.appendChild(retry);
      input.disabled = true;
      $(".nx-send").disabled = true;
      console.error("Nexora Widget config failed", error);
    }
  }

  async function sendMessage(text) {
    if (!text || busy) return;
    busy = true;
    $(".nx-send").disabled = true;
    bubble(text, true);
    input.value = "";
    input.style.height = "auto";
    typing(true);

    try {
      const response = await fetch(`${apiBase}/api/public/assistants/widget/${encodeURIComponent(publicKey)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionKey: sessionKey || undefined,
          visitorId,
          visitorName: visitorName.value.trim() || undefined,
          visitorEmail: visitorEmail.value.trim() || undefined,
          pageUrl: location.href
        })
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.sessionKey) {
          sessionKey = data.sessionKey;
          localStorage.setItem(`${storagePrefix}_session`, sessionKey);
        }
        const error = new Error(data.error || "فشل الاتصال");
        error.canHandoff = Boolean(data.canHandoff);
        throw error;
      }
      typing(false);
      sessionKey = data.sessionKey;
      localStorage.setItem(`${storagePrefix}_session`, sessionKey);
      handoffStatus = data.mode || handoffStatus;
      updateHandoffUi();
      if (data.reply) bubble(data.reply, false, data.aiUnavailable ? "nx-system" : "");
      ensurePolling();
      window.setTimeout(pollSession, 250);
    } catch (error) {
      typing(false);
      const row = bubble(error.message || "تعذر الاتصال", false, "nx-error");
      if (error.canHandoff) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "nx-retry";
        button.textContent = "تحويل إلى موظف";
        button.addEventListener("click", async () => {
          row.remove();
          await requestHandoff();
        });
        row.querySelector(".nx-bubble")?.appendChild(button);
      }
    } finally {
      busy = false;
      $(".nx-send").disabled = false;
      input.focus();
    }
  }

  $(".nx-launcher").addEventListener("click", openWidget);
  $(".nx-handoff").addEventListener("click", requestHandoff);
  $(".nx-close").addEventListener("click", closeWidget);
  $(".nx-reset").addEventListener("click", resetConversation);
  $(".nx-start").addEventListener("click", () => {
    localStorage.setItem(`${storagePrefix}_profile_saved`, "1");
    $(".nx-info").classList.add("hidden");
    input.focus();
  });
  $(".nx-form").addEventListener("submit", event => {
    event.preventDefault();
    sendMessage(input.value.trim());
  });
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(input.value.trim());
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 110)}px`;
  });

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  $(".nx-mic").addEventListener("click", () => {
    if (!SpeechRecognition) return alert("المتصفح لا يدعم الإملاء الصوتي");
    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || "ar";
    recognition.onresult = event => {
      input.value = event.results[0][0].transcript;
      input.dispatchEvent(new Event("input"));
    };
    recognition.start();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && box.classList.contains("open")) pollSession();
  });
  window.addEventListener("focus", () => {
    if (box.classList.contains("open")) pollSession();
  });

  updateHandoffUi();
  loadConfig();
  if (sessionKey) ensurePolling();
})();
