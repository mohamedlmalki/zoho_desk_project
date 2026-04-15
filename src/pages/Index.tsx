import { ZohoDashboard } from "@/components/dashboard/ZohoDashboard";
import { Socket } from "socket.io-client";
import { Profile, JobState, Jobs } from "@/App"; // Simplified imports

interface IndexProps {
  jobs: Jobs;
  setJobs: React.Dispatch<React.SetStateAction<Jobs>>;
  socket: Socket | null;
  createInitialJobState: () => JobState;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

const Index = (props: IndexProps) => {
  return (
    <ZohoDashboard 
      {...props}
      service="desk" // <-- ADD THIS LINE
    />
  );
};

export default Index;