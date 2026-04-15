// --- FILE: src/components/dashboard/projects/ProjectsTasksDashboard.tsx ---
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Socket } from 'socket.io-client';
import { useLocation } from 'react-router-dom'; 
import { DashboardLayout } from '../DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Profile } from '@/App';
import { ProjectsJobs, ProjectsJobState, ZohoProject, ZohoTask } from './ProjectsDataTypes';
import { TaskBulkForm } from './TaskBulkForm'; 
import { TaskResultsDisplay } from './TaskResultsDisplay';
import { TaskProgressTable } from './TaskProgressTable';
import { TrackingAnalytics } from '../desk/TrackingAnalytics'; 
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Trash2, Clock, CheckCircle2, XCircle, RefreshCw, Activity } from 'lucide-react'; 
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';

type ApiStatus = {
    status: 'loading' | 'success' | 'error';
    message: string;
    fullResponse?: any;
};

export interface ViewLog {
    id: string;
    timestamp: Date;
    type: 'info' | 'success' | 'error' | 'request' | 'response';
    message: string;
    details?: any;
}

export interface ProjectsDeleteJobState {
    status: 'idle' | 'deleting' | 'completed';
    totalToDelete: number;
    deletedCount: number;
    failedCount: number;
    failedIds: string[];
}

interface ProjectsTasksDashboardProps {
    jobs: ProjectsJobs;
    setJobs: React.Dispatch<React.SetStateAction<ProjectsJobs>>;
    socket: Socket | null;
    createInitialJobState: () => ProjectsJobState;
    onAddProfile: () => void;
    onEditProfile: (profile: Profile) => void;
    onDeleteProfile: (profileName: string) => void;
    title: string;
    jobType: 'projects';
    description: string;
}

const SERVER_URL = "http://localhost:3000";

const globalMemoryCache = {
    tasks: [] as ZohoTask[],
    deleteStates: {} as Record<string, ProjectsDeleteJobState>,
    viewLogsMap: {} as Record<string, ViewLog[]>, 
    taskLimit: "100",
    selectedTaskIds: new Set<string>()
};

