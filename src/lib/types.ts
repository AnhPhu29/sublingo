export interface TranslationData {
  status: 'translating' | 'done' | 'error';
  aiResult: string;
  result: string;
  error: string;
}

export interface FileQueueItem {
  id: string;
  file: File;
  name: string;
  lineCount: number;
  charCount: number;
  status: 'pending' | 'translating' | 'done' | 'error';
  error: string;
  results: Record<string, TranslationData>;
}

export interface CostSummary {
  totalCostUsd: number;
  totalSavedUsd: number;
  totalDurationSeconds: number;
  totalJobs: number;
  costsByDate: Array<{ date: string; amount: number; duration: number }>;
  costsByType: Array<{ type: string; amount: number }>;
}

export interface GlossaryItem {
  id?: string;
  term: string;
  translation: string;
}
