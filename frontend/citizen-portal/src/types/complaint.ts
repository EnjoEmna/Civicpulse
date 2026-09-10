export type ComplaintStatus = "open" | "in_progress" | "resolved" | "rejected";

export type ComplaintCategory =
  | "roads"
  | "water_supply"
  | "electricity"
  | "sanitation"
  | "public_safety"
  | "other";

export interface EvidenceFile {
  id: string;
  url: string;
  type: "image" | "video" | "document";
  uploadedAt: string;
}

export interface TimelineEvent {
  id: string;
  status: ComplaintStatus;
  note?: string;
  actor: string; // "You" | officer name | "System"
  timestamp: string;
}

export interface Complaint {
  id: string;
  title: string;
  description: string;
  category: ComplaintCategory;
  status: ComplaintStatus;
  createdAt: string;
  updatedAt: string;
  location: {
    address: string;
    lat: number;
    lng: number;
  };
  evidence: EvidenceFile[];
  timeline: TimelineEvent[];
  assignedOfficer?: string;
}

export interface CitizenProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  ward?: string;
  notificationPrefs: {
    email: boolean;
    sms: boolean;
  };
}
