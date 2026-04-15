// --- FILE: src/pages/ProjectsTasksPage.tsx (FIXED) ---
import React from 'react';
import { Socket } from 'socket.io-client';
import { Profile, ProjectsJobs, ProjectsJobState } from '@/App';
import { ProjectsTasksDashboard } from '@/components/dashboard/projects/ProjectsTasksDashboard'; // This import is correct

interface ProjectsTasksPageProps {
  jobs: ProjectsJobs;
  setJobs: React.Dispatch<React.SetStateAction<ProjectsJobs>>;
  socket: Socket | null;
  createInitialJobState: () => ProjectsJobState;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

const ProjectsTasksPage: React.FC<ProjectsTasksPageProps> = (props) => {
  return (
    <ProjectsTasksDashboard
      {...props}
      title="Zoho Projects Bulk Tasks"
      jobType="projects"
      description="Create, view, and manage bulk tasks for Zoho Projects."
    />
  );
};

export default ProjectsTasksPage; // <-- FIX: This was exporting the wrong component