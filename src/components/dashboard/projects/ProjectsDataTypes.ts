// --- FILE: src/components/dashboard/projects/ProjectsDataTypes.ts ---
export interface ZohoProject {
    id: string;
    name: string;
    portal_id: string;
}

export interface ZohoTask {
    id: string;
    name: string;
    description: string;
    status: { id: string; name: string };
    tasklist?: { id: string; name: string };
    custom_fields?: Record<string, any>;
}

export interface ProjectsFormData {
  taskName: string; 
  primaryField: string;
  primaryValues: string;
  taskDescription: string;
  projectId: string;
  tasklistId: string;
  delay: number;
  bulkDefaultData: { [key: string]: string }; 
  emails?: string;
  displayName?: string; 
  stopAfterFailures?: number; 
  enableTracking?: boolean;
  appendAccountNumber?: boolean;
  smartSplitterText?: string; 
}

export interface ProjectsResult {
  primaryValue: string;
  success: boolean;
  details?: string;
  error?: string;
  fullResponse?: any;
  timestamp?: Date;
  number?: number; 
}

export interface ProjectsJobState {
    formData: ProjectsFormData; 
    results: ProjectsResult[];
    isProcessing: boolean;
    isPaused: boolean;
    isComplete: boolean;
    processingStartTime: Date | null;
    processingTime: number;
    totalToProcess: number;
    countdown: number;
    currentDelay: number;
    filterText: string;
}

export interface ProjectsJobs {
    [profileName: string]: ProjectsJobState;
}