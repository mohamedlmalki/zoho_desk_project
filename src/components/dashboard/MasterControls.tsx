// --- FILE: src/components/dashboard/MasterControls.tsx ---
import React, { useState } from 'react';
import { Socket } from 'socket.io-client';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'react-router-dom';

interface MasterControlsProps {
    socketRef: React.MutableRefObject<Socket | null>;
    jobsRef: React.MutableRefObject<any>;
    projectsJobsRef: React.MutableRefObject<any>;
    setJobs: React.Dispatch<React.SetStateAction<any>>;
    setProjectsJobs: React.Dispatch<React.SetStateAction<any>>;
    engine: {
        mode: 'none' | 'batch' | 'all';
        setModeSync: (mode: 'none' | 'batch' | 'all') => void;
        isPaused: boolean;
        setIsPausedSync: (paused: boolean) => void;
        pendingCount: number;
        setPendingCount: React.Dispatch<React.SetStateAction<number>>;
        batchSize: number;
        setBatchSize: React.Dispatch<React.SetStateAction<number>>;
        queueRef: React.MutableRefObject<{pName: string, type: string, formData?: any}[]>;
        pump: () => Promise<void>;
        syncStorage: () => void;
    }
}

export const MasterControls: React.FC<MasterControlsProps> = ({ 
    socketRef, jobsRef, projectsJobsRef, setJobs, setProjectsJobs, engine 
}) => {
    const { toast } = useToast();
    const location = useLocation();
    
    const [isLocked, setIsLocked] = useState(false);
    const triggerLock = () => { setIsLocked(true); setTimeout(() => setIsLocked(false), 600); };

    // Safely extracts the string regardless of whether the DB returned an Array or String
    const getSafeListString = (job: any) => {
        const val = job?.formData?.emails || job?.formData?.primaryValues || '';
        return Array.isArray(val) ? val.join('\n') : String(val);
    };

    const processState = (type: string, stateRef: React.MutableRefObject<any>, setter: React.Dispatch<React.SetStateAction<any>>, action: 'pause' | 'resume' | 'end') => {
        const currentState = stateRef.current;
        if (!currentState) return 0;
        const targets: string[] = [];

        Object.keys(currentState).forEach(pName => {
            const job = currentState[pName];
            if (!job || job.isComplete) return;
            if (action === 'pause' && job.isProcessing && !job.isPaused) targets.push(pName);
            if (action === 'resume' && job.isPaused) targets.push(pName);
            if (action === 'end' && (job.isProcessing || job.isPaused)) targets.push(pName);
        });

        if (targets.length === 0) return 0;

        targets.forEach(pName => {
            if (action === 'pause') socketRef.current?.emit('pauseJob', { profileName: pName, jobType: type });
            if (action === 'resume') socketRef.current?.emit('resumeJob', { profileName: pName, jobType: type });
            if (action === 'end') socketRef.current?.emit('endJob', { profileName: pName, jobType: type });
        });

        setter((prev: any) => {
            const next = { ...prev };
            targets.forEach(pName => {
                const job = next[pName];
                if(job) {
                    if (action === 'pause') next[pName] = { ...job, isPaused: true };
                    if (action === 'resume') next[pName] = { ...job, isPaused: false };
                    if (action === 'end') next[pName] = { ...job, isProcessing: false, isPaused: false, isComplete: true };
                }
            });
            stateRef.current = next; 
            return next;
        });

        return targets.length;
    };

    const handleStartBatch = () => {
        if (!socketRef.current || isLocked) return;
        if (engine.mode !== 'none') { toast({ title: "Engine Active", description: "Stop current job before starting a new one." }); return; }
        triggerLock();
        
        const path = location.pathname;
        const jobType = path === '/projects-tasks' ? 'projects' : 'ticket';
        const targetJobsRef = path === '/projects-tasks' ? projectsJobsRef : jobsRef;

        const profilesToQueue = Object.keys(targetJobsRef.current).filter(pName => {
            return getSafeListString(targetJobsRef.current[pName]).trim().length > 0; 
        });

        if (profilesToQueue.length === 0) { toast({ title: "Nothing to start", description: "You need to type some emails or tasks first!" }); return; }

        toast({ title: "Starting Smart Batch", description: `Queued ${profilesToQueue.length} accounts in Batch Mode.` });

        engine.queueRef.current = profilesToQueue.map(p => ({ 
            pName: p, 
            type: jobType,
            formData: targetJobsRef.current[p]?.formData
        }));
        engine.setPendingCount(engine.queueRef.current.length);
        engine.setModeSync('batch');
        engine.setIsPausedSync(false);
        engine.syncStorage();
        
        engine.pump(); 
    };

    const handleStartAll = async () => {
        if (!socketRef.current || isLocked) return;
        if (engine.mode !== 'none') { toast({ title: "Engine Active", description: "Stop current job before starting a new one." }); return; }
        triggerLock();
        
        const path = location.pathname;
        const jobType = path === '/projects-tasks' ? 'projects' : 'ticket';
        const targetJobsRef = path === '/projects-tasks' ? projectsJobsRef : jobsRef;

        const profilesToStart = Object.keys(targetJobsRef.current).filter(pName => {
            return getSafeListString(targetJobsRef.current[pName]).trim().length > 0;
        });

        if (profilesToStart.length === 0) { toast({ title: "Nothing to start" }); return; }

        toast({ title: "Starting Master Fleet", description: `Queued all ${profilesToStart.length} accounts.` });

        engine.queueRef.current = profilesToStart.map(p => ({ 
            pName: p, 
            type: jobType,
            formData: targetJobsRef.current[p]?.formData
        }));
        engine.setPendingCount(engine.queueRef.current.length);
        engine.setModeSync('all');
        engine.setIsPausedSync(false);
        engine.syncStorage();

        engine.pump(); 
    };

    const handlePauseAll = () => {
        if (!socketRef.current || isLocked) return;
        triggerLock(); 
        
        engine.setIsPausedSync(true); 
        engine.syncStorage();
        
        const deskPaused = processState('ticket', jobsRef, setJobs, 'pause');
        const projPaused = processState('projects', projectsJobsRef, setProjectsJobs, 'pause');
        const count = deskPaused + projPaused;

        toast({ title: "Engine Paused", description: `Paused ${count} active accounts. ${engine.queueRef.current.length} unstarted jobs saved in queue.` });
    };

    const handleResumeAll = () => {
        if (!socketRef.current || isLocked) return;
        triggerLock(); 
        
        engine.setIsPausedSync(false); 
        engine.syncStorage();
        
        const deskResumed = processState('ticket', jobsRef, setJobs, 'resume');
        const projResumed = processState('projects', projectsJobsRef, setProjectsJobs, 'resume');
        
        toast({ title: "Engine Resumed", description: `Resumed ${deskResumed + projResumed} paused accounts. Watchdog will restart queue.` });

        setTimeout(() => { engine.pump(); }, 500);
    };

    const handleEndAll = () => {
        if (!socketRef.current) return; 
        if (!window.confirm("Are you sure you want to completely end ALL jobs and clear the unstarted queue?")) return;
        triggerLock();
        
        engine.queueRef.current = []; 
        engine.setPendingCount(0); 
        engine.setModeSync('none');
        engine.setIsPausedSync(false);
        engine.syncStorage();
        
        const deskEnded = processState('ticket', jobsRef, setJobs, 'end');
        const projEnded = processState('projects', projectsJobsRef, setProjectsJobs, 'end');

        toast({ title: "Master Stop", description: `Ended ${deskEnded + projEnded} active jobs and cleared the remaining queue.`, variant: "destructive" });
    };

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex gap-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-3 rounded-full shadow-2xl border border-slate-200 dark:border-slate-800 z-[9999] transition-all items-center">
            <div className={`flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full mr-1 transition-opacity ${isLocked ? 'opacity-50' : 'opacity-100'}`}>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Batch Size:</span>
                <input 
                    type="number" min="1" max="34" disabled={isLocked}
                    value={engine.batchSize} 
                    onChange={(e) => engine.setBatchSize(Number(e.target.value) || 1)}
                    className="w-12 text-xs p-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-center font-bold disabled:bg-gray-200"
                />
                <button 
                    disabled={isLocked || engine.mode !== 'none'} onClick={handleStartBatch} 
                    className={`flex items-center text-xs font-bold text-white px-4 py-1.5 rounded-full shadow-sm transition-all ${(isLocked || engine.mode !== 'none') ? 'cursor-not-allowed bg-gray-400' : 'hover:scale-105'} ${engine.mode === 'batch' ? 'bg-purple-400' : 'bg-purple-600 hover:bg-purple-700'}`}
                >
                    {isLocked ? '⏳ Wait...' : (engine.mode === 'batch' ? `🔄 Batching... (${engine.pendingCount} Left)` : '✨ Start Smart Batch')}
                </button>
            </div>

            <div className="w-px h-6 bg-slate-300 dark:bg-slate-700"></div>

            <button disabled={isLocked || engine.mode !== 'none'} onClick={handleStartAll} className={`flex items-center text-xs font-bold text-white px-5 py-2.5 rounded-full shadow-md transition-all ${(isLocked || engine.mode !== 'none') ? 'opacity-50 cursor-not-allowed bg-gray-400' : 'hover:scale-105'} ${engine.mode === 'all' ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
                {isLocked ? '⏳ Wait...' : (engine.mode === 'all' ? `⏳ Running... (${engine.pendingCount} Left)` : '🚀 Start All')}
            </button>
            <button disabled={isLocked} onClick={handlePauseAll} className={`flex items-center text-xs font-bold text-white px-5 py-2.5 rounded-full shadow-md transition-all ${isLocked ? 'opacity-50 cursor-not-allowed bg-yellow-400' : 'bg-yellow-500 hover:bg-yellow-600 hover:scale-105'}`}>
                {isLocked ? '⏳ Wait...' : (engine.isPaused ? '⏸️ Paused' : '⏸️ Pause All')}
            </button>
            <button disabled={isLocked} onClick={handleResumeAll} className={`flex items-center text-xs font-bold text-white px-5 py-2.5 rounded-full shadow-md transition-all ${isLocked ? 'opacity-50 cursor-not-allowed bg-green-400' : 'bg-green-500 hover:bg-green-600 hover:scale-105'}`}>
                {isLocked ? '⏳ Wait...' : '▶️ Resume All'}
            </button>
            <button disabled={isLocked} onClick={handleEndAll} className={`flex items-center text-xs font-bold text-white px-5 py-2.5 rounded-full shadow-md transition-all ${isLocked ? 'opacity-50 cursor-not-allowed bg-red-400' : 'bg-red-500 hover:bg-red-600 hover:scale-105'}`}>
                {isLocked ? '⏳ Wait...' : '🛑 End All'}
            </button>
        </div>
    );
};