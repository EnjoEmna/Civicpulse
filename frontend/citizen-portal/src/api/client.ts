import type { Complaint, CitizenProfile } from "../types/complaint";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("cp_citizen_token");
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
    request<{ token: string; profile: CitizenProfile }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  getMyComplaints: () => request<Complaint[]>("/complaints/mine"),

  getComplaint: (id: string) => request<Complaint>(`/complaints/${id}`),

  createComplaint: (payload: FormData) =>
    request<Complaint>("/complaints", {
      method: "POST",
      body: payload,
      headers: {}, // let the browser set multipart boundary
    }),

  getNearbyComplaints: (lat: number, lng: number) =>
    request<Complaint[]>(`/complaints/nearby?lat=${lat}&lng=${lng}`),

  getProfile: () => request<CitizenProfile>("/citizens/me"),

  updateProfile: (payload: Partial<CitizenProfile>) =>
    request<CitizenProfile>("/citizens/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
};
