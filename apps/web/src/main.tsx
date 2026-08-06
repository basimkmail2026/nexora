import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, uploadFiles } from "./lib/api";
import "./styles.css";
import SystemAdmin from "./components/SystemAdmin";
import Billing from "./components/Billing";
import AssistantBuilder from "./components/AssistantBuilder";
import Marketplace from "./components/Marketplace";
import Analytics from "./components/Analytics";
import OnboardingPage from "./components/OnboardingPage";
import OnboardingAdmin from "./components/OnboardingAdmin";

type Role = "user" | "assistant";
type Msg = { role: Role; content: string };
type UploadItem = { id: string; name: string; mimeType: string; sizeBytes: number; status: string };
type ConversationAttachment = { id: string; originalName: string; mimeType: string; sizeBytes: number; status: string };
type View = "chat" | "assistants" | "billing" | "marketplace" | "analytics" | "settings" | "admin";
type AdminTab = "overview" | "knowledge" | "connections" | "onboarding";

const dictionary = {
  ar: {
    dir: "rtl", language: "العربية", newChat: "محادثة جديدة", chats: "المحادثات", assistants: "المساعدون",
    plans: "الباقات والفواتير", marketplace: "السوق", analytics: "التحليلات", settings: "الإعدادات",
    admin: "لوحة الإدارة", logout: "تسجيل الخروج", welcome: "ماذا تريد أن ننجز اليوم؟",
    welcomeSub: "اسأل، ارفع ملفًا أو صورة، أو تابع مشروعًا سابقًا.", placeholder: "اكتب رسالتك…",
    send: "إرسال", attach: "إرفاق", guest: "تجربة كضيف", login: "تسجيل الدخول", register: "إنشاء حساب",
    email: "البريد الإلكتروني", password: "كلمة المرور", forgot: "نسيت كلمة المرور", back: "رجوع",
    copy: "نسخ", copied: "تم النسخ", thinking: "يفكر…", filesReady: "ملفات جاهزة للإرسال",
    overview: "نظرة عامة", knowledge: "معرفة نكسورا", connections: "الاتصالات والذكاء",
    madeIn: "صُنعت وطُوِّرت في فلسطين", addKnowledge: "إضافة معرفة", save: "حفظ", title: "العنوان",
    content: "المحتوى", key: "المعرّف", category: "التصنيف", memory: "الذاكرة",
    languageSetting: "اللغة", appearance: "المظهر", themeSystem: "حسب الجهاز", themeLight: "فاتح", themeDark: "داكن"
  },
  en: {
    dir: "ltr", language: "English", newChat: "New chat", chats: "Chats", assistants: "Assistants",
    plans: "Plans & billing", marketplace: "Marketplace", analytics: "Analytics", settings: "Settings",
    admin: "Admin console", logout: "Log out", welcome: "What would you like to accomplish today?",
    welcomeSub: "Ask a question, upload a file or image, or continue a previous project.", placeholder: "Type your message…",
    send: "Send", attach: "Attach", guest: "Guest trial", login: "Log in", register: "Create account",
    email: "Email", password: "Password", forgot: "Forgot password", back: "Back", copy: "Copy",
    copied: "Copied", thinking: "Thinking…", filesReady: "Files ready to send", overview: "Overview",
    knowledge: "Nexora knowledge", connections: "AI & connections", madeIn: "Created and developed in Palestine",
    addKnowledge: "Add knowledge", save: "Save", title: "Title", content: "Content", key: "Key",
    category: "Category", memory: "Memory", languageSetting: "Language", appearance: "Appearance",
    themeSystem: "System", themeLight: "Light", themeDark: "Dark"
  }
} as const;

type Locale = keyof typeof dictionary;

function detectedLocale(): Locale {
  const saved = localStorage.getItem("nexoraLocale");
  if (saved === "ar" || saved === "en") return saved;
  return navigator.language.toLowerCase().startsWith("ar") ? "ar" : "en";
}

function fingerprint() {
  let id = localStorage.getItem("nexoraFingerprint");
  if (!id) {
    id = crypto.randomUUID() + "-" + navigator.userAgent.length;
    localStorage.setItem("nexoraFingerprint", id);
  }
  return id;
}

