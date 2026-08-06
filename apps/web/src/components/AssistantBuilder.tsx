import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

type Tab = "settings" | "knowledge" | "test" | "widget" | "conversations";

function copyText(value: string) {
  return navigator.clipboard.writeText(value);
}

export default function AssistantBuilder({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("settings");
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [testReply, setTestReply] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [conversations, setConversations] = useState<any[]>([]);
  const [conversation, setConversation] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setItems(await api("/assistants"));
  }

  async function open(id: string) {
    const item = await api(`/assistants/${id}`);
    setSelected(item);
    setConversation(null);
  }

  useEffect(() => { load(); }, []);

  async function create() {
    if (!name.trim()) return;
    const item = await api("/assistants", {
      method: "POST",
      body: JSON.stringify({ name: name.trim(), language: "ar" })
    });
    setName("");
    await load();
    await open(item.id);
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await api(`/assistants/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: selected.name,
          description: selected.description,
          systemPrompt: selected.systemPrompt,
          temperature: Number(selected.temperature),
          maxOutputTokens: Number(selected.maxOutputTokens),
          fallbackMessage: selected.fallbackMessage,
          language: selected.language
        })
      });
      setSelected({ ...selected, ...updated });
      alert("تم حفظ إعدادات المساعد");
    } finally {
      setSaving(false);
    }
  }

  async function saveWidget() {
    setSaving(true);
    try {
      const widget = selected.widget || {};
      const updated = await api(`/assistants/${selected.id}/widget`, {
        method: "PUT",
        body: JSON.stringify({
          enabled: widget.enabled ?? true,
          primaryColor: widget.primaryColor || "#6d4aff",
          position: widget.position || "bottom-right",
          theme: widget.theme || "auto",
          welcomeMessage: widget.welcomeMessage || "مرحبًا! كيف أقدر أساعدك؟",
          inputPlaceholder: widget.inputPlaceholder || "اكتب رسالتك...",
          launcherLabel: widget.launcherLabel || "محادثة",
          showBranding: widget.showBranding ?? true,
          collectVisitorInfo: widget.collectVisitorInfo ?? false,
          privacyUrl: widget.privacyUrl || null,
          allowedDomains: widget.allowedDomains || []
        })
      });
      setSelected({ ...selected, widget: updated });
      alert("تم حفظ إعدادات الربط");
    } finally {
      setSaving(false);
    }
  }

  async function addFaq() {
    await api(`/assistants/${selected.id}/faqs`, {
      method: "POST",
      body: JSON.stringify({ question, answer })
    });
    setQuestion(""); setAnswer("");
    await open(selected.id);
  }

  async function uploadFile(file: File) {
    const token = localStorage.getItem("accessToken");
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`/api/assistants/${selected.id}/documents`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "فشل الرفع");
    await open(selected.id);
  }

  async function test() {
    const data = await api(`/assistants/${selected.id}/test-chat`, {
      method: "POST",
      body: JSON.stringify({ message: testMessage })
    });
    setTestReply(data.reply);
  }

  async function createKey() {
    const data = await api(`/assistants/${selected.id}/api-keys`, {
      method: "POST",
      body: JSON.stringify({ name: "Default API Key" })
    });
    setApiKey(data.apiKey);
    await open(selected.id);
  }

  async function loadConversations() {
    const data = await api(`/assistants/${selected.id}/conversations`);
    setConversations(data);
  }

  async function openConversation(id: string) {
    setConversation(await api(`/assistants/${selected.id}/conversations/${id}`));
  }

  useEffect(() => {
    if (selected && tab === "conversations") loadConversations();
  }, [selected?.id, tab]);

  const embedCode = useMemo(() => {
    const key = selected?.widget?.publicKey;
    if (!key) return "";
    return `<script async src="${location.origin}/nexora-widget.js" data-key="${key}"></script>`;
  }, [selected?.widget?.publicKey]);

  if (!selected) {
    return <div className="adminPage assistantsPage">
      <header className="pageHead"><div><h1>المساعدون</h1><p>أنشئ مساعدين واربطهم بمواقعك.</p></div><button onClick={onClose}>رجوع</button></header>
      <div className="card assistantCreateCard">
        <h2>مساعد جديد</h2>
        <div className="inlineForm"><input value={name} onChange={e => setName(e.target.value)} placeholder="اسم المساعد" onKeyDown={e => e.key === "Enter" && create()} /><button onClick={create}>إنشاء</button></div>
      </div>
      <div className="assistantGrid">
        {items.map(item => <button className="card assistantCard" key={item.id} onClick={() => open(item.id)}>
          <div className="assistantAvatar">{String(item.name).slice(0, 1)}</div>
          <div><h3>{item.name}</h3><p>{item.description || "بدون وصف"}</p><small>{item.status === "PUBLISHED" ? "منشور" : "مسودة"}</small></div>
        </button>)}
      </div>
    </div>;
  }

  const kb = selected.knowledgeBases?.[0];
  const widget = selected.widget || {};

  return <div className="adminPage assistantsPage">
    <header className="pageHead">
      <div><h1>{selected.name}</h1><p>{selected.status === "PUBLISHED" ? "المساعد منشور وجاهز للربط" : "انشر المساعد قبل استخدامه في المواقع"}</p></div>
      <div className="buttonRow"><button className="secondary" onClick={() => setSelected(null)}>كل المساعدين</button><button onClick={async () => { await api(`/assistants/${selected.id}/publish`, { method: "POST" }); await open(selected.id); }}>نشر</button></div>
    </header>

    <nav className="assistantTabs">
      {([
        ["settings", "الإعدادات"], ["knowledge", "المعرفة"], ["test", "الاختبار"], ["widget", "ربط المواقع"], ["conversations", "محادثات الزوار"]
      ] as Array<[Tab, string]>).map(([value, label]) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>)}
    </nav>

    {tab === "settings" && <div className="card assistantSection">
      <h2>إعدادات المساعد</h2>
      <div className="formGrid">
        <label><span>الاسم</span><input value={selected.name || ""} onChange={e => setSelected({ ...selected, name: e.target.value })} /></label>
        <label><span>اللغة</span><input value={selected.language || "ar"} onChange={e => setSelected({ ...selected, language: e.target.value })} /></label>
        <label className="fullWidth"><span>الوصف</span><textarea rows={3} value={selected.description || ""} onChange={e => setSelected({ ...selected, description: e.target.value })} /></label>
        <label className="fullWidth"><span>تعليمات المساعد</span><textarea rows={10} value={selected.systemPrompt || ""} onChange={e => setSelected({ ...selected, systemPrompt: e.target.value })} /></label>
        <label><span>درجة الإبداع</span><input type="number" step="0.1" min="0" max="2" value={selected.temperature} onChange={e => setSelected({ ...selected, temperature: e.target.value })} /></label>
        <label><span>الحد الأقصى للرد</span><input type="number" value={selected.maxOutputTokens} onChange={e => setSelected({ ...selected, maxOutputTokens: e.target.value })} /></label>
        <label className="fullWidth"><span>رسالة عدم توفر المعلومة</span><textarea rows={3} value={selected.fallbackMessage || ""} onChange={e => setSelected({ ...selected, fallbackMessage: e.target.value })} /></label>
      </div>
      <button disabled={saving} onClick={save}>{saving ? "جاري الحفظ..." : "حفظ الإعدادات"}</button>
    </div>}

    {tab === "knowledge" && <div className="grid2">
      <div className="card assistantSection"><h2>الملفات</h2><input type="file" accept=".pdf,.docx,.txt,.csv,.md" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0]).catch(err => alert(err.message))} />
        {kb?.documents?.map((d: any) => <div className="row" key={d.id}><span>{d.originalName}<small> — {d.status}</small></span><button onClick={async () => { await api(`/assistants/${selected.id}/documents/${d.id}`, { method: "DELETE" }); await open(selected.id); }}>حذف</button></div>)}</div>
      <div className="card assistantSection"><h2>الأسئلة والأجوبة</h2><input value={question} onChange={e => setQuestion(e.target.value)} placeholder="السؤال" /><textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="الجواب" /><button onClick={addFaq}>إضافة</button>{selected.faqItems?.map((f: any) => <div className="faq" key={f.id}><b>{f.question}</b><p>{f.answer}</p></div>)}</div>
    </div>}

    {tab === "test" && <div className="grid2">
      <div className="card assistantSection"><h2>اختبار مباشر</h2><textarea rows={7} value={testMessage} onChange={e => setTestMessage(e.target.value)} placeholder="اكتب سؤالًا" /><button onClick={test}>إرسال للمساعد</button></div>
      <div className="card assistantSection"><h2>النتيجة</h2><div className="testReply">{testReply || "سيظهر الرد هنا"}</div></div>
      <div className="card assistantSection"><h2>API</h2><button onClick={createKey}>إنشاء API Key</button>{apiKey && <div className="copyBlock"><code>{apiKey}</code><button onClick={() => copyText(apiKey)}>نسخ</button></div>}<p>Assistant ID</p><div className="copyBlock"><code>{selected.id}</code><button onClick={() => copyText(selected.id)}>نسخ</button></div></div>
    </div>}

    {tab === "widget" && <div className="widgetLayout">
      <div className="card assistantSection">
        <h2>إعدادات الربط بالموقع</h2>
        <div className="formGrid">
          <label className="toggleLine fullWidth"><input type="checkbox" checked={widget.enabled ?? true} onChange={e => setSelected({ ...selected, widget: { ...widget, enabled: e.target.checked } })} /><span>تفعيل الودجت</span></label>
          <label><span>اللون</span><input type="color" value={widget.primaryColor || "#6d4aff"} onChange={e => setSelected({ ...selected, widget: { ...widget, primaryColor: e.target.value } })} /></label>
          <label><span>الموضع</span><select value={widget.position || "bottom-right"} onChange={e => setSelected({ ...selected, widget: { ...widget, position: e.target.value } })}><option value="bottom-right">أسفل اليمين</option><option value="bottom-left">أسفل اليسار</option></select></label>
          <label><span>المظهر</span><select value={widget.theme || "auto"} onChange={e => setSelected({ ...selected, widget: { ...widget, theme: e.target.value } })}><option value="auto">حسب الجهاز</option><option value="light">فاتح</option><option value="dark">داكن</option></select></label>
          <label><span>نص زر الفتح</span><input value={widget.launcherLabel || "محادثة"} onChange={e => setSelected({ ...selected, widget: { ...widget, launcherLabel: e.target.value } })} /></label>
          <label className="fullWidth"><span>رسالة الترحيب</span><textarea rows={3} value={widget.welcomeMessage || ""} onChange={e => setSelected({ ...selected, widget: { ...widget, welcomeMessage: e.target.value } })} /></label>
          <label className="fullWidth"><span>نص مربع الكتابة</span><input value={widget.inputPlaceholder || "اكتب رسالتك..."} onChange={e => setSelected({ ...selected, widget: { ...widget, inputPlaceholder: e.target.value } })} /></label>
          <label className="toggleLine"><input type="checkbox" checked={widget.collectVisitorInfo ?? false} onChange={e => setSelected({ ...selected, widget: { ...widget, collectVisitorInfo: e.target.checked } })} /><span>طلب اسم وبريد الزائر</span></label>
          <label className="toggleLine"><input type="checkbox" checked={widget.showBranding ?? true} onChange={e => setSelected({ ...selected, widget: { ...widget, showBranding: e.target.checked } })} /><span>إظهار علامة Nexora</span></label>
          <label className="fullWidth"><span>رابط الخصوصية</span><input value={widget.privacyUrl || ""} onChange={e => setSelected({ ...selected, widget: { ...widget, privacyUrl: e.target.value } })} placeholder="https://example.com/privacy" /></label>
          <label className="fullWidth"><span>الدومينات المسموحة — كل نطاق بسطر</span><textarea rows={5} value={(widget.allowedDomains || []).join("\n")} onChange={e => setSelected({ ...selected, widget: { ...widget, allowedDomains: e.target.value.split("\n").map((x: string) => x.trim()).filter(Boolean) } })} placeholder="example.com\nshop.example.com" /></label>
        </div>
        <div className="buttonRow"><button disabled={saving} onClick={saveWidget}>حفظ إعدادات الربط</button><button className="secondary" onClick={async () => { if (!confirm("سيصبح الكود القديم غير صالح. متابعة؟")) return; const data = await api(`/assistants/${selected.id}/widget/regenerate-key`, { method: "POST" }); setSelected({ ...selected, widget: { ...widget, publicKey: data.publicKey } }); }}>تغيير مفتاح الودجت</button></div>
      </div>
      <div className="card assistantSection">
        <h2>كود التضمين</h2>
        <p>ضع هذا السطر قبل إغلاق وسم <code>&lt;/body&gt;</code> في الموقع الآخر.</p>
        {embedCode ? <div className="copyBlock embedCode"><code>{embedCode}</code><button onClick={() => copyText(embedCode)}>نسخ الكود</button></div> : <p>احفظ الإعدادات أولًا.</p>}
        <div className="embedChecklist"><b>قبل الاختبار</b><span>1. انشر المساعد.</span><span>2. أضف دومين الموقع بدون https.</span><span>3. احفظ الإعدادات.</span><span>4. انسخ الكود إلى الموقع الآخر.</span></div>
      </div>
    </div>}

    {tab === "conversations" && <div className="conversationAdminLayout">
      <div className="card conversationList"><div className="sectionHead"><h2>محادثات الزوار</h2><button className="secondary" onClick={loadConversations}>تحديث</button></div>{conversations.length === 0 && <p>لا توجد محادثات بعد.</p>}{conversations.map(item => <button key={item.id} className={conversation?.id === item.id ? "conversationItem active" : "conversationItem"} onClick={() => openConversation(item.id)}><b>{item.visitorName || item.visitorEmail || "زائر"}</b><span>{item.sourceDomain || item.source}</span><small>{item.messages?.[0]?.content || "بدون رسائل"}</small></button>)}</div>
      <div className="card conversationDetail"><h2>تفاصيل المحادثة</h2>{!conversation ? <p>اختر محادثة من القائمة.</p> : <><div className="visitorMeta"><span>الاسم: {conversation.visitorName || "—"}</span><span>البريد: {conversation.visitorEmail || "—"}</span><span>الموقع: {conversation.sourceDomain || "—"}</span><span>الصفحة: {conversation.pageUrl || "—"}</span></div><div className="conversationMessages">{conversation.messages.map((message: any) => <div key={message.id} className={`adminMessage ${message.role === "user" ? "user" : "assistant"}`}><b>{message.role === "user" ? "الزائر" : selected.name}</b><p>{message.content}</p></div>)}</div><select value={conversation.status} onChange={async e => { const updated = await api(`/assistants/${selected.id}/conversations/${conversation.id}`, { method: "PATCH", body: JSON.stringify({ status: e.target.value }) }); setConversation({ ...conversation, status: updated.status }); }}><option value="OPEN">مفتوحة</option><option value="RESOLVED">تم الحل</option><option value="ARCHIVED">مؤرشفة</option></select></>}</div>
    </div>}
  </div>;
}
