import type { Complaint, Officer } from "../types/complaint";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("cp_officer_token");
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; officer: Officer }>("/auth/officer-login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  getQueue: (params?: { status?: string; category?: string; query?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<Complaint[]>(`/officers/complaints${qs ? `?${qs}` : ""}`);
  },

  getComplaint: (id: string) => request<Complaint>(`/officers/complaints/${id}`),

  updateStatus: (id: string, status: string, note?: string) =>
    request<Complaint>(`/officers/complaints/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, note }),
    }),

  getDashboardStats: () =>
    request<{ open: number; inProgress: number; resolved: number; overdue: number }>(
      "/officers/dashboard/stats"
    ),

  getMapComplaints: () => request<Complaint[]>("/officers/complaints/map"),
};
