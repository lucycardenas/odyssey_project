export type Role = "user" | "caregiver";
export type AlertType = "obstacle" | "left" | "right" | "found";

export interface Profile {
  id: string;
  name: string;
  role: Role;
}

export interface Call {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
}

export interface Message {
  id: string;
  call_id: string;
  role: "user" | "agent";
  text: string;
  created_at: string;
}

export interface Alert {
  id: string;
  call_id: string | null;
  type: AlertType;
  distance_cm: number | null;
  created_at: string;
}
