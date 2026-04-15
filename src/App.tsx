// --- FILE: src/App.tsx ---
import React, { useState, useEffect, useRef } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQueryClient, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { io, Socket } from 'socket.io-client';
import { useToast } from '@/hooks/use-toast';
import Index from "@/pages/Index";
import NotFound from "@/pages/NotFound";
import SingleTicket from "@/pages/SingleTicket";
import { ProfileModal } from '@/components/dashboard/ProfileModal';
import { useJobTimer } from '@/hooks/useJobTimer';
import ProjectsTasksPage from './pages/ProjectsTasksPage';
import LiveStats from '@/pages/LiveStats';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import SpeedTest from './pages/SpeedTest';
import { MasterControls } from '@/components/dashboard/MasterControls';

const queryClient = new QueryClient();
const SERVER_URL = "http://localhost:3000";

// --- TYPES (Desk & Projects Only) ---
export interface Profile {
  profileName: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  desk?: { orgId: string; defaultDepartmentId: string; fromEmailAddress?: string; mailReplyAddressId?: string; cloudflareTrackingUrl?: string; };
  projects?: { portalId: string; };
  imapSettings?: { email: string; password: string; host: string; }[];
}

export interface TicketFormData { emails: string; subject: string; description: string; delay: number; sendDirectReply: boolean; verifyEmail: boolean; displayName: string; stopAfterFailures: number; enableTracking: boolean; }
export interface TicketResult { email: string; success: boolean; ticketNumber?: string; details?: string; error?: string; fullResponse?: any; timestamp?: Date; }
export interface JobState { formData: TicketFormData; results: TicketResult[]; isProcessing: boolean; isPaused: boolean; isComplete: boolean; processingStartTime: Date | null; processingTime: number; totalTicketsToProcess: number; countdown: number; currentDelay: number; filterText: string; }
export interface Jobs { [profileName: string]: JobState; }

export interface ProjectsFormData { taskName: string; primaryField: string; primaryValues: string; taskDescription: string; projectId: string; tasklistId: string; delay: number; bulkDefaultData: { [key: string]: string }; emails?: string; displayName?: string; stopAfterFailures?: number; enableTracking?: boolean; appendAccountNumber?: boolean; smartSplitterText?: string; }
export interface ProjectsResult { projectName: string; success: boolean; details?: string; error?: string; fullResponse?: any; timestamp?: Date; }
export interface ProjectsJobState { formData: ProjectsFormData; results: ProjectsResult[]; isProcessing: boolean; isPaused: boolean; isComplete: boolean; processingStartTime: Date | null; processingTime: number; totalToProcess: number; countdown: number; currentDelay: number; filterText: string; }
export interface ProjectsJobs { [profileName: string]: ProjectsJobState; }

// --- INITIAL STATES ---
const createInitialJobState = (): JobState => ({ formData: { emails: '', subject: '', description: '', delay: 1, sendDirectReply: false, verifyEmail: false, displayName: '', stopAfterFailures: 4, enableTracking: false }, results: [], isProcessing: false, isPaused: false, isComplete: false, processingStartTime: null, processingTime: 0, totalTicketsToProcess: 0, countdown: 0, currentDelay: 1, filterText: '', });
const createInitialProjectsJobState = (): ProjectsJobState => ({ formData: { taskName: '', primaryField: 'name', primaryValues: '', taskDescription: '', projectId: '', tasklistId: '', delay: 1, bulkDefaultData: {}, emails: '', stopAfterFailures: 4, enableTracking: false, appendAccountNumber: false, smartSplitterText: '' }, results: [], isProcessing: false, isPaused: false, isComplete: false, processingStartTime: null, processingTime: 0, totalToProcess: 0, countdown: 0, currentDelay: 1, filterText: '' });

