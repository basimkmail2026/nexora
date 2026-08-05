import React, { useEffect, useState } from "react";
import { api } from "../lib/api";

type Connection = {
  id: string;
  code: string;
  name: string;
  kind: string;
  enabled: boolean;
  mode: "test" | "live";
  publicSettings?: Record<string, any>;
  status: string;
  lastTestedAt?: string;
  lastError?: string;
  hasSecrets: boolean;
};

type GeminiForm = {
  apiKey: string;
  model: string;
  baseUrl: string;
  systemInstruction: string;
  enabled: boolean;
  mode: "test" | "live";
};

const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

export default function SystemAdmin({ onClose }: { onClose: () => void }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [backups, setBackups] = useState<any[]>([]);
  const [editing, setEditing] = useState<Connection | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [gemini, setGemini] = useState<GeminiForm>({
    apiKey: "",
    model: DEFAULT_GEMINI_MODEL,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    systemInstruction: "أنت مساعد نكسورا. أجب بلغة المستخدم بوضوح ودقة.",
    enabled: true,
    mode: "live"
  });

  async function load() {
    const [connectionsData, healthData, backupsData] = await Promise.all([
      api("/admin/connections"),
      api("/admin/system/health"),
      api("/admin/system/backups")
    ]);

    setConnections(connectionsData);
    setHealth(healthData);
    setBackups(backupsData);
  }

  useEffect(() => {
    load();
  }, []);

  function openConnection(connection: Connection) {
    setMessage("");
    setEditing(connection);

    if (connection.code === "gemini") {
      setGemini({
        apiKey: "",
        model: connection.publicSettings?.model || DEFAULT_GEMINI_MODEL,
        baseUrl:
          connection.publicSettings?.baseUrl ||
          "https://generativelanguage.googleapis.com/v1beta",
        systemInstruction:
          connection.publicSettings?.systemInstruction ||
          "أنت مساعد نكسورا. أجب بلغة المستخدم بوضوح ودقة.",
        enabled: connection.enabled,
        mode: connection.mode || "live"
      });
    }
  }

  async function saveGemini() {
    if (!editing) return;

    setSaving(true);
    setMessage("");

    try {
      await api(`/admin/connections/${editing.code}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editing.name,
          kind: editing.kind,
          enabled: gemini.enabled,
          mode: gemini.mode,
          config: {
            apiKey: gemini.apiKey,
            baseUrl: gemini.baseUrl
          },
          publicSettings: {
            model: gemini.model.trim(),
            baseUrl: gemini.baseUrl.trim(),
            systemInstruction: gemini.systemInstruction.trim()
          }
        })
      });

      setMessage("تم حفظ إعدادات Gemini. تغيير الموديل يعمل فورًا بدون Deploy.");
      setGemini(current => ({ ...current, apiKey: "" }));
      await load();
    } catch (error: any) {
      setMessage(error.message || "فشل حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection(code: string) {
    setTesting(true);
    setMessage("");

    try {
      const result = await api(`/admin/connections/${code}/test`, {
        method: "POST"
      });
      setMessage(`نجح الاتصال خلال ${result.latencyMs}ms`);
      await load();
    } catch (error: any) {
      setMessage(error.message || "فشل اختبار الاتصال");
    } finally {
      setTesting(false);
    }
  }

  async function backup() {
    await api("/admin/system/backup", { method: "POST" });
    setMessage("تم إنشاء مهمة نسخ احتياطي");
    await load();
  }

  return (
    <div className="adminPage">
      <header className="pageHead">
        <div>
          <h1>النظام والاتصالات</h1>
          <p>إدارة المفاتيح والموديلات والخدمات من مكان واحد.</p>
        </div>
        <button onClick={onClose}>رجوع</button>
      </header>

      {message && <div className="notice">{message}</div>}

      <div className="stats">
        {health?.checks?.map((item: any) => (
          <div className="stat" key={item.component}>
            <span>{item.component}</span>
            <b>{item.status}</b>
            <small>{item.latencyMs ? `${item.latencyMs}ms` : ""}</small>
          </div>
        ))}
      </div>

      <div className="grid2">
        <div className="card">
          <h2>الخدمات الخارجية</h2>

          {connections.map(connection => (
            <div className="row connectionRow" key={connection.id}>
              <div>
                <b>{connection.name}</b>
                <small>
                  {" "}
                  — {connection.status} / {connection.mode}
                  {connection.lastError ? ` — ${connection.lastError}` : ""}
                </small>
              </div>

              <div className="buttonRow">
                <button onClick={() => openConnection(connection)}>إعداد</button>
                <button
                  className="secondary"
                  disabled={testing}
                  onClick={() => testConnection(connection.code)}
                >
                  اختبار
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h2>النسخ الاحتياطي</h2>
          <button onClick={backup}>إنشاء نسخة احتياطية</button>

          {backups.map(backupItem => (
            <div className="row" key={backupItem.id}>
              <span>{backupItem.type}</span>
              <b>{backupItem.status}</b>
            </div>
          ))}
        </div>
      </div>

      {editing?.code === "gemini" && (
        <div className="connectionEditor card">
          <div className="pageHead">
            <div>
              <h2>إعداد Google Gemini</h2>
              <p>
                المفتاح لا يظهر بعد حفظه. اترك خانته فارغة للاحتفاظ بالمفتاح الحالي.
              </p>
            </div>
            <button className="secondary" onClick={() => setEditing(null)}>
              إغلاق
            </button>
          </div>

          <div className="formGrid">
            <label>
              <span>API Key</span>
              <input
                type="password"
                value={gemini.apiKey}
                placeholder={
                  editing.hasSecrets
                    ? "مفتاح محفوظ — اتركه فارغًا للاحتفاظ به"
                    : "الصق مفتاح Gemini"
                }
                onChange={event =>
                  setGemini(current => ({
                    ...current,
                    apiKey: event.target.value
                  }))
                }
              />
            </label>

            <label>
              <span>الموديل</span>
              <input
                value={gemini.model}
                placeholder={DEFAULT_GEMINI_MODEL}
                onChange={event =>
                  setGemini(current => ({
                    ...current,
                    model: event.target.value
                  }))
                }
              />
            </label>

            <label>
              <span>Base URL</span>
              <input
                value={gemini.baseUrl}
                onChange={event =>
                  setGemini(current => ({
                    ...current,
                    baseUrl: event.target.value
                  }))
                }
              />
            </label>

            <label>
              <span>الوضع</span>
              <select
                value={gemini.mode}
                onChange={event =>
                  setGemini(current => ({
                    ...current,
                    mode: event.target.value as "test" | "live"
                  }))
                }
              >
                <option value="test">Test</option>
                <option value="live">Live</option>
              </select>
            </label>

            <label className="fullWidth">
              <span>تعليمات النظام</span>
              <textarea
                rows={4}
                value={gemini.systemInstruction}
                onChange={event =>
                  setGemini(current => ({
                    ...current,
                    systemInstruction: event.target.value
                  }))
                }
              />
            </label>

            <label className="toggleLine fullWidth">
              <input
                type="checkbox"
                checked={gemini.enabled}
                onChange={event =>
                  setGemini(current => ({
                    ...current,
                    enabled: event.target.checked
                  }))
                }
              />
              <span>تفعيل Gemini للمحادثات</span>
            </label>
          </div>

          <div className="buttonRow">
            <button disabled={saving} onClick={saveGemini}>
              {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
            </button>

            <button
              className="secondary"
              disabled={testing}
              onClick={() => testConnection("gemini")}
            >
              {testing ? "جاري الاختبار..." : "اختبار الاتصال"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
