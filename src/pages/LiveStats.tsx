// --- FILE: src/pages/LiveStats.tsx ---
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom'; 
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
    Activity, CheckCircle2, AlertCircle, ExternalLink, 
    Ticket, FolderKanban, Clock 
} from 'lucide-react';
import { 
    Jobs, ProjectsJobs 
} from '@/App';
import { formatTime } from '@/lib/utils';

interface LiveStatsProps {
    jobs: Jobs;
    projectsJobs: ProjectsJobs;
}

const ServiceStatCard = ({ 
    title, 
    icon: Icon, 
    jobMap,
    route 
}: { 
    title: string, 
    icon: any, 
    jobMap: any,
    route: string 
}) => {
    const navigate = useNavigate(); 

    const activeProfiles = Object.entries(jobMap).filter(([_, job]: [string, any]) => 
        (job.results && job.results.length > 0) || job.isProcessing || job.isPaused
    );

    if (activeProfiles.length === 0) {
        return (
            <Card className="opacity-60 border-dashed">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{title}</CardTitle>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-xs text-muted-foreground italic">No active or queued jobs</div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium font-bold uppercase tracking-wider">{title}</CardTitle>
                <Icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
                {activeProfiles.map(([profileName, job]: [string, any]) => {
                    const resultsArray = job.results || [];
                    const successCount = resultsArray.filter((r: any) => r.success === true).length;
                    const failCount = resultsArray.filter((r: any) => r.success === false).length;
                    const totalProcessed = resultsArray.length;
                    const totalToProcess = job.totalToProcess || job.totalTicketsToProcess || 0;
                    const progress = totalToProcess > 0 ? (totalProcessed / totalToProcess) * 100 : 0;
                    
                    return (
                        <div key={profileName} className="space-y-2 border-b last:border-0 pb-3 last:pb-0">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Badge 
                                        variant="outline" 
                                        className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors flex items-center gap-1 group"
                                        onClick={() => navigate(route, { state: { targetProfile: profileName } })}
                                        title={`Go to ${title}`}
                                    >
                                        {profileName}
                                        <ExternalLink className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                                    </Badge>
                                    {job.isPaused && <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Paused</Badge>}
                                </div>
                                {job.isProcessing && !job.isPaused ? (
                                    <span className="flex items-center text-xs text-blue-600 font-medium animate-pulse">
                                        <Activity className="h-3 w-3 mr-1" /> Running
                                    </span>
                                ) : job.isComplete ? (
                                    <span className="flex items-center text-xs text-green-600 font-medium">
                                        <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
                                    </span>
                                ) : (
                                    <span className="text-xs text-muted-foreground">Queued / Idle</span>
                                )}
                            </div>

                            <div className="space-y-1">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>Progress</span>
                                    <span>{totalProcessed} / {totalToProcess}</span>
                                </div>
                                <Progress value={progress} className="h-1.5" />
                            </div>

                            <div className="grid grid-cols-3 gap-2 pt-1">
                                <div className="flex flex-col items-center bg-green-50/50 dark:bg-green-900/10 p-1 rounded">
                                    <span className="text-[10px] text-muted-foreground uppercase">Success</span>
                                    <span className="text-sm font-bold text-green-600">{successCount}</span>
                                </div>
                                <div className="flex flex-col items-center bg-red-50/50 dark:bg-red-900/10 p-1 rounded">
                                    <span className="text-[10px] text-muted-foreground uppercase">Failed</span>
                                    <span className="text-sm font-bold text-red-600">{failCount}</span>
                                </div>
                                <div className="flex flex-col items-center bg-muted/50 p-1 rounded">
                                    <span className="text-[10px] text-muted-foreground uppercase">CPU Time</span>
                                    <span className="text-xs font-mono font-medium mt-0.5">{formatTime(job.processingTime || 0)}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
};

export const LiveStats: React.FC<LiveStatsProps> = (props) => {
    const [clockSeconds, setClockSeconds] = useState(() => parseInt(localStorage.getItem('zoho_fleet_clock') || '0'));
    const [queueCount, setQueueCount] = useState(0);

    let activeJobCount = 0;
    let totalSuccess = 0;
    let totalErrors = 0;

    const allJobs = [props.jobs, props.projectsJobs];
    allJobs.forEach(jobMap => {
        Object.values(jobMap).forEach((job: any) => {
            if (job.results && Array.isArray(job.results)) {
                totalSuccess += job.results.filter((r: any) => r.success === true).length;
                totalErrors += job.results.filter((r: any) => r.success === false).length;
            }
            if (job.isProcessing && !job.isComplete && !job.isPaused) {
                activeJobCount++;
            }
        });
    });

    const activeCountRef = useRef(activeJobCount);
    activeCountRef.current = activeJobCount; 
    
    const queueCountRef = useRef(0);
    const wasIdleRef = useRef(activeJobCount === 0 && queueCount === 0);

    useEffect(() => {
        const interval = setInterval(() => {
            // Pull the latest queue safely
            let currentQueueCount = 0;
            try {
                const q = JSON.parse(localStorage.getItem('zoho_engine_queue') || '[]');
                currentQueueCount = q.length;
            } catch(e) {}
            queueCountRef.current = currentQueueCount;

            const isIdle = activeCountRef.current === 0 && queueCountRef.current === 0;
            const now = Date.now();
            
            let currentClock = parseInt(localStorage.getItem('zoho_fleet_clock') || '0');
            const lastTick = parseInt(localStorage.getItem('zoho_fleet_last_tick') || String(now));

            if (wasIdleRef.current && !isIdle) {
                // THE FLEET JUST WOKE UP (New Batch Started!) -> Reset Clock
                currentClock = 0;
                localStorage.setItem('zoho_fleet_clock', '0');
                localStorage.setItem('zoho_fleet_last_tick', String(now));
                setClockSeconds(0);
            } else if (!isIdle) {
                // THE FLEET IS RUNNING -> Tick up standard wall clock
                let deltaSec = Math.floor((now - lastTick) / 1000);
                if (deltaSec > 86400 || deltaSec < 0) deltaSec = 1; // Failsafe (Cap at 24 hrs)
                if (deltaSec === 0) deltaSec = 1;

                currentClock += deltaSec;
                localStorage.setItem('zoho_fleet_clock', String(currentClock));
                localStorage.setItem('zoho_fleet_last_tick', String(now));
                setClockSeconds(currentClock);
            } else {
                // IDLE -> Maintain last tick so it doesn't artificially jump when restarted
                localStorage.setItem('zoho_fleet_last_tick', String(now));
            }

            wasIdleRef.current = isIdle;
            setQueueCount(currentQueueCount); // Force UI Render
        }, 1000);
        
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="space-y-6 pb-24">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Live Statistics</h1>
                <p className="text-muted-foreground">Real-time monitoring of the Master Fleet engine across all batches.</p>
            </div>

            {/* Overview Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Fleet</CardTitle>
                        <Activity className={`h-4 w-4 ${(activeJobCount > 0 || queueCount > 0) ? 'text-blue-500 animate-spin' : 'text-muted-foreground'}`} />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {activeJobCount} <span className="text-sm font-normal text-muted-foreground">{queueCount > 0 ? `/ ${queueCount} Queued` : ''}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {queueCount > 0 ? 'Accounts in active batching' : 'Currently processing'}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Success</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{totalSuccess}</div>
                        <p className="text-xs text-muted-foreground">Records processed successfully</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Errors</CardTitle>
                        <AlertCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{totalErrors}</div>
                        <p className="text-xs text-muted-foreground">Records failed</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Time Elapsed</CardTitle>
                        <Clock className={`h-4 w-4 ${(activeJobCount > 0 || queueCount > 0) ? 'text-purple-500 animate-pulse' : 'text-muted-foreground'}`} />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatTime(clockSeconds)}</div>
                        <p className="text-xs text-muted-foreground">Wall-clock batch duration</p>
                    </CardContent>
                </Card>
            </div>

            {/* Service Grids with Routes */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <ServiceStatCard title="Zoho Desk" icon={Ticket} jobMap={props.jobs} route="/" />
                <ServiceStatCard title="Zoho Projects" icon={FolderKanban} jobMap={props.projectsJobs} route="/projects-tasks" />
            </div>
        </div>
    );
};

export default LiveStats;