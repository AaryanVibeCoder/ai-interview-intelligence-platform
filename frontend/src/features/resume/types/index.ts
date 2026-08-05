export interface ResumeMetadata {
  file_name: string;
  file_url: string;
  file_size: number;
}

export interface ResumeResponse extends ResumeMetadata {
  id: number;
  user_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  technical_skills?: string[];
  experience_level?: string;
  ats_score?: number | null;
  analysis_status?: string;
}

export interface ResumeDeleteResponse {
  id: number;
  success: boolean;
}

