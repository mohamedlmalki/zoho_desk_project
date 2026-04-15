// --- FILE: src/hooks/useJobTimer.ts ---
import { useEffect } from 'react';

export function useJobTimer(
    jobsState: any, 
    setJobsState: any
) {
    useEffect(() => {
        let lastTick = Date.now();

        const intervalId = setInterval(() => {
            const now = Date.now();
            const deltaSeconds = Math.round((now - lastTick) / 1000);

            if (deltaSeconds >= 1) {
                lastTick = now;

                setJobsState((prevState: any) => {
                    let hasChanges = false;
                    const nextState = { ...prevState };

                    Object.keys(nextState).forEach(profileName => {
                        const job = nextState[profileName];
                        
                        // 🚀 THE FIX: Removed "job.status === 'running'". React only uses isProcessing and isPaused!
                        if (job && job.isProcessing && !job.isPaused) {
                            hasChanges = true;
                            
                            nextState[profileName] = {
                                ...job,
                                processingTime: (job.processingTime || 0) + deltaSeconds,
                                countdown: Math.max(0, (job.countdown || 0) - deltaSeconds)
                            };
                        }
                    });

                    return hasChanges ? nextState : prevState;
                });
            }
        }, 1000);

        return () => clearInterval(intervalId);
    }, [setJobsState]);
}