function CopyBlock({ value, label, t }: { value: string; label?: string; t: any }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }
  return <div className="copyBlock">
    <div className="copyHead"><span>{label || "Text"}</span><button onClick={copy}>{copied ? t.copied : t.copy}</button></div>
    <pre>{value}</pre>
  </div>;
}

function MessageBody({ content, t }: { content: string; t: any }) {
  const pieces = content.split(/```([\w-]*)\n?([\s\S]*?)```/g);
  if (pieces.length === 1) return <div className="messageText">{content}</div>;
  const output: React.ReactNode[] = [];
  for (let i = 0; i < pieces.length; i += 3) {
    if (pieces[i]?.trim()) output.push(<div className="messageText" key={`text-${i}`}>{pieces[i]}</div>);
    if (pieces[i + 2] !== undefined) output.push(<CopyBlock key={`code-${i}`} value={pieces[i + 2].trim()} label={pieces[i + 1] || "Text"} t={t} />);
  }
  return <>{output}</>;
}

function AuthScreen({ locale, setLocale, onAuthenticated, onGuest }: any) {
  const t = dictionary[locale as Locale];
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "twofactor">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");

  async function submit() {
    setBusy(true); setError("");
    try {
      if (mode === "twofactor") {
        const data = await api("/auth/login/2fa", { method: "POST", body: JSON.stringify({ challenge, code }) });
        localStorage.setItem("accessToken", data.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken);
        onAuthenticated();
      } else if (mode === "forgot") {
        const result = await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
        setError(result.message);
      } else {
        const data = await api(`/auth/${mode}`, { method: "POST", body: JSON.stringify({ email, password }) });
        if (data.requiresTwoFactor) { setChallenge(data.challenge); setMode("twofactor"); return; }
        localStorage.setItem("accessToken", data.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken);
        onAuthenticated();
      }
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return <div className="authShell" dir={t.dir}>
    <div className="authVisual">
      <div className="brandMark">N</div>
      <h1>Nexora</h1>
      <p>{t.madeIn}</p>
      <div className="heroGlow" />
    </div>
    <div className="authPanel">
      <div className="topLocale">
        <button onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>{locale === "ar" ? "English" : "العربية"}</button>
      </div>
      <div className="authCard">
        <span className="eyebrow">NEXORA AI WORKSPACE</span>
        <h2>{mode === "register" ? t.register : mode === "forgot" ? t.forgot : mode === "twofactor" ? "Two-factor authentication" : t.login}</h2>
        {mode !== "twofactor" && <input placeholder={t.email} value={email} onChange={e => setEmail(e.target.value)} />}
        {mode !== "forgot" && mode !== "twofactor" && <input type="password" placeholder={t.password} value={password} onChange={e => setPassword(e.target.value)} />}
        {mode === "twofactor" && <input inputMode="numeric" placeholder="123456" value={code} onChange={e => setCode(e.target.value)} />}
        {error && <div className="inlineError">{error}</div>}
        <button className="primaryAction" onClick={submit} disabled={busy}>{busy ? "…" : mode === "register" ? t.register : mode === "forgot" ? t.forgot : mode === "twofactor" ? "Verify" : t.login}</button>
        <div className="authLinks">
          <button onClick={() => setMode(mode === "register" ? "login" : "register")}>{mode === "register" ? t.login : t.register}</button>
          <button onClick={() => setMode("forgot")}>{t.forgot}</button>
        </div>
        <button className="guestAction" onClick={onGuest}>{t.guest}</button>
      </div>
    </div>
  </div>;
}

function AdminConsole({ t, me, onClose }: any) {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [stats, setStats] = useState<any>(null);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [form, setForm] = useState({ key: "", titleAr: "", titleEn: "", contentAr: "", contentEn: "", category: "general", priority: 0 });

  async function load() {
    const [statsData, knowledgeData] = await Promise.all([api("/admin/stats"), api("/admin/platform-knowledge")]);
    setStats(statsData); setKnowledge(knowledgeData);
  }
  useEffect(() => { load(); }, []);
  async function saveKnowledge() {
    await api("/admin/platform-knowledge", { method: "POST", body: JSON.stringify({ ...form, enabled: true }) });
    setForm({ key: "", titleAr: "", titleEn: "", contentAr: "", contentEn: "", category: "general", priority: 0 });
    await load();
  }

  if (tab === "connections") return <SystemAdmin onClose={() => setTab("overview")} />;
  return <div className="adminLayout">
    <aside className="adminNav">
      <div className="brand"><div className="brandMark tiny">N</div><div><b>Nexora Admin</b><small>{me?.email}</small></div></div>
      <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>◫ {t.overview}</button>
      <button className={tab === "knowledge" ? "active" : ""} onClick={() => setTab("knowledge")}>◇ {t.knowledge}</button>
      <button onClick={() => setTab("connections")}>⌁ {t.connections}</button>
      <button className={tab === "onboarding" ? "active" : ""} onClick={() => setTab("onboarding")}>◈ طلبات المساعدين</button>
      <div className="navSpacer" />
      <button onClick={onClose}>← {t.back}</button>
    </aside>
    <section className="adminContent">
      {tab === "onboarding" && <OnboardingAdmin />}
      {tab === "overview" && <>
        <div className="contentHead"><div><span className="eyebrow">CONTROL CENTER</span><h1>{t.admin}</h1></div></div>
        <div className="metricGrid">{stats && Object.entries(stats).map(([key, value]) => <div className="metric" key={key}><span>{key}</span><b>{String(value)}</b><small>Live database metric</small></div>)}</div>
        <div className="adminHero"><div><h2>One dashboard. Every system.</h2><p>Manage knowledge, AI providers, users, plans and platform behavior without touching deployment variables.</p></div><div className="adminOrb" /></div>
      </>}
      {tab === "knowledge" && <>
        <div className="contentHead"><div><span className="eyebrow">OFFICIAL SOURCE OF TRUTH</span><h1>{t.knowledge}</h1><p>Everything saved here becomes verified context for Nexora answers.</p></div></div>
        <div className="knowledgeGrid">
          <div className="panel formPanel">
            <h3>{t.addKnowledge}</h3>
            <input placeholder={t.key} value={form.key} onChange={e => setForm({ ...form, key: e.target.value })} />
            <input placeholder={`${t.title} (AR)`} value={form.titleAr} onChange={e => setForm({ ...form, titleAr: e.target.value })} />
            <input placeholder={`${t.title} (EN)`} value={form.titleEn} onChange={e => setForm({ ...form, titleEn: e.target.value })} />
            <input placeholder={t.category} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
            <textarea rows={7} placeholder={`${t.content} (AR)`} value={form.contentAr} onChange={e => setForm({ ...form, contentAr: e.target.value })} />
            <textarea rows={7} placeholder={`${t.content} (EN)`} value={form.contentEn} onChange={e => setForm({ ...form, contentEn: e.target.value })} />
            <button className="primaryAction" onClick={saveKnowledge}>{t.save}</button>
          </div>
          <div className="panel knowledgeList">
            {knowledge.map(item => <article key={item.id}><div><span>{item.category}</span><h3>{item.titleAr}</h3><p>{item.contentAr}</p></div><button onClick={async () => { await api(`/admin/platform-knowledge/${item.id}`, { method: "DELETE" }); load(); }}>×</button></article>)}
          </div>
        </div>
      </>}
    </section>
  </div>;
}

function UserSettings({ t, locale, setLocale, theme, setTheme }: any) {
  return <div className="pageCanvas"><div className="contentHead"><div><span className="eyebrow">PERSONALIZATION</span><h1>{t.settings}</h1></div></div>
    <div className="settingsGrid">
      <div className="panel"><h3>{t.languageSetting}</h3><select value={locale} onChange={e => setLocale(e.target.value)}><option value="ar">العربية</option><option value="en">English</option></select><p>The interface opens using the device language on first visit.</p></div>
      <div className="panel"><h3>{t.appearance}</h3><select value={theme} onChange={e => setTheme(e.target.value)}><option value="system">{t.themeSystem}</option><option value="light">{t.themeLight}</option><option value="dark">{t.themeDark}</option></select></div>
      <div className="panel"><h3>{t.memory}</h3><p>Nexora stores only useful preferences and explicit facts. Memory controls and deletion are available in the next settings update.</p></div>
    </div>
  </div>;
}

function App() {
  if (["/assistant-request", "/nexora-test.html", "/onboarding"].includes(window.location.pathname)) return <OnboardingPage />;
  const [locale, setLocaleState] = useState<Locale>(detectedLocale());
  const t = dictionary[locale];
  const [theme, setThemeState] = useState(localStorage.getItem("nexoraTheme") || "system");
  const [authenticated, setAuthenticated] = useState(Boolean(localStorage.getItem("accessToken")));
  const [guestId, setGuestId] = useState("");
  const [guestMode, setGuestMode] = useState(false);
  const [me, setMe] = useState<any>(null);
  const [view, setView] = useState<View>("chat");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string>();
  const [conversations, setConversations] = useState<any[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatStreamRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationAttachments, setConversationAttachments] = useState<ConversationAttachment[]>([]);
  const [showConversationMedia, setShowConversationMedia] = useState(false);

  function setLocale(next: Locale) { setLocaleState(next); localStorage.setItem("nexoraLocale", next); }
  function setTheme(next: string) { setThemeState(next); localStorage.setItem("nexoraTheme", next); }

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = t.dir;
    const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.body.classList.toggle("dark", dark);
  }, [locale, theme]);

  async function loadMe() {
    try {
      const user = await api("/auth/me"); setMe(user); setAuthenticated(true);
      setConversations(await api("/chat/conversations"));
    } catch { setAuthenticated(false); localStorage.removeItem("accessToken"); }
  }
  useEffect(() => { if (authenticated) loadMe(); }, []);

  async function startGuest() {
    const data = await api("/auth/guest", { method: "POST", body: JSON.stringify({ fingerprint: fingerprint() }) });
    setGuestId(data.guestId); setGuestMode(true);
  }

  async function selectFiles(fileList: FileList | null) {
    if (!fileList?.length || !authenticated) return;
    setUploading(true);
    try {
      const uploaded = await uploadFiles(Array.from(fileList));
      setUploads(current => [...current, ...uploaded]);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function jumpToLatest(behavior: ScrollBehavior = "smooth") {
    chatEndRef.current?.scrollIntoView({ behavior, block: "end" });
  }

  function handleChatScroll() {
    const el = chatStreamRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowJump(distance > 180);
  }

  useEffect(() => {
    const el = chatStreamRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 260) requestAnimationFrame(() => jumpToLatest("smooth"));
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if ((!text && !uploads.length) || busy) return;
    const displayText = text || (locale === "ar" ? "حلل الملفات المرفقة" : "Analyze the attached files");
    setInput(""); setMessages(v => [...v, { role: "user", content: displayText }]); setBusy(true);
    try {
      const path = authenticated ? "/chat" : "/chat/guest";
      const body = authenticated
        ? { message: displayText, conversationId, attachmentIds: uploads.map(file => file.id), locale }
        : { guestId, message: displayText, conversationId, locale };
      const data = await api(path, { method: "POST", body: JSON.stringify(body) });
      setConversationId(data.conversationId); setMessages(v => [...v, { role: "assistant", content: data.reply }]); setUploads([]);
      if (authenticated) setConversations(await api("/chat/conversations"));
    } catch (e: any) { setMessages(v => [...v, { role: "assistant", content: e.message }]); }
    finally { setBusy(false); }
  }

  async function openConversation(id: string) {
    const data = await api(`/chat/conversations/${id}`);
    setConversationId(id);
    setMessages(data.messages.map((m: any) => ({ role: m.role, content: m.content })));
    setConversationAttachments(data.attachments || []);
    setShowConversationMedia(false);
    setView("chat");
  }

  async function deleteConversation(id: string) {
    const label = locale === "ar" ? "حذف هذه المحادثة نهائيًا؟" : "Delete this conversation permanently?";
    if (!confirm(label)) return;
    await api(`/chat/conversations/${id}`, { method: "DELETE" });
    setConversations(list => list.filter(item => item.id !== id));
    if (conversationId === id) {
      setConversationId(undefined);
      setMessages([]);
      setConversationAttachments([]);
      setShowConversationMedia(false);
    }
  }

  async function openAttachment(item: ConversationAttachment) {
    const token = localStorage.getItem("accessToken");
    const response = await fetch(`/api/uploads/${item.id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data.error || "تعذر فتح الملف");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function logout() {
    try { await api("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken: localStorage.getItem("refreshToken") }) }); } catch {}
    localStorage.clear(); location.reload();
  }

  if (!authenticated && !guestMode) return <AuthScreen locale={locale} setLocale={setLocale} onAuthenticated={loadMe} onGuest={startGuest} />;
  if (view === "admin") return <AdminConsole t={t} me={me} onClose={() => setView("chat")} />;
  if (view === "assistants") return <AssistantBuilder onClose={() => setView("chat")} />;
  if (view === "billing") return <Billing onClose={() => setView("chat")} />;
  if (view === "marketplace") return <Marketplace onClose={() => setView("chat")} />;
  if (view === "analytics") return <Analytics onClose={() => setView("chat")} />;

  return <div className="appShell">
    <aside className="userSidebar">
      <div className="brand"><div className="brandMark tiny">N</div><div><b>Nexora</b><small>{t.madeIn}</small></div></div>
      <button className="newChat" onClick={() => { setConversationId(undefined); setMessages([]); setConversationAttachments([]); setShowConversationMedia(false); setView("chat"); }}>＋ {t.newChat}</button>
      <nav>
        <button className={view === "chat" ? "active" : ""} onClick={() => setView("chat")}>◉ {t.chats}</button>
        {authenticated && <>
          <button onClick={() => setView("assistants")}>◇ {t.assistants}</button>
          <button onClick={() => setView("billing")}>◫ {t.plans}</button>
          <button onClick={() => setView("marketplace")}>⌂ {t.marketplace}</button>
          <button onClick={() => setView("analytics")}>⌁ {t.analytics}</button>
          <button onClick={() => setView("settings")}>⚙ {t.settings}</button>
          {me && ["ADMIN", "SUPER_ADMIN"].includes(me.role) && <button onClick={() => setView("admin")}>▦ {t.admin}</button>}
        </>}
      </nav>
      <div className="historyHeader"><span>{t.chats}</span><b>{conversations.length}</b></div>
      <div className="sidebarSearch"><span>⌕</span><input value={conversationSearch} onChange={e => setConversationSearch(e.target.value)} placeholder={locale === "ar" ? "بحث في المحادثات" : "Search chats"} /></div>
      <div className="conversationList">
        {conversations.filter(item => String(item.title || "").toLowerCase().includes(conversationSearch.toLowerCase())).map(item => <div key={item.id} className={`conversationRow ${conversationId === item.id ? "selected" : ""}`}>
          <button className="conversationOpen" onClick={() => openConversation(item.id)}>
            <span className="conversationIcon">{item._count?.attachments ? "▧" : "◌"}</span>
            <span className="conversationText"><b>{item.title}</b><small>{item._count?.messages || 0} {locale === "ar" ? "رسالة" : "messages"}{item._count?.attachments ? ` · ${item._count.attachments} ${locale === "ar" ? "ملف" : "files"}` : ""}</small></span>
          </button>
          <button className="conversationDelete" onClick={() => deleteConversation(item.id)} title={locale === "ar" ? "حذف المحادثة" : "Delete chat"}>×</button>
        </div>)}
      </div>
      <div className="sidebarBottom">
        <button onClick={() => setLocale(locale === "ar" ? "en" : "ar")}>◎ {t.languageSetting}</button>
        {authenticated ? <button onClick={logout}>↪ {t.logout}</button> : <button onClick={() => location.reload()}>{t.login}</button>}
      </div>
    </aside>

    <section className="workspace">
      {view === "settings" ? <UserSettings t={t} locale={locale} setLocale={setLocale} theme={theme} setTheme={setTheme} /> : <>
        <header className="workspaceHead"><div><span className="statusDot" /> Nexora AI</div><div className="workspaceActions">{conversationId && <button className="mediaButton" onClick={() => setShowConversationMedia(v => !v)}>▧ {locale === "ar" ? "وسائط المحادثة" : "Chat media"}{conversationAttachments.length ? ` (${conversationAttachments.length})` : ""}</button>}<span className="modelPill">Multimodal workspace</span></div></header>
        <div className="chatBody">
        <div className="chatStream" ref={chatStreamRef} onScroll={handleChatScroll}>
          {!messages.length && <div className="welcomeState"><div className="welcomeIcon">✦</div><h1>{t.welcome}</h1><p>{t.welcomeSub}</p><div className="suggestionGrid"><button onClick={() => setInput(locale === "ar" ? "ما هي باقات نكسورا؟" : "What are Nexora's plans?")}>◫ Plans</button><button onClick={() => fileRef.current?.click()}>⌁ Analyze a file</button><button onClick={() => setInput(locale === "ar" ? "أين صُنعت نكسورا؟" : "Where was Nexora created?")}>◇ About Nexora</button></div></div>}
          {messages.map((message, index) => <article key={index} className={`chatMessage ${message.role}`}><div className="avatar">{message.role === "assistant" ? "N" : (me?.displayName?.[0] || "U")}</div><div className="bubble"><MessageBody content={message.content} t={t} />{message.role === "assistant" && <button className="messageCopy" onClick={() => navigator.clipboard.writeText(message.content)}>⌘ {t.copy}</button>}</div></article>)}
          {busy && <article className="chatMessage assistant"><div className="avatar">N</div><div className="bubble typing"><span /><span /><span /> {t.thinking}</div></article>}
          <div ref={chatEndRef} className="chatEndAnchor" />
        </div>
        {showConversationMedia && <aside className="conversationMediaPanel"><div className="mediaPanelHead"><div><b>{locale === "ar" ? "وسائط وملفات المحادثة" : "Chat media & files"}</b><small>{conversationAttachments.length} {locale === "ar" ? "عنصر" : "items"}</small></div><button onClick={() => setShowConversationMedia(false)}>×</button></div>{!conversationAttachments.length ? <div className="mediaEmpty">{locale === "ar" ? "لا توجد وسائط في هذه المحادثة." : "No media in this chat."}</div> : <div className="mediaGrid">{conversationAttachments.map(item => <button key={item.id} className="mediaItem" onClick={() => openAttachment(item)}><span>{item.mimeType.startsWith("image/") ? "▧" : item.mimeType.startsWith("video/") ? "▶" : item.mimeType.startsWith("audio/") ? "♪" : "▤"}</span><b>{item.originalName}</b><small>{Math.max(1, Math.round(item.sizeBytes / 1024))} KB · {item.mimeType}</small></button>)}</div>}</aside>}
        </div>
        {showJump && <button className="jumpLatest" onClick={() => jumpToLatest()}>↓ {locale === "ar" ? "آخر رسالة" : "Latest"}</button>}
        <div className="composerDock">
          {!!uploads.length && <div className="uploadTray"><span>{t.filesReady}</span>{uploads.map(file => <div className="fileChip" key={file.id}><b>{file.mimeType.startsWith("image/") ? "▧" : file.mimeType.startsWith("video/") ? "▶" : "▤"}</b><span>{file.name}</span><button onClick={() => setUploads(list => list.filter(item => item.id !== file.id))}>×</button></div>)}</div>}
          <div className="composerBox">
            <input ref={fileRef} type="file" multiple hidden accept="image/*,video/*,audio/*,.pdf,.docx,.txt,.csv,.xlsx,.pptx,.json,.zip" onChange={e => selectFiles(e.target.files)} />
            <button className="attachButton" disabled={!authenticated || uploading} onClick={() => fileRef.current?.click()} title={t.attach}>{uploading ? "…" : "＋"}</button>
            <textarea value={input} onChange={e => setInput(e.target.value)} placeholder={t.placeholder} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button className="sendButton" onClick={send}>↑</button>
          </div>
          <small>Nexora can make mistakes. Verify important information.</small>
        </div>
      </>}
    </section>
  </div>;
}

createRoot(document.getElementById("root")!).render(<App />);