const MainApp = () => {
    const { toast } = useToast();
    const location = useLocation();
    
    const [jobs, setJobs] = useState<Jobs>({});
    const [projectsJobs, setProjectsJobs] = useState<ProjectsJobs>({});

    const jobsRef = useRef<Jobs>({});
    const projectsJobsRef = useRef<ProjectsJobs>({});

    useEffect(() => { jobsRef.current = jobs; }, [jobs]);
    useEffect(() => { projectsJobsRef.current = projectsJobs; }, [projectsJobs]);

    const socketRef = useRef<Socket | null>(null);
    const queryClient = useQueryClient();

    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
	
    // 🚀 THE MASTER FLEET ENGINE STATE (Added Form Data Tracking)
    const masterQueueRef = useRef<{pName: string, type: string, formData?: any}[]>([]);
    const engineModeRef = useRef<'none' | 'batch' | 'all'>('none');
    const enginePausedRef = useRef<boolean>(false);
    const isPumpingRef = useRef<boolean>(false); 
    
    const [engineModeState, setEngineModeState] = useState<'none' | 'batch' | 'all'>('none');
    const [isGlobalPaused, setIsGlobalPaused] = useState(false);
    const [pendingQueueCount, setPendingQueueCount] = useState(0);
    
    const [batchSize, setBatchSize] = useState<number>(() => Number(localStorage.getItem('zoho_batch_size')) || 5);
    const batchSizeRef = useRef(batchSize);

    useEffect(() => { 
        batchSizeRef.current = batchSize; 
        localStorage.setItem('zoho_batch_size', String(batchSize));
    }, [batchSize]);

    // 🔥 SYNC FUNCTIONS
    const setEngineModeSync = (mode: 'none' | 'batch' | 'all') => {
        engineModeRef.current = mode;
        setEngineModeState(mode);
    };

    const setEnginePausedSync = (isPaused: boolean) => {
        enginePausedRef.current = isPaused;
        setIsGlobalPaused(isPaused);
    };

    // 🚀 IDLE FORM PERSISTENCE (Saves whatever you type, even if you don't hit start)
    useEffect(() => {
        try {
            const savedDesk = JSON.parse(localStorage.getItem('zoho_desk_forms_backup') || '{}');
            if (Object.keys(savedDesk).length > 0) {
                setJobs(prev => {
                    const next = { ...prev };
                    Object.keys(savedDesk).forEach(k => {
                        if (!next[k]) next[k] = createInitialJobState();
                        next[k].formData = { ...next[k].formData, ...savedDesk[k] };
                    });
                    return next;
                });
            }
            const savedProj = JSON.parse(localStorage.getItem('zoho_proj_forms_backup') || '{}');
            if (Object.keys(savedProj).length > 0) {
                setProjectsJobs(prev => {
                    const next = { ...prev };
                    Object.keys(savedProj).forEach(k => {
                        if (!next[k]) next[k] = createInitialProjectsJobState();
                        next[k].formData = { ...next[k].formData, ...savedProj[k] };
                    });
                    return next;
                });
            }
        } catch(e) {}
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            const deskBackup: any = {};
            Object.keys(jobs).forEach(k => { if (jobs[k]?.formData) deskBackup[k] = jobs[k].formData; });
            localStorage.setItem('zoho_desk_forms_backup', JSON.stringify(deskBackup));
            
            const projBackup: any = {};
            Object.keys(projectsJobs).forEach(k => { if (projectsJobs[k]?.formData) projBackup[k] = projectsJobs[k].formData; });
            localStorage.setItem('zoho_proj_forms_backup', JSON.stringify(projBackup));
        }, 500); 
        return () => clearTimeout(timer);
    }, [jobs, projectsJobs]);

    // 🚀 QUEUE RECOVERY
    useEffect(() => {
        try {
            const savedQ = JSON.parse(localStorage.getItem('zoho_engine_queue') || '[]');
            const savedMode = localStorage.getItem('zoho_engine_mode') as 'none'|'batch'|'all' || 'none';
            
            if (savedQ.length > 0 && savedMode !== 'none') {
                masterQueueRef.current = savedQ;
                setPendingQueueCount(savedQ.length);
                setEngineModeSync(savedMode);
                setEnginePausedSync(true);
                
                setTimeout(() => toast({ 
                    title: "Queue Recovered", 
                    description: `Restored ${savedQ.length} unstarted jobs. Click 'Resume All' to continue.` 
                }), 2000);
            }
        } catch (e) {}
    }, []);

    const { data: savedProfiles = [] } = useQuery<Profile[]>({
        queryKey: ['profiles'],
        queryFn: async () => { const response = await fetch(`${SERVER_URL}/api/profiles`); return response.ok ? response.json() : []; },
        refetchOnWindowFocus: false,
    });

    useJobTimer(jobs, setJobs, 'ticket');
    useJobTimer(projectsJobs, setProjectsJobs, 'projects');
    const resultBuckets = useRef<any>({ ticket: {}, projects: {} });
    const lastNotifiedRef = useRef<Set<string>>(new Set());

    // 🛡️ CRASH PROOF EXECUTE START
    const executeStart = (pName: string, type: string, queuedFormData?: any) => {
        if (type === 'ticket') {
            const freshJob = jobsRef.current[pName];
            const targetFormData = freshJob?.formData || queuedFormData;
            if (!targetFormData) return;

            const rawEmails = targetFormData.emails || '';
            const emailStr = Array.isArray(rawEmails) ? rawEmails.join('\n') : String(rawEmails);
            if (!emailStr.trim()) return;

            const emailList = emailStr.split('\n').map((e: string) => e.trim()).filter((e: string) => e !== '');
            const safeFormData = { ...targetFormData, emails: emailStr };
            
            socketRef.current?.emit('startBulkCreate', { ...safeFormData, emails: emailList, selectedProfileName: pName });
            
            setJobs((prev: any) => {
                const existingJob = prev[pName] || createInitialJobState();
                const nextState = { ...prev, [pName]: { ...existingJob, formData: safeFormData, results: [], isProcessing: true, isPaused: false, isComplete: false, processingStartTime: new Date(), totalTicketsToProcess: emailList.length, processingTime: 0 }};
                jobsRef.current = nextState; 
                return nextState;
            });

        } else if (type === 'projects') {
            const freshJob = projectsJobsRef.current[pName];
            const targetFormData = freshJob?.formData || queuedFormData;
            if (!targetFormData) return;

            const rawValues = targetFormData.primaryValues || '';
            const valuesStr = Array.isArray(rawValues) ? rawValues.join('\n') : String(rawValues);
            if (!valuesStr.trim()) return;

            const tasksList = valuesStr.split('\n').map((e: string) => e.trim()).filter((e: string) => e !== '');
            const safeFormData = { ...targetFormData, primaryValues: valuesStr };
            
            fetch(`${SERVER_URL}/api/profiles`).then(res => res.json()).then(profiles => {
                const matchedProfile = profiles.find((p:any) => p.profileName === pName);
                const activeProfileData = matchedProfile ? { projects: { portalId: matchedProfile.projects?.portalId } } : undefined;
                socketRef.current?.emit('startBulkCreateTasks', { selectedProfileName: pName, activeProfile: activeProfileData, formData: safeFormData });
            }).catch(()=>{});

            setProjectsJobs((prev: any) => {
                const existingJob = prev[pName] || createInitialProjectsJobState();
                const nextState = { ...prev, [pName]: { ...existingJob, formData: safeFormData, results: [], isProcessing: true, isPaused: false, isComplete: false, processingStartTime: new Date(), totalToProcess: tasksList.length, processingTime: 0 }};
                projectsJobsRef.current = nextState; 
                return nextState;
            });
        }
    };

    const getActiveJobCount = () => {
        const activeDesk = Object.values(jobsRef.current).filter((j: any) => j.isProcessing && !j.isComplete).length;
        const activeProj = Object.values(projectsJobsRef.current).filter((j: any) => j.isProcessing && !j.isComplete).length;
        return activeDesk + activeProj;
    };

    const syncEngineStorage = () => {
        localStorage.setItem('zoho_engine_queue', JSON.stringify(masterQueueRef.current));
        localStorage.setItem('zoho_engine_mode', engineModeRef.current);
    };

    const pumpEngine = async () => {
        if (isPumpingRef.current) return;
        if (enginePausedRef.current || engineModeRef.current === 'none') return;
        
        isPumpingRef.current = true;

        try {
            if (engineModeRef.current === 'all') {
                while (masterQueueRef.current.length > 0 && !enginePausedRef.current) {
                    const nextJob = masterQueueRef.current.shift();
                    if (nextJob) {
                        executeStart(nextJob.pName, nextJob.type, nextJob.formData);
                        setPendingQueueCount(masterQueueRef.current.length);
                        syncEngineStorage();
                        await new Promise(res => setTimeout(res, 1000));
                    }
                }
            } else if (engineModeRef.current === 'batch') {
                while (masterQueueRef.current.length > 0 && !enginePausedRef.current) {
                    const currentActive = getActiveJobCount();
                    if (currentActive >= batchSizeRef.current) break; 

                    const nextJob = masterQueueRef.current.shift();
                    if (nextJob) {
                        executeStart(nextJob.pName, nextJob.type, nextJob.formData);
                        setPendingQueueCount(masterQueueRef.current.length);
                        syncEngineStorage();
                        await new Promise(res => setTimeout(res, 800)); 
                    }
                }
            }
        } finally {
            isPumpingRef.current = false;
        }

        if (masterQueueRef.current.length === 0 && getActiveJobCount() === 0) {
            setEngineModeSync('none');
            syncEngineStorage();
        }
    };

    useEffect(() => {
        const watchdog = setInterval(() => {
            if (enginePausedRef.current || engineModeRef.current === 'none' || isPumpingRef.current) return;
            
            if (engineModeRef.current === 'batch') {
                const activeCount = getActiveJobCount();
                if (activeCount < batchSizeRef.current && masterQueueRef.current.length > 0) {
                    pumpEngine();
                } else if (activeCount === 0 && masterQueueRef.current.length === 0) {
                    setEngineModeSync('none');
                    syncEngineStorage();
                }
            } else if (engineModeRef.current === 'all') {
                if (masterQueueRef.current.length > 0) {
                    pumpEngine();
                } else if (getActiveJobCount() === 0) {
                    setEngineModeSync('none');
                    syncEngineStorage();
                }
            }
        }, 2000);
        return () => clearInterval(watchdog);
    }, []);

    useEffect(() => {
        const pollTracker = async () => {
            try {
                const profilesRes = await fetch(`${SERVER_URL}/api/profiles`);
                const profiles = await profilesRes.json();
                const trackingUrls = new Set<string>();
                profiles.forEach((p: Profile) => {
                    if (p.desk?.cloudflareTrackingUrl) {
                        let baseUrl = p.desk.cloudflareTrackingUrl;
                        if (!baseUrl.endsWith('/api/logs')) baseUrl = baseUrl.replace(/\/$/, '') + '/api/logs';
                        trackingUrls.add(baseUrl);
                    }
                });

                for (const url of trackingUrls) {
                    try {
                        const res = await fetch(url);
                        const data = await res.json();
                        if (data.success && data.logs) {
                            data.logs.forEach((log: any) => {
                                const logId = `${log.email}_${log.openedAt}`;
                                if (!lastNotifiedRef.current.has(logId)) lastNotifiedRef.current.add(logId); 
                            });
                        }
                    } catch (e) { }
                }
            } catch (e) { }
        };

        const interval = setInterval(pollTracker, 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const socket = io(SERVER_URL);
        socketRef.current = socket;

        socket.on('connect', () => {
            toast({ title: "Connected to server!" });
            socket.emit('requestDatabaseSync'); 
        });
          
        const handleWakeUp = () => {
            if (document.visibilityState === 'visible') {
                if (!socket.connected) socket.connect();
                socket.emit('requestDatabaseSync');
            }
        };
        document.addEventListener("visibilitychange", handleWakeUp);

        const getInitialState = (type: string) => {
            switch(type) { case 'ticket': return createInitialJobState(); case 'projects': return createInitialProjectsJobState(); default: return {} as any; }
        };

        socket.on('jobStarted', ({ profileName, jobType }) => {
            const startUpdater = (prev: any) => {
                const job = prev[profileName] || getInitialState(jobType);
                return { ...prev, [profileName]: { ...job, results: [], isProcessing: true, isPaused: false, isComplete: false, processingTime: 0, processingStartTime: new Date(), countdown: job.formData?.delay || job.formData?.bulkDelay || 1 } };
            };
            if (jobType === 'ticket') setJobs(startUpdater);
            else if (jobType === 'projects') setProjectsJobs(startUpdater);
        });

        // 🛡️ CRASH PROOF DATABASE SYNC
        socket.on('databaseSync', (dbJobs: any[]) => {
            const nextJobs: any = {}; const nextProjects: any = {}; 
            resultBuckets.current = { ticket: {}, projects: {} };

            dbJobs.forEach(dbJob => {
                const pName = dbJob.profileName; const type = dbJob.jobType;
                const exactProcessingTime = dbJob.processingTime || 0;
                const safeResults = (dbJob.results || []).map((r: any) => ({ ...r, timestamp: r.timestamp ? new Date(r.timestamp) : new Date() }));
                const totalTarget = dbJob.totalToProcess || 0;
                const isActuallyDone = safeResults.length >= totalTarget && totalTarget > 0;
                const finalIsComplete = (dbJob.status === 'ended' || isActuallyDone); 
                const finalIsProcessing = (dbJob.status === 'running' || dbJob.status === 'complete') && !isActuallyDone;
                if (dbJob.status === 'running' && isActuallyDone) { socket.emit('markJobComplete', { profileName: pName, jobType: type }); }

                const safeFormData = dbJob.formData || {};
                if (Array.isArray(safeFormData.emails)) safeFormData.emails = safeFormData.emails.join('\n');
                if (Array.isArray(safeFormData.primaryValues)) safeFormData.primaryValues = safeFormData.primaryValues.join('\n');

                const stateObj = {
                    formData: safeFormData, results: safeResults, isProcessing: finalIsProcessing, isPaused: dbJob.status === 'paused', isComplete: finalIsComplete, processingStartTime: finalIsProcessing ? new Date() : null, processingTime: exactProcessingTime, totalToProcess: totalTarget, totalTicketsToProcess: totalTarget, countdown: 0, currentDelay: safeFormData?.delay || safeFormData?.bulkDelay || 1, filterText: ''
                };

                if (type === 'ticket') nextJobs[pName] = stateObj;
                else if (type === 'projects') nextProjects[pName] = stateObj;
            });

            setJobs(prev => ({ ...prev, ...nextJobs }));
            setProjectsJobs(prev => ({ ...prev, ...nextProjects }));
        });

        socket.on('jobCleared', ({ profileName, jobType }) => {
            if (jobType === 'ticket') setJobs(prev => ({ ...prev, [profileName]: createInitialJobState() }));
            else if (jobType === 'projects') setProjectsJobs(prev => ({ ...prev, [profileName]: createInitialProjectsJobState() }));
        });

        socket.on('allJobsCleared', ({ jobType }) => {
            if (jobType === 'ticket') setJobs(prev => { const next = { ...prev }; Object.keys(next).forEach(k => next[k] = createInitialJobState()); return next; });
            else if (jobType === 'projects') setProjectsJobs(prev => { const next = { ...prev }; Object.keys(next).forEach(k => next[k] = createInitialProjectsJobState()); return next; });
        });
        
        socket.on('ticketResult', (result: any) => {
            if (!resultBuckets.current.ticket[result.profileName]) resultBuckets.current.ticket[result.profileName] = [];
            resultBuckets.current.ticket[result.profileName].push({ ...result, timestamp: new Date() });
        });
        socket.on('projectsResult', (result: any) => {
            if (!resultBuckets.current.projects[result.profileName]) resultBuckets.current.projects[result.profileName] = [];
            resultBuckets.current.projects[result.profileName].push({ ...result, timestamp: new Date() });
        });

        const flushInterval = setInterval(() => {
            const flushJobs = (bucketObj: any, setFunc: any, initialBuilder: any, jobType: string, reverseOrder = false) => {
                let hasDataToFlush = false;
                for (const profile in bucketObj) { if (bucketObj[profile].length > 0) hasDataToFlush = true; }

                if (hasDataToFlush) {
                    setFunc((prevJobs: any) => {
                        const nextJobs = { ...prevJobs };
                        for (const profile in bucketObj) {
                            const newItems = bucketObj[profile];
                            if (newItems.length > 0) {
                                const profileJob = nextJobs[profile] || initialBuilder();
                                let updatedResults = [];
                                if (reverseOrder) {
                                    const mappedNewItems = newItems.map((r: any, idx: number) => ({ ...r, number: profileJob.results.length + newItems.length - idx }));
                                    updatedResults = [...mappedNewItems.reverse(), ...profileJob.results];
                                } else {
                                    updatedResults = [...profileJob.results, ...newItems];
                                }

                                const totalTarget = profileJob.totalTicketsToProcess || profileJob.totalToProcess || 0;
                                const isLast = updatedResults.length >= totalTarget && totalTarget > 0;
                                const defaultDelay = profileJob.formData?.delay || profileJob.formData?.bulkDelay || 1;
                                const justFinished = isLast && profileJob.isProcessing;

                                nextJobs[profile] = { ...profileJob, results: updatedResults, isProcessing: isLast ? false : profileJob.isProcessing, isComplete: isLast ? true : profileJob.isComplete, countdown: isLast ? 0 : defaultDelay };

                                if (justFinished) {
                                    socketRef.current?.emit('markJobComplete', { profileName: profile, jobType });
                                    setTimeout(() => toast({ title: `Processing Complete for ${profile}`, description: "All items have been processed." }), 500);
                                    
                                    if (engineModeRef.current === 'batch' && !enginePausedRef.current) setTimeout(() => pumpEngine(), 1000);
                                }
                                bucketObj[profile] = []; 
                            }
                        }
                        
                        if (jobType === 'ticket') jobsRef.current = nextJobs;
                        if (jobType === 'projects') projectsJobsRef.current = nextJobs;
                        
                        return nextJobs;
                    });
                }
            };

            flushJobs(resultBuckets.current.ticket, setJobs, createInitialJobState, 'ticket');
            flushJobs(resultBuckets.current.projects, setProjectsJobs, createInitialProjectsJobState, 'projects');

        }, 1000);

        socket.on('ticketUpdate', (updateData) => {
          setJobs(prevJobs => {
            if (!prevJobs[updateData.profileName]) return prevJobs;
            return { ...prevJobs, [updateData.profileName]: { ...prevJobs[updateData.profileName], results: prevJobs[updateData.profileName].results.map(r => String(r.ticketNumber) === String(updateData.ticketNumber) ? { ...r, success: updateData.success, details: updateData.details, fullResponse: updateData.fullResponse } : r) } }
          });
        });

        socket.on('jobPaused', (data: { profileName: string, reason: string, jobType?: string }) => {
            const type = data.jobType || 'ticket'; 
            const pauseUpdater = (prev: any) => {
                if (!prev[data.profileName]) return prev;
                return { ...prev, [data.profileName]: { ...prev[data.profileName], isPaused: true } };
            };
            if (type === 'ticket') setJobs(pauseUpdater);
            else if (type === 'projects') setProjectsJobs(pauseUpdater);
            toast({ title: "Job Paused Automatically", description: data.reason, variant: "destructive" });
        });

        const handleJobCompletion = (data: any, title: string, description: string, variant?: any, forceEnd: boolean = false) => {
            const { profileName, jobType } = data;
            let currentState: any = null; let setter: any = null;

            if (jobType === 'ticket') { currentState = jobsRef.current; setter = setJobs; }
            else if (jobType === 'projects') { currentState = projectsJobsRef.current; setter = setProjectsJobs; }

            if (!currentState || !setter) return;

            const profileJob = currentState[profileName];
            if (profileJob) {
                const totalTarget = profileJob.totalTicketsToProcess || profileJob.totalToProcess || 0;
                const currentResults = profileJob.results.length;
                if (!forceEnd && currentResults < totalTarget && totalTarget > 0) return; 
            }

            setter((prev: any) => {
                const job = prev[profileName] || getInitialState(jobType);
                const nextState = { ...prev, [profileName]: { ...job, isProcessing: false, isPaused: false, isComplete: true, countdown: 0 } };
                if (jobType === 'ticket') jobsRef.current = nextState;
                if (jobType === 'projects') projectsJobsRef.current = nextState;
                return nextState;
            });

            toast({ title, description, variant });

            if (engineModeRef.current === 'batch' && !enginePausedRef.current) setTimeout(() => pumpEngine(), 1000);
        };

        socket.on('bulkComplete', (data) => handleJobCompletion(data, `Processing Complete for ${data.profileName}!`, "All items for this profile have been processed.", undefined, false));
        socket.on('bulkEnded', (data) => handleJobCompletion(data, `Job Ended for ${data.profileName}`, "The process was stopped by the user.", "destructive", true));
        socket.on('bulkError', (data) => handleJobCompletion(data, `Server Error for ${data.profileName}`, data.message, "destructive", false));
        
        return () => {
            document.removeEventListener("visibilitychange", handleWakeUp);
            clearInterval(flushInterval); 
            socket.disconnect();
        };
    }, [toast]);
    
    const handleOpenAddProfile = () => { setEditingProfile(null); setIsProfileModalOpen(true); };
    const handleOpenEditProfile = (profile: Profile) => { setEditingProfile(profile); setIsProfileModalOpen(true); };
    const handleSaveProfile = async (profileData: Profile, originalProfileName?: string) => {
        const isEditing = !!originalProfileName;
        const url = isEditing ? `${SERVER_URL}/api/profiles/${encodeURIComponent(originalProfileName)}` : `${SERVER_URL}/api/profiles`;
        const method = isEditing ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profileData) });
            const result = await response.json();
            if (result.success) {
                toast({ title: `Profile ${isEditing ? 'updated' : 'added'} successfully!` });
                queryClient.invalidateQueries({ queryKey: ['profiles'] });
                setIsProfileModalOpen(false);
            } else toast({ title: 'Error', description: result.error, variant: 'destructive' });
        } catch (error) { toast({ title: 'Error', description: 'Failed to save profile.', variant: 'destructive' }); }
    };
    const handleDeleteProfile = async (profileNameToDelete: string) => {
        try {
            const response = await fetch(`${SERVER_URL}/api/profiles/${encodeURIComponent(profileNameToDelete)}`, { method: 'DELETE' });
            const result = await response.json();
            if (result.success) {
                toast({ title: `Profile "${profileNameToDelete}" deleted successfully!` });
                await queryClient.invalidateQueries({ queryKey: ['profiles'] });
            } else toast({ title: 'Error', description: result.error, variant: 'destructive' });
        } catch (error) { toast({ title: 'Error', description: 'Failed to delete profile.', variant: 'destructive' }); }
    };

    return (
        <>
            <Routes>
                <Route path="/" element={<Index jobs={jobs} setJobs={setJobs} socket={socketRef.current} createInitialJobState={createInitialJobState} onAddProfile={handleOpenAddProfile} onEditProfile={handleOpenEditProfile} onDeleteProfile={handleDeleteProfile} />} />
                <Route path="/single-ticket" element={<SingleTicket onAddProfile={handleOpenAddProfile} onEditProfile={handleOpenEditProfile} onDeleteProfile={handleDeleteProfile} />} />
                <Route path="/projects-tasks" element={<ProjectsTasksPage jobs={projectsJobs} setJobs={setProjectsJobs} socket={socketRef.current} createInitialJobState={createInitialProjectsJobState} onAddProfile={handleOpenAddProfile} onEditProfile={handleOpenEditProfile} onDeleteProfile={handleDeleteProfile} />} />
                <Route path="/live-stats" element={
                    <DashboardLayout onAddProfile={handleOpenAddProfile} onEditProfile={handleOpenEditProfile} onDeleteProfile={handleDeleteProfile} profiles={[]} selectedProfile={null} onProfileChange={() => {}} apiStatus={{ status: 'success', message: '' }} onShowStatus={() => {}} onManualVerify={() => {}} socket={socketRef.current} jobs={jobs}>
                        <LiveStats jobs={jobs} projectsJobs={projectsJobs} />
                    </DashboardLayout>
                } />
                <Route path="/speed-test" element={<SpeedTest />} />
                <Route path="*" element={<NotFound />} />
            </Routes>
            
            <ProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} onSave={handleSaveProfile} profile={editingProfile} socket={socketRef.current} />

            <MasterControls 
                socketRef={socketRef}
                jobsRef={jobsRef} projectsJobsRef={projectsJobsRef}
                setJobs={setJobs} setProjectsJobs={setProjectsJobs}
                engine={{
                    mode: engineModeState, setModeSync: setEngineModeSync,
                    isPaused: isGlobalPaused, setIsPausedSync: setEnginePausedSync,
                    pendingCount: pendingQueueCount, setPendingCount: setPendingQueueCount,
                    batchSize, setBatchSize,
                    queueRef: masterQueueRef, pump: pumpEngine, syncStorage: syncEngineStorage
                }}
            />

            <button onClick={() => { if (window.confirm("Force Sync with Database?")) socketRef.current?.emit('requestDatabaseSync'); }} className="fixed bottom-2 right-2 text-[10px] bg-blue-100 text-blue-800 px-2 py-1 rounded opacity-30 hover:opacity-100 z-[9999] transition-opacity"> Force DB Sync </button>
        </>
    );
};

const App = () => ( <QueryClientProvider client={queryClient}> <TooltipProvider> <BrowserRouter> <Toaster /> <Sonner /> <MainApp /> </BrowserRouter> </TooltipProvider> </QueryClientProvider> );
export default App;