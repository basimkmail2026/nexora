(() => {
  const script = document.currentScript;
  const assistantId = script?.getAttribute("data-assistant");
  if (!assistantId) return;

  const apiBase = new URL(script.src).origin;
  let sessionKey = localStorage.getItem(`nexora_widget_${assistantId}`) || "";

  const root = document.createElement("div");
  root.style.cssText = "position:fixed;bottom:22px;right:22px;z-index:2147483000;font-family:Arial,sans-serif";
  root.innerHTML = `
    <button id="nx-open" aria-label="Open chat" style="width:58px;height:58px;border-radius:50%;border:0;background:#6d4aff;color:white;font-size:24px;cursor:pointer;box-shadow:0 10px 30px #0003">N</button>
    <div id="nx-box" style="display:none;width:min(360px,calc(100vw - 28px));height:520px;background:white;border:1px solid #ddd;border-radius:18px;box-shadow:0 18px 60px #0003;overflow:hidden;margin-bottom:10px">
      <div id="nx-head" style="background:#6d4aff;color:white;padding:14px;font-weight:bold;display:flex;justify-content:space-between">
        <span id="nx-title">Nexora Assistant</span><button id="nx-close" style="background:transparent;border:0;color:white;font-size:20px">×</button>
      </div>
      <div id="nx-msgs" style="height:402px;overflow:auto;padding:12px;background:#f7f7fb;direction:rtl"></div>
      <form id="nx-form" style="display:flex;padding:8px;border-top:1px solid #ddd;gap:6px">
        <button type="button" id="nx-mic" style="border:0;background:#eee;border-radius:10px;padding:0 10px">🎙️</button>
        <input id="nx-input" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:10px" placeholder="اكتب رسالتك"/>
        <button style="border:0;background:#6d4aff;color:white;border-radius:10px;padding:0 12px">إرسال</button>
      </form>
    </div>`;
  document.body.appendChild(root);

  const box = root.querySelector("#nx-box");
  const msgs = root.querySelector("#nx-msgs");
  const input = root.querySelector("#nx-input");

  function bubble(text, mine) {
    const row = document.createElement("div");
    row.style.cssText = `text-align:${mine ? "right" : "left"};margin:8px`;
    const span = document.createElement("span");
    span.textContent = text;
    span.style.cssText = `background:${mine ? "#6d4aff" : "white"};color:${mine ? "white" : "#111"};border:${mine ? "0" : "1px solid #ddd"};padding:8px 10px;border-radius:12px;display:inline-block;max-width:85%;white-space:pre-wrap`;
    row.appendChild(span);
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
  }

  fetch(`${apiBase}/api/public/assistants/${assistantId}/widget-config`)
    .then(r => r.json()).then(config => {
      root.querySelector("#nx-title").textContent = config.name;
      root.querySelector("#nx-head").style.background = config.primaryColor;
      root.querySelector("#nx-open").style.background = config.primaryColor;
      root.querySelector("#nx-form button:last-child").style.background = config.primaryColor;
      bubble(config.welcomeMessage, false);
    }).catch(() => bubble("تعذر تحميل المساعد", false));

  root.querySelector("#nx-open").onclick = () => box.style.display = "block";
  root.querySelector("#nx-close").onclick = () => box.style.display = "none";

  root.querySelector("#nx-form").onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    bubble(text, true);
    input.value = "";
    const wait = document.createElement("div");
    wait.textContent = "...";
    wait.style.cssText = "margin:8px;color:#666";
    msgs.appendChild(wait);

    try {
      const r = await fetch(`${apiBase}/api/public/assistants/${assistantId}/widget-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionKey: sessionKey || undefined })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "فشل الاتصال");
      wait.remove();
      sessionKey = data.sessionKey;
      localStorage.setItem(`nexora_widget_${assistantId}`, sessionKey);
      bubble(data.reply, false);
    } catch (err) {
      wait.remove();
      bubble(err.message || "تعذر الاتصال", false);
    }
  };

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  root.querySelector("#nx-mic").onclick = () => {
    if (!SR) return alert("المتصفح لا يدعم التعرف الصوتي");
    const rec = new SR();
    rec.lang = "ar";
    rec.onresult = e => input.value = e.results[0][0].transcript;
    rec.start();
  };
})();
