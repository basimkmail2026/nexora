const API = import.meta.env.VITE_API_URL || "/api";

async function doFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("accessToken");
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${API}${path}`, { ...options, headers });
}

export async function api(path: string, options: RequestInit = {}) {
  let response = await doFetch(path, options);
  if (response.status === 401 && localStorage.getItem("refreshToken") && path !== "/auth/refresh") {
    const refreshResponse = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: localStorage.getItem("refreshToken") })
    });
    if (refreshResponse.ok) {
      const refreshed = await refreshResponse.json();
      localStorage.setItem("accessToken", refreshed.accessToken);
      response = await doFetch(path, options);
    }
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "حدث خطأ");
  return data;
}

export async function uploadFiles(files: File[]) {
  const form = new FormData();
  files.forEach(file => form.append("files", file));
  return api("/uploads", { method: "POST", body: form });
}
