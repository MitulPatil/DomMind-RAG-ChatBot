// api.js — centralized API client with auth headers

const API_BASE = "/api/v1";

function getToken() {
  return localStorage.getItem("docmind_token");
}

export function saveToken(token) {
  localStorage.setItem("docmind_token", token);
}

export function clearToken() {
  localStorage.removeItem("docmind_token");
  localStorage.removeItem("docmind_user");
}

export function getSavedUser() {
  const saved = localStorage.getItem("docmind_user");
  return saved ? JSON.parse(saved) : null;
}

// authFetch — wraps fetch with Authorization header automatically
export async function authFetch(path, options = {}) {
  const token = getToken();
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = {
    ...(!isFormData ? { "Content-Type": "application/json" } : {}),
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    ...options.headers
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    clearToken();
    window.location.href = "/";
    throw new Error("Session expired — please log in again");
  }

  return response;
}

// authFetchStream — for SSE endpoints, returns the response directly
export async function authFetchStream(path, body, options = {}) {
  const token = getToken();
  const { headers: extraHeaders, ...restOptions } = options;
  return fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      ...extraHeaders
    },
    body: JSON.stringify(body),
    ...restOptions
  });
}

export async function authLogin(email, password, isRegistering = false) {
  const endpoint = isRegistering ? "/auth/register" : "/auth/login";

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  return response.json();
}