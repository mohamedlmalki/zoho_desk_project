// --- FILE: src/components/dashboard/ProfileSelector.tsx ---
import React, { useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building, AlertCircle, CheckCircle, Loader, RefreshCw, Activity, Edit, Trash2, PauseCircle, CheckCircle2, StopCircle, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { Profile, Jobs as TicketJobs, ProjectsJobs } from '@/App'; 
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type ApiStatus = {
    status: 'loading' | 'success' | 'error';
    message: string;
    fullResponse?: any;
};

type AllJobs = TicketJobs | ProjectsJobs | any;
type ServiceType = 'desk' | 'projects';

interface ProfileSelectorProps {
  profiles: Profile[];
  selectedProfile: Profile | null;
  jobs: AllJobs;
  onProfileChange: (profileName: string) => void;
  apiStatus: ApiStatus;
  onShowStatus: () => void;
  onManualVerify: () => void;
  socket: Socket | null;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
  service?: ServiceType;
}

export const ProfileSelector: React.FC<ProfileSelectorProps> = ({
  profiles,
  selectedProfile,
  jobs,
  onProfileChange,
  apiStatus,
  onShowStatus,
  onManualVerify,
  socket,
  onEditProfile,
  onDeleteProfile,
  service = 'desk', 
}) => {

  const filteredProfiles = useMemo(() => {
    if (!profiles || profiles.length === 0) return [];
    
    const strictlyFiltered = profiles.filter(p => {
      if (!service) return true;
      if (service === 'desk') return p.desk && p.desk.orgId;
      if (service === 'projects') return p.projects && p.projects.portalId;
      return true;
    });

    if (strictlyFiltered.length === 0) {
        return profiles;
    }

    return strictlyFiltered;
  }, [profiles, service]);

  const currentIndex = useMemo(() => {
    if (!selectedProfile) return -1;
    return filteredProfiles.findIndex(p => p.profileName === selectedProfile.profileName);
  }, [selectedProfile, filteredProfiles]);

  const handlePrevProfile = () => {
    if (currentIndex > 0) {
      onProfileChange(filteredProfiles[currentIndex - 1].profileName);
    }
  };

  const handleNextProfile = () => {
    if (currentIndex !== -1 && currentIndex < filteredProfiles.length - 1) {
      onProfileChange(filteredProfiles[currentIndex + 1].profileName);
    }
  };

  useEffect(() => {
    if (!selectedProfile && filteredProfiles.length > 0) {
        onProfileChange(filteredProfiles[0].profileName);
    }
  }, [selectedProfile, filteredProfiles, onProfileChange]);

  useEffect(() => {
    if (selectedProfile?.profileName && socket?.connected) {
        socket.emit('checkApiStatus', { 
            selectedProfileName: selectedProfile.profileName, 
            service: service 
        });
    }
  }, [selectedProfile?.profileName, socket?.connected, service, socket, selectedProfile]);

  const getBadgeProps = () => {
    if (!apiStatus) {
        return { text: 'Loading...', variant: 'secondary' as const, icon: <Loader className="h-4 w-4 mr-2 animate-spin" /> };
    }
    switch (apiStatus.status) {
      case 'success':
        return { text: 'Connected', variant: 'success' as const, icon: <CheckCircle className="h-4 w-4 mr-2" /> };
      case 'error':
        return { text: 'Connection Failed', variant: 'destructive' as const, icon: <AlertCircle className="h-4 w-4 mr-2" /> };
      default:
        return { text: 'Checking...', variant: 'secondary' as const, icon: <Loader className="h-4 w-4 mr-2 animate-spin" /> };
    }
  };
 
  const getTotalToProcess = (job: any) => job?.totalTicketsToProcess || job?.totalToProcess || 0;

  return (
    <div className="flex items-start gap-3 w-full h-full overflow-x-auto pb-1 pt-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      
      <div className="flex items-center gap-1 border-r pr-3 shrink-0 h-9">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => selectedProfile && onEditProfile(selectedProfile)} disabled={!selectedProfile}>
            <Edit className="h-4 w-4" />
        </Button>
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" disabled={!selectedProfile}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the profile.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => selectedProfile && onDeleteProfile(selectedProfile.profileName)}>
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="flex flex-col gap-2 shrink-0">
        
        <div className="flex items-center gap-2">
          
          <Button 
            variant="outline" 
            size="icon" 
            className="h-9 w-9 shrink-0 shadow-sm" 
            onClick={handlePrevProfile}
            disabled={currentIndex <= 0 || filteredProfiles.length === 0}
            title="Previous Profile"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="w-[350px] shrink-0">
            <Select 
              value={selectedProfile?.profileName || selectedProfile?.name || ""} 
              onValueChange={(val) => { setTimeout(() => { onProfileChange(val); }, 300); }}
            >
              <SelectTrigger className="h-9 bg-muted/50 border-border hover:bg-muted transition-colors w-full shadow-sm font-medium">
                <SelectValue placeholder={filteredProfiles.length > 0 ? "Select a profile..." : "No profiles found"} />
              </SelectTrigger>
              <SelectContent className="bg-card border-border shadow-large max-w-[400px]">
                {filteredProfiles.map((profile) => {
                  const job = (jobs as any)[profile.profileName];
                  const total = getTotalToProcess(job);
                  const current = job?.results?.length || 0;
                  const failedCount = job?.results?.filter((r: any) => !r.success).length || 0;

                  let status: 'processing' | 'paused' | 'finished' | 'ended' | null = null;
                  
                  if (job) {
                    if (job.isProcessing) status = job.isPaused ? 'paused' : 'processing';
                    else if (job.isComplete) status = (current >= total && total > 0) ? 'finished' : 'ended';
                  }

                  return (
                    <SelectItem key={profile.profileName} value={profile.profileName} className="cursor-pointer hover:bg-accent focus:bg-accent py-2">
                      <div className="flex items-center justify-between w-full gap-4">
                        <div className="flex items-center space-x-2 flex-shrink min-w-0 pr-4">
                          <Building className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium truncate">{profile.profileName}</span>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                            {failedCount > 0 && (
                                <Badge variant="destructive" className="font-mono text-[10px] flex-shrink-0 gap-1 border-red-600 bg-red-100 text-red-700 hover:bg-red-100">
                                    <XCircle className="h-3 w-3" /><span>{failedCount} Fail</span>
                                </Badge>
                            )}
                            {status && (
                            <Badge variant="outline" className={`font-mono text-[10px] flex-shrink-0 gap-1 ${status === 'processing' ? 'border-primary text-primary' : status === 'paused' ? 'border-yellow-500 text-yellow-500' : status === 'finished' ? 'border-green-500 text-green-500' : 'border-red-500 text-red-500'}`}>
                                {status === 'processing' && <Activity className="h-3 w-3 animate-pulse"/>}
                                {status === 'paused' && <PauseCircle className="h-3 w-3"/>}
                                {status === 'finished' && <CheckCircle2 className="h-3 w-3"/>}
                                {status === 'ended' && <StopCircle className="h-3 w-3"/>}
                                <span>{current}/{total}</span>
                                <span className="capitalize hidden sm:inline">{status}</span>
                            </Badge>
                            )}
                        </div>
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          <Button 
            variant="outline" 
            size="icon" 
            className="h-9 w-9 shrink-0 shadow-sm" 
            onClick={handleNextProfile}
            disabled={currentIndex === -1 || currentIndex >= filteredProfiles.length - 1 || filteredProfiles.length === 0}
            title="Next Profile"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {selectedProfile && (
            <div className="flex items-center gap-3 shrink-0 border-l pl-3 ml-1">
              <Button 
                variant={apiStatus?.status === 'success' ? 'default' : apiStatus?.status === 'error' ? 'destructive' : 'secondary'} 
                size="icon" 
                className={cn("h-9 w-9 shrink-0 cursor-pointer shadow-sm", apiStatus?.status === 'success' && "bg-emerald-500 hover:bg-emerald-600 text-white")} 
                onClick={onShowStatus}
                title={apiStatus?.status === 'success' ? 'Connected' : apiStatus?.status === 'error' ? 'Connection Failed' : 'Checking...'}
              >
                  {apiStatus?.status === 'success' ? <CheckCircle2 className="h-4 w-4" /> : 
                   apiStatus?.status === 'error' ? <AlertCircle className="h-4 w-4" /> : 
                   <Loader className="h-4 w-4 animate-spin" />}
              </Button>

              <Button 
                variant="outline" 
                size="icon" 
                className="h-9 w-9 shrink-0 shadow-sm" 
                onClick={onManualVerify}
                disabled={!apiStatus || apiStatus.status === 'loading'}
                title="Refresh Status"
              >
                  <RefreshCw className={cn("h-4 w-4", apiStatus?.status === 'loading' && "animate-spin")}/>
              </Button>
            </div>
          )}
        </div>

        {selectedProfile && (
          <div className="flex items-center gap-2">
            {apiStatus && apiStatus.status === 'success' && apiStatus.fullResponse?.agentInfo && (
                <div className="flex items-center gap-4 bg-muted/40 border border-border px-3 py-1.5 rounded-md text-xs whitespace-nowrap shrink-0 shadow-sm">
                    <span className="flex items-center gap-1.5">
                        <span className="text-muted-foreground font-semibold">Agent Name:</span> 
                        <span className="font-medium text-foreground">
                            {(`${apiStatus.fullResponse.agentInfo.firstName || ''} ${apiStatus.fullResponse.agentInfo.lastName || ''}`).trim() || apiStatus.fullResponse.agentInfo.name}
                        </span>
                    </span>

                    {apiStatus.fullResponse.agentInfo.emailId && (
                        <>
                            <div className="w-px h-3 bg-border"></div>
                            <span className="flex items-center gap-1.5">
                                <span className="text-muted-foreground font-semibold">Email:</span> 
                                <span className="font-medium text-foreground">{apiStatus.fullResponse.agentInfo.emailId}</span>
                            </span>
                        </>
                    )}

                    {apiStatus.fullResponse.orgName && (
                        <>
                            <div className="w-px h-3 bg-border"></div>
                            <span className="flex items-center gap-1.5">
                                <span className="text-muted-foreground font-semibold">Organization:</span> 
                                <span className="font-medium text-foreground">{apiStatus.fullResponse.orgName}</span>
                            </span>
                        </>
                    )}

                    {apiStatus.fullResponse.portalName && (
                       <>
                          <div className="w-px h-3 bg-border"></div>
                          <span className="flex items-center gap-1.5">
                              <span className="text-muted-foreground font-semibold">Portal:</span> 
                              <span className="font-medium text-foreground">{apiStatus.fullResponse.portalName}</span>
                          </span>
                       </>
                    )}
                </div>
            )}
          </div>
        )}
      </div>
      
    </div>
  );
};