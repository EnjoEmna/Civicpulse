export type ComplaintStatus =
  | "submitted"
  | "in_review"
  | "in_progress"
  | "resolved"
  | "rejected";

export interface Complaint {
  id: number;
  citizen_id: number;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  status: ComplaintStatus;
  created_at: string;
}
