export interface CodeChallenge {
  id: string;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  timeLimit: number; // minutes
  languages: string[];
  starterCode: Record<string, string>;
  testCases: TestCase[];
  constraints: string[];
  questionSource?: string;
}

export interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  isHidden: boolean; // Hidden test cases for final scoring
}

export interface CodeSubmission {
  language: string;
  code: string;
  testResults: TestResult[];
  executionTime: number;
  memoryUsed: number;
  submittedAt: string;
}

export interface TestResult {
  testCaseId: string;
  passed: boolean;
  expected: string;
  actual: string;
  error?: string;
  runtime: number; // ms
}

export interface CodingRoundStats {
  totalTestsPassed: number;
  totalTests: number;
  timeSpent: number;
  submissionCount: number;
  language: string;
  executionTime: number;
  memoryUsed: number;
}