export const ProjectsTasksDashboard: React.FC<ProjectsTasksDashboardProps> = ({ 
    socket, onAddProfile, onEditProfile, onDeleteProfile, jobs, setJobs, createInitialJobState, title, jobType, description,
}) => {
  const { toast } = useToast();
  const location = useLocation(); 
  const redirectProcessed = useRef(false); 
  
  const [activeProfileName, setActiveProfileName] = useState<string | null>(() => {
      return localStorage.getItem('zoho_projects_last_profile') || null;
  });

  const [apiStatus, setApiStatus] = useState<ApiStatus>({ status: 'loading', message: 'Connecting to server...', fullResponse: null });
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false); 
  
  const [projects, setProjects] = useState<ZohoProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [autoTaskListId, setAutoTaskListId] = useState<string | null>(null);
  const [currentProjectName, setCurrentProjectName] = useState<string>('');
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  const [taskLimit, setTaskLimit] = useState<string>(globalMemoryCache.taskLimit);
  const [viewLogsMap, setViewLogsMap] = useState<Record<string, ViewLog[]>>(globalMemoryCache.viewLogsMap);
  const [deleteStates, setDeleteStates] = useState<Record<string, ProjectsDeleteJobState>>(globalMemoryCache.deleteStates);
  const [tasks, setTasks] = useState<ZohoTask[]>(globalMemoryCache.tasks);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(globalMemoryCache.selectedTaskIds);

  const activeProfileRef = useRef(activeProfileName);
  useEffect(() => { activeProfileRef.current = activeProfileName; }, [activeProfileName]);

  useEffect(() => { globalMemoryCache.taskLimit = taskLimit; }, [taskLimit]);
  useEffect(() => { globalMemoryCache.viewLogsMap = viewLogsMap; }, [viewLogsMap]);
  useEffect(() => { globalMemoryCache.deleteStates = deleteStates; }, [deleteStates]);
  useEffect(() => { globalMemoryCache.tasks = tasks; }, [tasks]);
  useEffect(() => { globalMemoryCache.selectedTaskIds = selectedTaskIds; }, [selectedTaskIds]);

  useEffect(() => {
      if (activeProfileName) {
          localStorage.setItem('zoho_projects_last_profile', activeProfileName);
      }
  }, [activeProfileName]);

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['profiles'],
    queryFn: async () => {
      const response = await fetch(`${SERVER_URL}/api/profiles`);
      return response.ok ? response.json() : [];
    },
    refetchOnWindowFocus: false,
  });
  
  const projectsProfiles = useMemo(() => profiles.filter(p => p.projects?.portalId), [profiles]);

  useEffect(() => {
    if (projectsProfiles.length === 0) return;
    if (!redirectProcessed.current && location.state?.targetProfile) {
        const target = projectsProfiles.find(p => p.profileName === location.state.targetProfile);
        if (target) {
            setActiveProfileName(target.profileName);
            redirectProcessed.current = true;
            return;
        }
    }
    if (!activeProfileName || !projectsProfiles.find(p => p.profileName === activeProfileName)) {
      setActiveProfileName(projectsProfiles[0].profileName);
    }
  }, [projectsProfiles, activeProfileName, location.state]);
  
  const selectedProfile = projectsProfiles.find(p => p.profileName === activeProfileName) || null;
  const jobState = jobs[activeProfileName || ''] || createInitialJobState();
  const activeDeleteState = deleteStates[activeProfileName || ''] || { status: 'idle', totalToDelete: 0, deletedCount: 0, failedCount: 0, failedIds: [] };

  const handleFetchProjects = useCallback(() => {
      if (socket && activeProfileName && selectedProfile) {
        setIsDataLoading(true);
        socket.emit('getProjectsProjects', { selectedProfileName: activeProfileName });
    }
  }, [socket, activeProfileName, selectedProfile]);

  useEffect(() => { handleFetchProjects(); }, [handleFetchProjects]);

  const handleUpdateProjectName = useCallback((newName: string) => {
      if (!socket || !activeProfileName || !selectedProfile || !selectedProjectId || !newName) return;
      setIsUpdatingName(true);
      socket.emit('updateProjectDetails', { 
          selectedProfileName: activeProfileName, portalId: selectedProfile.projects?.portalId, projectId: selectedProjectId, payload: { name: newName }
      }); 
  }, [socket, activeProfileName, selectedProfile, selectedProjectId]); 

  const fetchTasks = useCallback(() => {
      if (socket && activeProfileName && selectedProjectId && selectedProfile) {
        setIsDataLoading(true);
        setViewLogsMap(prev => ({ ...prev, [activeProfileName]: [] })); 
        setTasks([]); 
        socket.emit('getProjectsTasks', { selectedProfileName: activeProfileName, queryParams: { project_id: selectedProjectId, limit: taskLimit } });
      } else {
          setTasks([]);
          setIsDataLoading(false);
      }
  }, [socket, activeProfileName, selectedProjectId, selectedProfile, taskLimit]);

  const prevConfig = useRef({ project: selectedProjectId, limit: taskLimit });

  useEffect(() => { 
      if (!selectedProjectId) return;
      const isProjectChanged = prevConfig.current.project !== selectedProjectId;
      const isLimitChanged = prevConfig.current.limit !== taskLimit;

      if (tasks.length === 0 || isProjectChanged || isLimitChanged) {
          fetchTasks(); 
      }
      prevConfig.current = { project: selectedProjectId, limit: taskLimit };
  }, [fetchTasks, selectedProjectId, taskLimit, tasks.length]);

  useEffect(() => {
    if (!socket) return;

    const handleApiStatus = (result: { success: boolean, message: string, fullResponse?: any }) => setApiStatus({ status: result.success ? 'success' : 'error', message: result.message, fullResponse: result.fullResponse || null });
    const handleProjectsResult = (result: { success: boolean, data: ZohoProject[], error?: string }) => {
        setIsDataLoading(false);
        if (result.success) {
            setProjects(result.data);
            if (result.data.length > 0) {
                if (!selectedProjectId || !result.data.find(p => p.id === selectedProjectId)) setSelectedProjectId(result.data[0].id);
            } else { setSelectedProjectId(null); }
        } else {
            setProjects([]); setSelectedProjectId(null);
            toast({ title: "Error Fetching Projects", description: result.error, variant: 'destructive' });
        }
    };
    const handleTasksResult = (result: { success: boolean, data: ZohoTask[], error?: string }) => {
        setIsDataLoading(false);
        if (result.success) {
            setTasks(result.data);
            if (result.data.length > 0 && result.data[0].tasklist?.id) setAutoTaskListId(result.data[0].tasklist.id);
            else setAutoTaskListId(null); 
        } else {
            setTasks([]); setAutoTaskListId(null);
        }
    };

    const handleTasksLog = (log: Omit<ViewLog, 'id' | 'timestamp'>) => {
        const currentProfile = activeProfileRef.current;
        if (!currentProfile) return;
        setViewLogsMap(prev => {
            const existingLogs = prev[currentProfile] || [];
            return { ...prev, [currentProfile]: [{ ...log, id: Math.random().toString(), timestamp: new Date() }, ...existingLogs] };
        });
    };

    const handleDeleteStarted = (data: { total: number, profileName: string }) => {
        setDeleteStates(prev => ({ ...prev, [data.profileName]: { status: 'deleting', totalToDelete: data.total, deletedCount: 0, failedCount: 0, failedIds: [] } }));
        toast({ title: "Background Deletion Initiated", description: `Queued ${data.total} tasks.` });
    };

    const handleDeleteResult = (data: { success: boolean, taskId: string, profileName: string }) => {
        setDeleteStates(prev => {
            const st = prev[data.profileName];
            if (!st) return prev;
            return {
                ...prev, [data.profileName]: {
                    ...st,
                    deletedCount: data.success ? st.deletedCount + 1 : st.deletedCount,
                    failedCount: data.success ? st.failedCount : st.failedCount + 1,
                    failedIds: data.success ? st.failedIds : [...st.failedIds, data.taskId]
                }
            };
        });
    };

    const handleDeleteComplete = (data: { profileName: string }) => {
        setDeleteStates(prev => ({ ...prev, [data.profileName]: { ...prev[data.profileName], status: 'completed' } }));
        toast({ title: "Deletion Cycle Completed!" });
        if (activeProfileName === data.profileName) fetchTasks(); 
    };

    const handleUpdateProjectResult = (result: { success: boolean, data: ZohoProject, error?: string }) => {
        setIsUpdatingName(false);
        if (result.success) { setCurrentProjectName(result.data.name); toast({ title: "Project Updated!"}); handleFetchProjects(); } 
        else { toast({ title: "Error", description: result.error, variant: "destructive" }); }
    };
    const handleUpdateProjectError = (e: { error: string }) => { setIsUpdatingName(false); toast({ title: "Error", description: e.error, variant: "destructive" }); };
    const handleBulkError = (e: { message: string }) => { if (isUpdatingName) { setIsUpdatingName(false); toast({ title: "Error", description: e.message, variant: "destructive" }); } };
    const handleJobPaused = (data: { profileName: string, reason: string }) => { setJobs((prev: any) => ({ ...prev, [data.profileName]: { ...prev[data.profileName], isPaused: true } })); toast({ title: "Paused", description: data.reason, variant: "destructive" }); };
    const handleBulkCompleteAction = (data: { profileName: string, jobType: string }) => { if (data.jobType === 'projects') setJobs((prev: any) => ({ ...prev, [data.profileName]: { ...prev[data.profileName], isProcessing: false, isPaused: false, isComplete: true } })); };
    const handleBulkEnded = (data: { profileName: string, jobType: string }) => { if (data.jobType === 'projects') setJobs((prev: any) => ({ ...prev, [data.profileName]: { ...prev[data.profileName], isProcessing: false, isPaused: false } })); };

    socket.on('apiStatusResult', handleApiStatus);
    socket.on('projectsProjectsResult', handleProjectsResult); 
    socket.on('projectsTasksResult', handleTasksResult);       
    socket.on('projectsTasksLog', handleTasksLog);       
    socket.on('projectsDeleteStarted', handleDeleteStarted);
    socket.on('projectsDeleteResult', handleDeleteResult);
    socket.on('bulkDeleteComplete', handleDeleteComplete);
    socket.on('projectsUpdateProjectResult', handleUpdateProjectResult);
    socket.on('projectsUpdateProjectError', handleUpdateProjectError);
    socket.on('bulkError', handleBulkError);
    socket.on('jobPaused', handleJobPaused);
    socket.on('bulkComplete', handleBulkCompleteAction);
    socket.on('bulkEnded', handleBulkEnded);

    return () => {
      socket.off('apiStatusResult', handleApiStatus);
      socket.off('projectsProjectsResult', handleProjectsResult);
      socket.off('projectsTasksResult', handleTasksResult);
      socket.off('projectsTasksLog', handleTasksLog);
      socket.off('projectsDeleteStarted', handleDeleteStarted);
      socket.off('projectsDeleteResult', handleDeleteResult);
      socket.off('bulkDeleteComplete', handleDeleteComplete);
      socket.off('projectsUpdateProjectResult', handleUpdateProjectResult);
      socket.off('projectsUpdateProjectError', handleUpdateProjectError);
      socket.off('bulkError', handleBulkError);
      socket.off('jobPaused', handleJobPaused);
      socket.off('bulkComplete', handleBulkCompleteAction);
      socket.off('bulkEnded', handleBulkEnded);
    };
  }, [socket, toast, selectedProjectId, handleFetchProjects, isUpdatingName, setJobs, activeProfileName, fetchTasks]); 

  useEffect(() => {
    if (selectedProjectId && projects.length > 0) {
        const project = projects.find(p => p.id === selectedProjectId);
        if (project) setCurrentProjectName(project.name);
    } else setCurrentProjectName('');
  }, [selectedProjectId, projects]);

  useEffect(() => {
    if (activeProfileName && socket?.connected) {
      setApiStatus({ status: 'loading', message: 'Checking API connection...' });
      socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'projects' });
    }
  }, [activeProfileName, socket]);

  const handleProfileChange = (profileName: string) => {
    const profile = profiles.find(p => p.profileName === profileName);
    if (profile) {
      setActiveProfileName(profileName);
      setSelectedProjectId(null); setTasks([]); setAutoTaskListId(null);
      setSelectedTaskIds(new Set()); 
      toast({ title: "Profile Changed", description: `Switched to ${profileName}` });
    }
  };
  
  const handleManualVerify = () => {
    if (!socket || !activeProfileName) return;
    setApiStatus({ status: 'loading', message: 'Checking API connection...', fullResponse: null });
    socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'projects' });
    toast({ title: "Re-checking Connection..." });
  };
  
  const stats = useMemo(() => ({
    totalTickets: jobState.results.length,
    successCount: jobState.results.filter(r => r.success).length,
    errorCount: jobState.results.filter(r => !r.success).length,
    processingTime: jobState.processingTime.toFixed(1) + 's',
    totalToProcess: jobState.totalToProcess,
    isProcessing: jobState.isProcessing,
    extraMetrics: [
        { label: "Tasks Found", value: tasks.length },
        { label: "Active Project", value: selectedProjectId ? projects.find(p => p.id === selectedProjectId)?.name || "N/A" : "None" }
    ]
  }), [jobState, tasks.length, selectedProjectId, projects]);

  const handleStartDeleteAll = () => {
      if (!selectedProjectId || !selectedProfile) return;
      if (confirm("⚠️ DANGER ⚠️\nAre you sure you want to delete ALL tasks in this project? This process runs in the background and takes time due to API rate limits.")) {
          socket?.emit('startBulkDeleteTasks', {
              activeProfile: selectedProfile, selectedProfileName: activeProfileName, portalId: selectedProfile?.projects?.portalId, projectId: selectedProjectId, deleteAll: true
          });
      }
  };

  const handleDismissDeleteBanner = () => {
      if (activeProfileName) {
          setDeleteStates(prev => ({ ...prev, [activeProfileName]: { ...prev[activeProfileName], status: 'idle' } }));
      }
  };

  const remainingItems = activeDeleteState.totalToDelete - (activeDeleteState.deletedCount + activeDeleteState.failedCount);
  const estimatedSecondsLeft = Math.ceil(remainingItems * 1.0); 
  const timeString = estimatedSecondsLeft > 60 ? `${Math.floor(estimatedSecondsLeft / 60)}m ${estimatedSecondsLeft % 60}s` : `${estimatedSecondsLeft}s`;

  const currentIsolatedLogs = viewLogsMap[activeProfileName || ''] || [];

  return (
    <>
      <DashboardLayout 
        stats={stats} onAddProfile={onAddProfile} profiles={projectsProfiles} selectedProfile={selectedProfile} jobs={jobs} onProfileChange={handleProfileChange}
        apiStatus={apiStatus} onShowStatus={() => setIsStatusModalOpen(true)} onManualVerify={handleManualVerify} socket={socket} onEditProfile={onEditProfile} onDeleteProfile={onDeleteProfile} service={jobType}
      >
        <div className="space-y-6">
            
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
                <Button 
                    variant="outline" 
                    onClick={() => setIsAnalyticsOpen(true)} 
                    className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                >
                    <Activity className="w-4 h-4 mr-2" /> Live Analytics
                </Button>
            </div>
            
            {selectedProfile && (
                <Tabs defaultValue="bulk-create">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="bulk-create">Bulk Create Tasks</TabsTrigger>
                        <TabsTrigger value="view">View & Bulk Delete</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="bulk-create">
                        <div className="space-y-6">
                            
                            <TaskBulkForm
                                selectedProfileName={activeProfileName} 
                                projects={projects} 
                                socket={socket} 
                                jobState={jobState} 
                                setJobs={setJobs}
                                createInitialJobState={createInitialJobState} 
                                autoTaskListId={autoTaskListId} 
                                selectedProjectId={selectedProjectId}
                                currentProjectName={currentProjectName} 
                                setCurrentProjectName={setCurrentProjectName} 
                                isUpdatingName={isUpdatingName} 
                                handleUpdateProjectName={handleUpdateProjectName}
                                profiles={projectsProfiles} // 🚨 PASSED PROFILES
                            />
                            <TaskProgressTable 
                                results={jobState.results} isProcessing={jobState.isProcessing} isComplete={jobState.isComplete} totalToProcess={jobState.totalToProcess} countdown={jobState.countdown}
                                filterText={jobState.filterText} onFilterTextChange={(text) => { setJobs((prev) => ({ ...prev, [activeProfileName!]: { ...prev[activeProfileName!], filterText: text } })); }}
                                onRetry={() => {}}
                            />
                        </div>
                    </TabsContent>
                    
                    <TabsContent value="view">
                        <div className="space-y-4 mb-4 p-4 border rounded-xl bg-card shadow-sm">
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
                                    <Label className="whitespace-nowrap font-semibold">Max API Fetch Limit:</Label>
                                    <Select value={taskLimit} onValueChange={(val) => setTaskLimit(val)}>
                                        <SelectTrigger className="w-[120px] bg-background">
                                            <SelectValue placeholder="100" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="100">100</SelectItem>
                                            <SelectItem value="250">250</SelectItem>
                                            <SelectItem value="500">500</SelectItem>
                                            <SelectItem value="1000">1000</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    
                                    <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={fetchTasks}
                                        disabled={isDataLoading || !selectedProjectId}
                                        className="font-semibold text-blue-600 border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                    >
                                        <RefreshCw className={`h-4 w-4 mr-2 ${isDataLoading ? 'animate-spin' : ''}`} /> 
                                        Force Refresh
                                    </Button>
                                </div>
                                <div className="w-full sm:w-auto text-right">
                                    <Button variant="destructive" onClick={handleStartDeleteAll} disabled={activeDeleteState.status === 'deleting' || !selectedProjectId} className="shadow-sm w-full sm:w-auto">
                                        <Trash2 className="w-4 h-4 mr-2" /> Delete ALL Tasks in Project
                                    </Button>
                                </div>
                            </div>

                            {(activeDeleteState.status === 'deleting' || activeDeleteState.status === 'completed') && (
                                <div className={`space-y-3 mt-4 p-4 border rounded-lg shadow-inner ${
                                    activeDeleteState.status === 'completed' 
                                        ? 'bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900' 
                                        : 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
                                }`}>
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between font-bold gap-2">
                                        <div className={`flex items-center text-lg ${activeDeleteState.status === 'completed' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                                            {activeDeleteState.status === 'deleting' ? (
                                                <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Deleting Tasks...</>
                                            ) : (
                                                <><CheckCircle2 className="w-6 h-6 mr-3" /> Deletion Complete!</>
                                            )}
                                        </div>
                                        
                                        {activeDeleteState.status === 'deleting' ? (
                                            <div className="flex items-center bg-red-100 dark:bg-red-900/50 px-3 py-1 rounded-full text-red-700 dark:text-red-400 text-sm">
                                                <Clock className="w-4 h-4 mr-2 opacity-70" /> Est. Time Left: {timeString}
                                            </div>
                                        ) : (
                                            <Button onClick={handleDismissDeleteBanner} variant="outline" size="sm" className="bg-background">
                                                Dismiss
                                            </Button>
                                        )}
                                    </div>
                                    
                                    {activeDeleteState.status === 'deleting' && (
                                        <Progress value={activeDeleteState.totalToDelete > 0 ? ((activeDeleteState.deletedCount + activeDeleteState.failedCount) / activeDeleteState.totalToDelete) * 100 : 0} className="h-3 bg-red-100 dark:bg-red-900/40 [&>div]:bg-red-600" />
                                    )}

                                    <div className="flex flex-wrap gap-6 mt-2 bg-white dark:bg-black/20 p-3 rounded-md border">
                                        <div className="flex items-center">
                                            <CheckCircle2 className="w-5 h-5 text-green-500 mr-2" />
                                            <span className="font-semibold text-green-700 dark:text-green-400">{activeDeleteState.deletedCount} Successfully Deleted</span>
                                        </div>
                                        <div className="flex items-center">
                                            <XCircle className="w-5 h-5 text-red-500 mr-2" />
                                            <span className="font-semibold text-red-700 dark:text-red-400">{activeDeleteState.failedCount} Failed or Locked</span>
                                        </div>
                                        <div className="ml-auto text-muted-foreground font-medium flex items-center">
                                            Total Target: {activeDeleteState.totalToDelete}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <TaskResultsDisplay 
                            tasks={tasks} projects={projects} selectedProjectId={selectedProjectId} setSelectedProjectId={setSelectedProjectId} fetchTasks={fetchTasks} 
                            viewLogs={currentIsolatedLogs}
                            selectedTaskIds={selectedTaskIds} setSelectedTaskIds={setSelectedTaskIds}
                            onDeleteSelected={(taskIdsArray) => {
                                socket?.emit('startBulkDeleteTasks', {
                                    activeProfile: selectedProfile, selectedProfileName: activeProfileName, portalId: selectedProfile?.projects?.portalId, projectId: selectedProjectId, taskIds: taskIdsArray, deleteAll: false
                                });
                            }}
                        />
                    </TabsContent>
                </Tabs>
            )}
        </div>
      </DashboardLayout>
      
      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader><DialogTitle>API Connection Status</DialogTitle></DialogHeader>
            
            <div className={`p-4 rounded-md shrink-0 ${apiStatus.status === 'success' ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}>
                <p className="font-bold text-lg">{apiStatus.status.toUpperCase()}</p>
                <p className="text-sm mt-1">{apiStatus.message}</p>
            </div>

            {apiStatus.fullResponse && (
                <div className="mt-4 flex-1 min-h-0 flex flex-col">
                    <p className="text-sm font-semibold mb-2 shrink-0">Full Response from Server:</p>
                    <div className="bg-zinc-950 p-4 rounded-md border text-zinc-300 font-mono text-xs overflow-auto flex-1 shadow-inner">
                        <pre>{JSON.stringify(apiStatus.fullResponse, null, 2)}</pre>
                    </div>
                </div>
            )}
        </DialogContent>
      </Dialog>

      <TrackingAnalytics 
          isOpen={isAnalyticsOpen} 
          onClose={() => setIsAnalyticsOpen(false)} 
          trackingUrl={(selectedProfile as any)?.projects?.cloudflareTrackingUrl || ''}
          profileName={activeProfileName || ''} 
      />
    </>
  );
};