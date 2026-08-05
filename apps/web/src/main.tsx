import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./lib/api";
import "./styles.css";
import AssistantBuilder from "./components/AssistantBuilder";
import Billing from "./components/Billing";
import AdminBilling from "./components/AdminBilling";
import Marketplace from "./components/Marketplace";
import WhiteLabel from "./components/WhiteLabel";
import Analytics from "./components/Analytics";
import SystemAdmin from "./components/SystemAdmin";

type Msg = { role: "user" | "assistant"; content: string };
type AuthMode = "guest" | "login" | "register" | "forgot" | "reset" | "twofactor" | "app" | "admin" | "security" | "assistants" | "billing" | "adminBilling" | "marketplace" | "whiteLabel" | "analytics" | "systemAdmin";

function fingerprint() {
  let id = localStorage.getItem("nexoraFingerprint");
  if (!id) {
    id = crypto.randomUUID() + "-" + navigator.userAgent.length;
    localStorage.setItem("nexoraFingerprint", id);
  }
  return id;
}

function App() {
  const params = new URLSearchParams(location.search);
  const resetToken = params.get("token") || "";

  const [mode, setMode] = useState<AuthMode>(resetToken ? "reset" : "guest");
  const [guestId, setGuestId] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [me, setMe] = useState<any>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [adminStats, setAdminStats] = useState<any>(null);
  const [adminSettings, setAdminSettings] = useState<any>({});
  const [providers, setProviders] = useState<any[]>([]);
  const [gateways, setGateways] = useState<any[]>([]);
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    document.body.classList.toggle("dark", matchMedia("(prefers-color-scheme: dark)").matches);
    if (resetToken) return;
    if (localStorage.getItem("accessToken")) {
      setMode("app");
      loadMe();
    } else {
      api("/auth/guest", {
        method: "POST",
        body: JSON.stringify({ fingerprint: fingerprint() })
      }).then(d => { setGuestId(d.guestId); setRemaining(d.remaining); });
    }
  }, []);

  async function loadMe() {
    try {
      const user = await api("/auth/me");
      setMe(user);
      loadConversations();
    } catch {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      setMode("guest");
    }
  }

  async function loadConversations() {
    try { setConversations(await api("/chat/conversations")); } catch {}
  }

  async function authenticate(kind: "login" | "register") {
    try {
      const data = await api(`/auth/${kind}`, {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      if (data.requiresTwoFactor) {
        setChallenge(data.challenge);
        setMode("twofactor");
        return;
      }
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      setMode("app");
      await loadMe();
    } catch (e: any) { alert(e.message); }
  }

  async function verify2FA(useBackup = false) {
    try {
      const data = await api(useBackup ? "/auth/login/backup-code" : "/auth/login/2fa", {
        method: "POST",
        body: JSON.stringify({ challenge, code: twoFactorCode })
      });
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      setMode("app");
      await loadMe();
    } catch (e: any) { alert(e.message); }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages(v => [...v, { role: "user", content: text }]);
    setBusy(true);
    try {
      const path = mode === "app" || mode === "security" || mode === "admin" ? "/chat" : "/chat/guest";
      const body = path === "/chat"
        ? { message: text, conversationId }
        : { guestId, message: text, conversationId };
      const data = await api(path, { method: "POST", body: JSON.stringify(body) });
      setConversationId(data.conversationId);
      setMessages(v => [...v, { role: "assistant", content: data.reply }]);
      if (typeof data.remaining === "number") setRemaining(data.remaining);
      if (path === "/chat") loadConversations();
    } catch (e: any) {
      setMessages(v => [...v, { role: "assistant", content: e.message }]);
    } finally { setBusy(false); }
  }

  async function openConversation(id: string) {
    const data = await api(`/chat/conversations/${id}`);
    setConversationId(id);
    setMessages(data.messages.map((m: any) => ({ role: m.role, content: m.content })));
  }

  async function forgot() {
    try {
      const d = await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      alert(d.message);
      setMode("login");
    } catch (e: any) { alert(e.message); }
  }

  async function resetPassword() {
    try {
      await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ token: resetToken, password }) });
      history.replaceState({}, "", "/");
      alert("تم تغيير كلمة المرور");
      setMode("login");
    } catch (e: any) { alert(e.message); }
  }

  async function loadSecurity() {
    setMode("security");
    try {
      setSessions(await api("/auth/sessions"));
    } catch (e: any) { alert(e.message); }
  }

  async function setup2FA() {
    const d = await api("/auth/2fa/setup", { method: "POST" });
    setQr(d.qrCode); setSecret(d.secret);
  }

  async function enable2FA() {
    const d = await api("/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code: twoFactorCode }) });
    setBackupCodes(d.backupCodes || []);
    await loadMe();
  }

  async function loadAdmin() {
    setMode("admin");
    try {
      const [stats, settings, p, g] = await Promise.all([
        api("/admin/stats"), api("/admin/settings"), api("/admin/providers"), api("/admin/gateways")
      ]);
      setAdminStats(stats); setAdminSettings(settings); setProviders(p); setGateways(g);
    } catch (e: any) { alert(e.message); }
  }

  async function saveSetting(key: string, value: any) {
    await api(`/admin/settings/${key}`, { method: "PUT", body: JSON.stringify({ value }) });
    alert("تم الحفظ");
  }

  async function logout() {
    try {
      await api("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken: localStorage.getItem("refreshToken") })
      });
    } catch {}
    localStorage.clear();
    location.href = "/";
  }

  if (["login","register","forgot","reset","twofactor"].includes(mode)) {
    return (
      <div className="auth">
        <div className="card">
          <div className="logo">N</div>
          <h1>
            {mode === "login" ? "تسجيل الدخول" :
             mode === "register" ? "إنشاء حساب" :
             mode === "forgot" ? "نسيت كلمة المرور" :
             mode === "reset" ? "تعيين كلمة مرور جديدة" : "التحقق بخطوتين"}
          </h1>

          {(mode === "login" || mode === "register" || mode === "forgot") &&
            <input placeholder="البريد الإلكتروني" value={email} onChange={e => setEmail(e.target.value)} />}

          {(mode === "login" || mode === "register" || mode === "reset") &&
            <input type="password" placeholder="كلمة المرور" value={password} onChange={e => setPassword(e.target.value)} />}

          {mode === "twofactor" &&
            <input placeholder="رمز المصادقة أو الرمز الاحتياطي" value={twoFactorCode} onChange={e => setTwoFactorCode(e.target.value)} />}

          {mode === "login" && <>
            <button onClick={() => authenticate("login")}>دخول</button>
            <button className="link" onClick={() => setMode("forgot")}>نسيت كلمة المرور</button>
            <button className="link" onClick={() => setMode("register")}>إنشاء حساب</button>
          </>}
          {mode === "register" && <button onClick={() => authenticate("register")}>إنشاء الحساب</button>}
          {mode === "forgot" && <button onClick={forgot}>إرسال رابط الاستعادة</button>}
          {mode === "reset" && <button onClick={resetPassword}>حفظ كلمة المرور الجديدة</button>}
          {mode === "twofactor" && <>
            <button onClick={() => verify2FA(false)}>تحقق</button>
            <button className="link" onClick={() => verify2FA(true)}>استخدام رمز احتياطي</button>
          </>}
          <button className="link" onClick={() => setMode("guest")}>العودة</button>
        </div>
      </div>
    );
  }

  if (mode === "security") {
    return (
      <div className="adminPage">
        <header className="pageHead"><h1>الأمان والتحقق بخطوتين</h1><button onClick={() => setMode("app")}>رجوع</button></header>
        <div className="grid2">
          <div className="card">
            <h2>تطبيق المصادقة</h2>
            <p>الحالة: {me?.twoFactorEnabled ? "مفعّل" : "غير مفعّل"}</p>
            {!me?.twoFactorEnabled && <>
              <button onClick={setup2FA}>إنشاء QR Code</button>
              {qr && <><img className="qr" src={qr}/><code>{secret}</code>
                <input placeholder="أدخل رمز التطبيق" value={twoFactorCode} onChange={e => setTwoFactorCode(e.target.value)} />
                <button onClick={enable2FA}>تفعيل</button></>}
            </>}
            {backupCodes.length > 0 && <div className="codes">{backupCodes.map(x => <code key={x}>{x}</code>)}</div>}
          </div>
          <div className="card">
            <h2>الجلسات النشطة</h2>
            {sessions.map(s => <div className="row" key={s.id}><span>{s.userAgent || "جهاز غير معروف"}</span>
              <button onClick={async()=>{await api(`/auth/sessions/${s.id}`,{method:"DELETE"});loadSecurity()}}>إنهاء</button></div>)}
          </div>
        </div>
      </div>
    );
  }

  if (mode === "assistants") return <AssistantBuilder onClose={() => setMode("app")} />;
  if (mode === "billing") return <Billing onClose={() => setMode("app")} />;
  if (mode === "adminBilling") return <AdminBilling onClose={() => setMode("admin")} />;
  if (mode === "marketplace") return <Marketplace onClose={() => setMode("app")} />;
  if (mode === "whiteLabel") return <WhiteLabel onClose={() => setMode("app")} />;
  if (mode === "analytics") return <Analytics onClose={() => setMode("app")} />;
  if (mode === "systemAdmin") return <SystemAdmin onClose={() => setMode("admin")} />;

  if (mode === "admin") {
    return (
      <div className="adminPage">
        <header className="pageHead"><h1>لوحة تحكم نكسورا</h1><button onClick={() => setMode("app")}>رجوع</button></header>
        <div className="stats">
          {adminStats && Object.entries(adminStats).map(([k,v]) => <div className="stat" key={k}><span>{k}</span><b>{String(v)}</b></div>)}
        </div>
        <div className="grid2">
          <div className="card">
            <h2>حدود الضيف</h2>
            <input type="number" value={adminSettings?.guest_limits?.messages || 10}
              onChange={e => setAdminSettings({...adminSettings, guest_limits:{...adminSettings.guest_limits,messages:Number(e.target.value)}})} />
            <button onClick={()=>saveSetting("guest_limits",adminSettings.guest_limits)}>حفظ</button>
          </div>
          <div className="card">
            <h2>إيميل الشركة</h2>
            <input placeholder="اسم الشركة" value={adminSettings?.company_email?.companyName || ""}
              onChange={e => setAdminSettings({...adminSettings,company_email:{...adminSettings.company_email,companyName:e.target.value}})} />
            <input placeholder="بريد الإرسال" value={adminSettings?.company_email?.fromEmail || ""}
              onChange={e => setAdminSettings({...adminSettings,company_email:{...adminSettings.company_email,fromEmail:e.target.value}})} />
            <input placeholder="بريد الدعم" value={adminSettings?.company_email?.supportEmail || ""}
              onChange={e => setAdminSettings({...adminSettings,company_email:{...adminSettings.company_email,supportEmail:e.target.value}})} />
            <button onClick={()=>saveSetting("company_email",adminSettings.company_email)}>حفظ</button>
          </div>
          <div className="card">
            <h2>مزودات الذكاء الاصطناعي</h2>
            {providers.map(p => <div className="row" key={p.id}><span>{p.name} — {p.defaultModel}</span><span>{p.enabled?"مفعّل":"متوقف"}</span></div>)}
          </div>
          <div className="card">
            <h2>بوابات الدفع</h2>
            {gateways.map(g => <div className="row" key={g.id}><span>{g.name}</span><span>{g.enabled?"مفعّلة":"غير مفعّلة"}</span></div>)}
          </div>
        </div>
      </div>
    );
  }

  const title = mode === "app" ? (me?.email || "حسابك") : `تجربة ضيف${remaining !== null ? ` — متبقي ${remaining}` : ""}`;

  return (
    <main>
      <aside>
        <div className="brand"><div className="logo small">N</div><b>Nexora</b></div>
        <p>{title}</p>
        {mode !== "app" && <>
          <button onClick={() => setMode("register")}>إنشاء حساب</button>
          <button className="secondary" onClick={() => setMode("login")}>تسجيل الدخول</button>
        </>}
        {mode === "app" && <>
          <button onClick={() => {setConversationId(undefined);setMessages([])}}>محادثة جديدة</button>
          <div className="convList">{conversations.map(c=><button className="conv" key={c.id} onClick={()=>openConversation(c.id)}>{c.title}</button>)}</div>
          <button className="secondary" onClick={()=>setMode("assistants")}>منشئ المساعدين</button>
          <button className="secondary" onClick={()=>setMode("billing")}>الباقات والفواتير</button>
          <button className="secondary" onClick={()=>setMode("marketplace")}>Marketplace</button>
          <button className="secondary" onClick={()=>setMode("analytics")}>التحليلات</button>
          <button className="secondary" onClick={()=>setMode("whiteLabel")}>White Label</button>
          <button className="secondary" onClick={loadSecurity}>الأمان و2FA</button>
          {["ADMIN","SUPER_ADMIN"].includes(me?.role) && <><button className="secondary" onClick={loadAdmin}>لوحة التحكم</button><button className="secondary" onClick={()=>setMode("adminBilling")}>الإدارة المالية</button><button className="secondary" onClick={()=>setMode("systemAdmin")}>النظام والاتصالات</button></>}
          <button className="secondary" onClick={logout}>تسجيل الخروج</button>
        </>}
      </aside>
      <section className="chat">
        <header><h2>مساعد نكسورا</h2><span>v1.5 Stage 6 RC</span></header>
        <div className="messages">
          {messages.length === 0 && <div className="welcome"><div className="logo big">N</div><h1>شو بتحب ننجز اليوم؟</h1><p>جرب كضيف أو سجل حسابك واحفظ محادثاتك.</p></div>}
          {messages.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.content}</div>)}
          {busy && <div className="msg assistant">بفكر...</div>}
        </div>
        <div className="composer">
          <textarea value={input} onChange={e => setInput(e.target.value)} placeholder="اكتب رسالتك..." onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }} />
          <button onClick={send}>إرسال</button>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
