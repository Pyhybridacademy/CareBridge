export type Role = 'patient' | 'nurse'

export interface Profile {
  id: string
  full_name: string
  phone: string | null
  avatar_url: string | null
  dob: string | null
  gender: string | null
  license_number: string | null
  specialty: string | null
  emergency_contact: string | null
}

export type MessageType = 'text' | 'voice' | 'video' | 'image'

export interface Message {
  id: string
  sender_id: string
  receiver_id: string
  type: MessageType
  content: string | null
  media_path: string | null
  duration_seconds: number | null
  created_at: string
  read_at: string | null
}

export interface PatientRecord {
  id: string
  patient_id: string
  nurse_id: string
  visit_date: string
  symptoms: string | null
  blood_pressure: string | null
  temperature: number | null
  pulse: number | null
  weight: number | null
  spo2: number | null
  diagnosis_notes: string | null
  created_at: string
}

export interface TreatmentItem {
  id: string
  plan_id: string
  medication_or_task: string
  dosage: string | null
  frequency: string | null
  duration: string | null
  instructions: string | null
  media_path: string | null
  is_completed: boolean
}

export interface TreatmentPlan {
  id: string
  patient_id: string
  nurse_id: string
  title: string
  description: string | null
  status: 'active' | 'completed'
  start_date: string
  end_date: string | null
  created_at: string
  treatment_items?: TreatmentItem[]
}

export type AppointmentStatus = 'requested' | 'confirmed' | 'completed' | 'cancelled'

export interface Appointment {
  id: string
  patient_id: string
  nurse_id: string
  scheduled_at: string
  reason: string | null
  status: AppointmentStatus
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}
