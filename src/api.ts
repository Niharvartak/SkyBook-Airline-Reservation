const API_BASE_URL = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export async function apiFetch(path: string, options: RequestInit = {}, withAuth = false) {
  const fullUrl = path.startsWith("http")
    ? path
    : `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  const headers = new Headers(options.headers || {});

  if (withAuth) {
    const storedToken = localStorage.getItem("skybook-token");
    if (storedToken) headers.set("Authorization", `Bearer ${storedToken}`);
  }
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(fullUrl, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();

  // A rejected login is not an expired session. Only emit the global
  // unauthorized event for authenticated requests so a bad password stays
  // on the sign-in screen (including the dedicated admin sign-in).
  const isAuthAttempt = path.startsWith("/api/auth/login")
    || path.startsWith("/api/admin/login")
    || path.startsWith("/api/auth/register")
    || path.startsWith("/api/auth/forgot-password")
    || path.startsWith("/api/auth/reset-password");
  if (response.status === 401 && !isAuthAttempt) {
    localStorage.removeItem("skybook-token");
    window.dispatchEvent(new CustomEvent("skybook:unauthorized"));
  }
  if (!response.ok) {
    throw new Error(data?.message || (response.status === 403 ? "Access denied." : "Request failed."));
  }
  return data;
}
