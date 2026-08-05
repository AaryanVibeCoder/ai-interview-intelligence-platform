import { create } from "zustand";
import { persist, devtools } from "zustand/middleware";

export interface InterviewAnswer {
  question: string;
  answer: string;
  score: number;
  timestamp: string;
  feedback?: any;
}

export interface InterviewState {
  interviewType: "behavioral" | "coding" | null;
  currentQuestion: string;
  answers: InterviewAnswer[];
  resumeData: any;
  atsScore: number;
  codingSubmissions: any[];
  preflightCompleted: boolean;
  activeSessionId: number | null;
  targetCompany: string;
  experienceLevel: string;
  role: string;
  jobType: string;
  // "fallback" = static opener returned instantly; "llm" = personalized opener
  // swapped in by the backend background task.
  questionSource: "fallback" | "llm" | string;

  setInterviewType: (type: "behavioral" | "coding" | null) => void;
  addAnswer: (question: string, answer: string, score: number, feedback?: any) => void;
  setCodingSubmission: (submission: any) => void;
  setResumeData: (data: any, atsScore: number) => void;
  setPreflightCompleted: (completed: boolean) => void;
  setActiveSessionId: (id: number | null) => void;
  setTargetCompany: (company: string) => void;
  setExperienceLevel: (level: string) => void;
  setRole: (role: string) => void;
  setJobType: (jobType: string) => void;
  setCurrentQuestion: (question: string) => void;
  setQuestionSource: (source: "fallback" | "llm" | string) => void;
  resetSession: () => void;
}

const initialState = {
  interviewType: null,
  currentQuestion: "",
  answers: [],
  resumeData: null,
  atsScore: 0,
  codingSubmissions: [],
  preflightCompleted: false,
  activeSessionId: null,
  targetCompany: "",
  experienceLevel: "",
  role: "",
  jobType: "",
  questionSource: "fallback" as "fallback" | "llm" | string,
};

export const useInterviewStore = create<InterviewState>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,

        setInterviewType: (type) => set({ interviewType: type }, false, "interview/setInterviewType"),

        addAnswer: (question, answer, score, feedback) =>
          set(
            (state) => ({
              answers: [
                ...state.answers,
                { question, answer, score, feedback, timestamp: new Date().toISOString() },
              ],
            }),
            false,
            "interview/addAnswer"
          ),

        setCodingSubmission: (submission) =>
          set(
            (state) => ({
              codingSubmissions: [...state.codingSubmissions, submission],
            }),
            false,
            "interview/setCodingSubmission"
          ),

        setResumeData: (data, atsScore) =>
          set({ resumeData: data, atsScore }, false, "interview/setResumeData"),

        setPreflightCompleted: (completed) =>
          set({ preflightCompleted: completed }, false, "interview/setPreflightCompleted"),

        setActiveSessionId: (id) =>
          set({ activeSessionId: id }, false, "interview/setActiveSessionId"),

        setTargetCompany: (company) =>
          set({ targetCompany: company }, false, "interview/setTargetCompany"),

        setExperienceLevel: (level) =>
          set({ experienceLevel: level }, false, "interview/setExperienceLevel"),

        setRole: (role) =>
          set({ role }, false, "interview/setRole"),

        setJobType: (jobType) =>
          set({ jobType }, false, "interview/setJobType"),

        setCurrentQuestion: (question) =>
          set({ currentQuestion: question }, false, "interview/setCurrentQuestion"),

        setQuestionSource: (source) =>
          set({ questionSource: source }, false, "interview/setQuestionSource"),

        resetSession: () => set(initialState, false, "interview/resetSession"),
      }),
      {
        name: "elevateiq-interview-store",
      }
    ),
    {
      enabled: process.env.NODE_ENV === "development",
      name: "elevateiq-interview-store",
    }
  )
);
