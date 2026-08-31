import type { Complaint, ComplaintStatus } from "../types/complaint";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

function getToken(): string | null {
  return localStorage.getItem("officer_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }

  return res.json();
}

export function fetchDashboardComplaints(): Promise<Complaint[]> {
  return request<Complaint[]>("/officers/dashboard");
}

export function fetchComplaint(id: number): Promise<Complaint> {
  return request<Complaint>(`/complaints/${id}`);
}

export function updateComplaintStatus(
  id: number,
  status: ComplaintStatus
): Promise<Complaint> {
  return request<Complaint>(`/complaints/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
