import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

type RequestData = {
  id: string; fullName: string; companyName: string; email: string; websiteUrl: string;
  assistantName: string; status: string; assistantPublicKey?: string | null; embedCode?: string | null;
  messages: Array<{ id: string; sender: string; content: string; createdAt: string }>;
  files: Array<{ id: string; originalName: string; mimeType: string; sizeBytes: number }>;
};

const steps = [
  ["fullName", "ما اسمك الكامل؟"], ["companyName", "ما اسم الشركة أو المشروع؟"],
  ["email", "ما بريدك الإلكتروني؟"], ["phone", "رقم الهاتف أو واتساب (اختياري)"],
  ["websiteUrl", "ما رابط موقعك؟"], ["assistantName", "ما الاسم المقترح للمساعد؟"],
  ["businessDescription", "اشرح لنا نشاطك وما الذي تريد من المساعد أن يفعله."],
] as const;

export default function OnboardingPage() {
  const savedId = localStorage.getItem("nexoraOnboardingId") || "";
  const savedToken = localStorage.getItem("nexoraOnboardingToken") || "";
  const [requestId, setRequestId] = useState(savedId);
  const [token, setToken] = useState(savedToken);
  const [data, setData] = useState<RequestData | null>(null);
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState("");
  const [form, setForm] = useState<Record<string, string>>({ language: "ar", channelPreference: "BOTH" });
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    if (!requestId || !token) return;
    try { setData(await api(`/onboarding/requests/${requestId}?token=${encodeURIComponent(token)}`)); } catch {}
  }
  useEffect(() => { refresh(); if (!requestId) return; const timer = setInterval(refresh, 4000); return () => clearInterval(timer); }, [requestId, token]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [data?.messages.length]);

  function next() {
    const [key] = steps[step];
    if (key !== "phone" && answer.trim().length < 2) return;
    setForm(current => ({ ...current, [key]: answer.trim() }));
    setAnswer("");
    setStep(value => value + 1);
  }

  async function submit() {
    setBusy(true);
    try {
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => body.append(key, String(value)));
      files.forEach(file => body.append("files", file));
      const result = await api("/onboarding/requests", { method: "POST", body });
      localStorage.setItem("nexoraOnboardingId", result.request.id);
      localStorage.setItem("nexoraOnboardingToken", result.token);
      setRequestId(result.request.id); setToken(result.token); setData(result.request);
    } catch (error: any) { alert(error.message); } finally { setBusy(false); }
  }

  async function send() {
    if (!message.trim() || !data) return;
    const content = message.trim(); setMessage("");
    await api(`/onboarding/requests/${data.id}/messages`, { method: "POST", body: JSON.stringify({ token, content }) });
    await refresh();
  }

  if (!requestId) return <div className="onboardingShell" dir="rtl">
    <div className="onboardingIntro"><div className="brandMark">N</div><span>NEXORA ASSISTANT SETUP</span><h1>لنجهّز مساعدك الذكي</h1><p>أجب عن الأسئلة، أرفق ملفات شركتك، ثم يتابع معك موظف دعم نكسورا داخل نفس الصفحة أو عبر البريد.</p></div>
    <div className="onboardingChat">
      <div className="onboardingBubble bot">مرحبًا 👋 سأساعدك في تقديم طلب إعداد مساعد ذكي لموقعك.</div>
      {steps.slice(0, step).map(([key, label]) => <React.Fragment key={key}><div className="onboardingBubble bot">{label}</div><div className="onboardingBubble user">{form[key] || "—"}</div></React.Fragment>)}
      {step < steps.length ? <>
        <div className="onboardingBubble bot">{steps[step][1]}</div>
        <div className="onboardingComposer"><textarea value={answer} onChange={e => setAnswer(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); next(); } }} /><button onClick={next}>متابعة</button></div>
      </> : <div className="onboardingReview">
        <h3>أرفق الملف التعريفي أو ملفات المعرفة</h3><input type="file" multiple onChange={e => setFiles(Array.from(e.target.files || []))} />
        <label>طريقة التواصل<select value={form.channelPreference} onChange={e => setForm({ ...form, channelPreference: e.target.value })}><option value="BOTH">الموقع والبريد</option><option value="SITE">الموقع فقط</option><option value="EMAIL">البريد فقط</option></select></label>
        <button className="primaryAction" onClick={submit} disabled={busy}>{busy ? "جارٍ الإرسال…" : "إرسال الطلب"}</button>
      </div>}
    </div>
  </div>;

  return <div className="onboardingShell tracking" dir="rtl">
    <div className="onboardingIntro"><div className="brandMark">N</div><span>REQUEST #{requestId.slice(-8)}</span><h1>{data?.assistantName || "طلب المساعد"}</h1><p>{data?.companyName}</p><div className={`onboardingStatus ${String(data?.status || "").toLowerCase()}`}>{data?.status}</div></div>
    <div className="onboardingChat live">
      <div className="onboardingMessages">{data?.messages.map(item => <div key={item.id} className={`onboardingBubble ${item.sender === "CUSTOMER" ? "user" : item.sender === "SUPPORT" ? "support" : "bot"}`}><small>{item.sender === "SUPPORT" ? "موظف نكسورا" : item.sender === "CUSTOMER" ? "أنت" : "النظام"}</small>{item.content}</div>)}<div ref={endRef} /></div>
      {data?.embedCode && <div className="embedReady"><b>تم تجهيز كود التثبيت</b><pre>{data.embedCode}</pre><button onClick={() => navigator.clipboard.writeText(data.embedCode || "")}>نسخ الكود</button></div>}
      <div className="onboardingComposer"><textarea placeholder="اكتب ردك لموظف الدعم…" value={message} onChange={e => setMessage(e.target.value)} /><button onClick={send}>إرسال</button></div>
    </div>
  </div>;
}
