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

  if (response.status === 401) {
    localStorage.removeItem("skybook-token");
    window.dispatchEvent(new CustomEvent("skybook:unauthorized"));
  }
  if (!response.ok) {
    throw new Error(data?.message || (response.status === 403 ? "Access denied." : "Request failed."));
  }
  return data;
}
