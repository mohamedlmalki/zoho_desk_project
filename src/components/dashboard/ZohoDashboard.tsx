// --- FILE: src/components/dashboard/ZohoDashboard.tsx ---

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Socket } from 'socket.io-client';
import { DashboardLayout } from './DashboardLayout';
import { TicketForm } from './desk/TicketForm';
import { ResultsDisplay } from './desk/ResultsDisplay';
import { DeskApplyAllModal } from './desk/DeskApplyAllModal'; 
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Ticket, User, Building, Loader2, Download, Trash2, Radar } from 'lucide-react'; 
import { Profile, Jobs, JobState } from '@/App';

interface TicketFormData {
  emails: string;
  subject: string;
  description: string;
  delay: number;
  stopAfterFailures: number;
  sendDirectReply: boolean;
  verifyEmail: boolean;
  enableTracking: boolean;
  displayName: string;
  senderName: string;
}

type ApiStatus = {
    status: 'loading' | 'success' | 'error';
    message: string;
    fullResponse?: any;
};

interface EmailFailure {
  ticketNumber: string;
  subject: string;
  reason: string;
  errorMessage: string;
  departmentName: string;
  channel: string;
  email?: string;
  assignee: { name: string; } | null;
}

interface ZohoDashboardProps {
  jobs: Jobs;
  setJobs: React.Dispatch<React.SetStateAction<Jobs>>;
  socket: Socket | null;
  createInitialJobState: () => JobState;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

const SERVER_URL = "http://localhost:3000";

export const ZohoDashboard: React.FC<ZohoDashboardProps> = ({ jobs, setJobs, createInitialJobState, onAddProfile, onEditProfile, socket: socketProp, onDeleteProfile }) => {
  const { toast } = useToast();
  const [socket, setSocket] = useState<Socket | null>(socketProp);
  
  const [activeProfileName, setActiveProfileName] = useState<string | null>(() => {
      return localStorage.getItem('desk_activeProfile') || null;
  });
  
  const [apiStatus, setApiStatus] = useState<ApiStatus>({ status: 'loading', message: 'Connecting to server...', fullResponse: null });
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isApplyAllModalOpen, setIsApplyAllModalOpen] = useState(false); 
  
  // <--- NEW: RADAR MODAL STATE --->
  
  const [testResult, setTestResult] = useState<any>(null);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isTestVerifying, setIsTestVerifying] = useState(false);
  
  const [emailFailures, setEmailFailures] = useState<EmailFailure[]>([]);
  const [isFailuresModalOpen, setIsFailuresModalOpen] = useState(false);

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['profiles'],
    queryFn: async () => {
      const response = await fetch(`${SERVER_URL}/api/profiles`);
      if (!response.ok) throw new Error('Could not connect to the server.');
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  useEffect(() => { setSocket(socketProp); }, [socketProp]);

  useEffect(() => {
    if (profiles.length > 0) {
        const profileExists = activeProfileName && profiles.find(p => p.profileName === activeProfileName);
        
        if (!profileExists) {
            const firstProfile = profiles[0].profileName;
            setActiveProfileName(firstProfile);
            localStorage.setItem('desk_activeProfile', firstProfile);
        }

        setJobs(prevJobs => {
            const newJobs = { ...prevJobs };
            let updated = false;
            profiles.forEach(p => {
                if (!newJobs[p.profileName]) {
                    newJobs[p.profileName] = createInitialJobState();
                    updated = true;
                }
            });
            return updated ? newJobs : prevJobs;
        });
    }
  }, [profiles, activeProfileName, setJobs, createInitialJobState]);
  
  useEffect(() => {
    if (!socket) return;
    socket.on('apiStatusResult', (result) => setApiStatus({ status: result.success ? 'success' : 'error', message: result.message, fullResponse: result.fullResponse || null }));
    socket.on('testTicketResult', (result) => { setTestResult(result); setIsTestModalOpen(true); });
    socket.on('testTicketVerificationResult', (result) => { setIsTestVerifying(false); setTestResult(prev => ({ ...prev, fullResponse: { ...prev.fullResponse, verifyEmail: result.fullResponse.verifyEmail } })); toast({ title: result.success ? "Test Verification Complete" : "Test Verification Failed" }); });
    socket.on('emailFailuresResult', (result) => {
      if (result.success && Array.isArray(result.data)) {
        const formattedFailures = result.data.map((failure: any) => ({ ...failure, assignee: failure.assignee ? { name: `${failure.assignee.firstName || ''} ${failure.assignee.lastName || ''}`.trim() } : null }));
        setEmailFailures(formattedFailures); setIsFailuresModalOpen(true);
      } else if (!result.success) { toast({ title: "Error Fetching Failures", description: result.error, variant: "destructive" }); }
    });
    socket.on('clearEmailFailuresResult', (result) => { if (result.success) { toast({ title: "Success", description: "Cleared." }); setEmailFailures([]); setIsFailuresModalOpen(false); } });
    socket.on('clearTicketLogsResult', (result) => { if (result.success) { toast({ title: "Success", description: "Log cleared." }); } });
    return () => { socket.off('apiStatusResult'); socket.off('testTicketResult'); socket.off('testTicketVerificationResult'); socket.off('emailFailuresResult'); socket.off('clearEmailFailuresResult'); socket.off('clearTicketLogsResult'); };
  }, [socket, toast]);

  useEffect(() => {
    if (activeProfileName && socket?.connected) {
      setApiStatus({ status: 'loading', message: 'Checking API connection...' });
      socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'desk' });
    }
  }, [activeProfileName, socket]);

  // --- 🔥 MAGIC NUMBER INJECTION LOGIC INTACT ---
  const handleApplyAll = (masterData: Partial<TicketFormData & { appendAccountNumber?: boolean }>) => {
    let nativeNameUpdatedCount = 0;

    setJobs(prevJobs => {
      const updatedJobs = { ...prevJobs };
      
      profiles.forEach((profile, index) => {
        const pName = profile.profileName;
        
        if (masterData.displayName && masterData.displayName.trim() !== '' && socket && profile.desk?.mailReplyAddressId) {
            socket.emit('updateMailReplyAddressDetails', { 
                selectedProfileName: pName, 
                displayName: masterData.displayName 
            });
            nativeNameUpdatedCount++;
        }

        if (updatedJobs[pName]) {
          
          let finalDescription = masterData.description !== undefined 
              ? masterData.description 
              : updatedJobs[pName].formData.description;

          if (masterData.appendAccountNumber && finalDescription) {
              // I added 6 HTML breaks here, which creates 6 massive blank lines!
              finalDescription = `${finalDescription}<br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br>${index + 1}`;
          }

          updatedJobs[pName] = {
            ...updatedJobs[pName],
            formData: {
              ...updatedJobs[pName].formData,
              ...masterData,
              description: finalDescription,
              sendDirectReply: masterData.sendDirectReply !== undefined ? masterData.sendDirectReply : updatedJobs[pName].formData.sendDirectReply,
              verifyEmail: masterData.verifyEmail !== undefined ? masterData.verifyEmail : updatedJobs[pName].formData.verifyEmail,
              enableTracking: masterData.enableTracking !== undefined ? masterData.enableTracking : (updatedJobs[pName].formData as any).enableTracking
            }
          };
        }
      });
      
      return updatedJobs;
    });
    
    if (nativeNameUpdatedCount > 0) {
        toast({ title: "Bulk Update Applied", description: `Automatically updated Native Sender Name in Zoho for ${nativeNameUpdatedCount} accounts!` });
    } else {
        toast({ title: "Bulk Update Applied", description: "The fields have been copied to all accounts." });
    }
  };

  const handleFormDataChange = (newFormData: TicketFormData) => {
    if (activeProfileName) {
      setJobs(prevJobs => ({ ...prevJobs, [activeProfileName]: { ...prevJobs[activeProfileName], formData: newFormData } }));
    }
  };

  const handleFormSubmit = async (overrideEmails?: string[]) => {
    if (!socket || !activeProfileName || !jobs[activeProfileName]) return;
    
    const currentJob = jobs[activeProfileName];
    
    const emailsToProcess = overrideEmails 
        ? overrideEmails 
        : currentJob.formData.emails.split('\n').map(email => email.trim()).filter(email => email !== '');
    
    if (emailsToProcess.length === 0) { 
        toast({ title: "No Emails", variant: "destructive" }); 
        return; 
    }
    
    setJobs(prev => ({ 
        ...prev, 
        [activeProfileName]: { 
            ...prev[activeProfileName], 
            results: [], 
            isProcessing: true, 
            isPaused: false, 
            isComplete: false, 
            processingStartTime: new Date(), 
            totalTicketsToProcess: emailsToProcess.length, 
            processingTime: 0 
        } 
    }));
    
    socket.emit('startBulkCreate', { 
        ...currentJob.formData, 
        emails: emailsToProcess, 
        selectedProfileName: activeProfileName 
    });
  };

  const handleProfileChange = (profileName: string) => { 
      const profile = profiles.find(p => p.profileName === profileName); 
      if (profile) { 
          setActiveProfileName(profileName); 
          localStorage.setItem('desk_activeProfile', profileName); 
          toast({ title: "Profile Changed" }); 
      } 
  };

  const handleManualVerify = () => { if (!socket || !activeProfileName) return; setApiStatus({ status: 'loading', message: 'Checking...' }); socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'desk' }); };
  const handleSendTest = (data: any) => { if (!socket || !activeProfileName) return; setTestResult(null); setIsTestVerifying(data.verifyEmail); socket.emit('sendTestTicket', { ...data, selectedProfileName: activeProfileName, displayName: jobs[activeProfileName]?.formData.displayName }); };
  const handlePauseResume = () => { if (!socket || !activeProfileName) return; const isPaused = jobs[activeProfileName]?.isPaused; socket.emit(isPaused ? 'resumeJob' : 'pauseJob', { profileName: activeProfileName, jobType: 'ticket' }); setJobs(prev => ({ ...prev, [activeProfileName]: { ...prev[activeProfileName], isPaused: !isPaused }})); };
  const handleEndJob = () => { if (!socket || !activeProfileName) return; socket.emit('endJob', { profileName: activeProfileName, jobType: 'ticket' }); };
  const handleFetchEmailFailures = () => { if (!socket || !activeProfileName) return; socket.emit('getEmailFailures', { selectedProfileName: activeProfileName }); };
  const handleClearTicketLogs = () => { if (!socket) return; if (window.confirm("Delete all logs?")) socket.emit('clearTicketLogs'); };
  const handleExportFailures = () => { const content = emailFailures.map(f => f.email).join('\n'); const blob = new Blob([content], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "failed.txt"; document.body.appendChild(link); link.click(); document.body.removeChild(link); };
  const handleClearFailures = () => { if (!socket || !activeProfileName) return; socket.emit('clearEmailFailures', { selectedProfileName: activeProfileName }); };

  const selectedProfile = profiles.find(p => p.profileName === activeProfileName) || null;
  const currentJob = activeProfileName ? jobs[activeProfileName] : null;

  const handleRetryFailed = () => {
      if (!activeProfileName || !jobs[activeProfileName]) return;
      
      const jobToRetry = jobs[activeProfileName];
      const failedItems = jobToRetry.results.filter(r => !r.success);

      const failedEmailsList = failedItems
          .map(r => r.email)
          .filter(email => email && email.trim() !== '');
      
      if (failedEmailsList.length === 0) {
          toast({ title: "No valid failed emails found.", variant: "destructive" });
          return;
      }

      const emailsString = failedEmailsList.join('\n');

      setJobs(prev => ({
          ...prev,
          [activeProfileName]: {
              ...prev[activeProfileName],
              formData: {
                  ...prev[activeProfileName].formData,
                  emails: emailsString
              }
          }
      }));

      toast({ title: "Retrying...", description: `Restarting job for ${failedEmailsList.length} failed items.` });
      handleFormSubmit(failedEmailsList);
  };

  const runningJobProfileName = Object.keys(jobs).find(key => jobs[key].isProcessing);
  const jobForStats = runningJobProfileName ? jobs[runningJobProfileName] : currentJob;

  const stats = {
    totalTickets: jobForStats?.results.length ?? 0,
    successCount: jobForStats?.results.filter(r => r.success).length ?? 0,
    errorCount: jobForStats?.results.filter(r => !r.success).length ?? 0,
    processingTime: jobForStats?.processingTime ?? '0s',
    totalToProcess: jobForStats?.totalTicketsToProcess ?? 0,
    isProcessing: jobForStats?.isProcessing ?? false,
  };

  return (
    <>
      <DashboardLayout 
        stats={stats} 
        onAddProfile={onAddProfile}
        profiles={profiles}
        selectedProfile={selectedProfile}
        jobs={jobs}
        onProfileChange={handleProfileChange}
        apiStatus={apiStatus}
        onShowStatus={() => setIsStatusModalOpen(true)}
        onManualVerify={handleManualVerify}
        socket={socket}
        onEditProfile={onEditProfile}
        onDeleteProfile={onDeleteProfile}
      >
        <div className="space-y-8">
          
          

          {currentJob && (
            <>
              <TicketForm
                jobState={currentJob}
                formData={currentJob.formData}
                onFormDataChange={handleFormDataChange as any}
                onSubmit={() => handleFormSubmit()} 
                isProcessing={currentJob.isProcessing}
                isPaused={currentJob.isPaused}
                onPauseResume={handlePauseResume}
                onEndJob={handleEndJob}
                socket={socket} 
                selectedProfile={selectedProfile}
                onFetchFailures={handleFetchEmailFailures}
                onClearTicketLogs={handleClearTicketLogs}
                onRetryFailed={handleRetryFailed} 
                failedCount={currentJob.results.filter(r => !r.success).length}
                onApplyAllClick={() => setIsApplyAllModalOpen(true)}
              />
              <ResultsDisplay
                results={currentJob.results}
                isProcessing={currentJob.isProcessing}
                isComplete={currentJob.isComplete}
                totalTickets={currentJob.totalTicketsToProcess}
                countdown={currentJob.countdown}
                filterText={currentJob.filterText}
                onFilterTextChange={(text) => setJobs(prev => ({...prev, [activeProfileName!]: { ...prev[activeProfileName!], filterText: text }}))}
                onRetry={handleRetryFailed} 
                socket={socket}
                activeProfileName={activeProfileName}
                showDelugeColumn={false}
              />
            </>
          )}
        </div>
      </DashboardLayout>
      
      <DeskApplyAllModal 
        isOpen={isApplyAllModalOpen} 
        onClose={() => setIsApplyAllModalOpen(false)} 
        onApply={handleApplyAll} 
      />


      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>API Connection Status</DialogTitle>
            <DialogDescription>This is the live status of the connection to the Zoho Desk API for the selected profile.</DialogDescription>
          </DialogHeader>
          <div className={`p-4 rounded-md ${apiStatus.status === 'success' ? 'bg-green-100 dark:bg-green-900/50' : apiStatus.status === 'error' ? 'bg-red-100 dark:bg-red-900/50' : 'bg-muted'}`}>
            <p className="font-bold text-lg">{apiStatus.status.charAt(0).toUpperCase() + apiStatus.status.slice(1)}</p>
            <p className="text-sm text-muted-foreground mt-1">{apiStatus.message}</p>
          </div>
          {apiStatus.fullResponse && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold mb-2 text-foreground">Full Response from Server:</h4>
              <pre className="bg-muted p-4 rounded-lg text-xs font-mono text-foreground border max-h-60 overflow-y-auto">
                {JSON.stringify(apiStatus.fullResponse, null, 2)}
              </pre>
            </div>
          )}
          <Button onClick={() => setIsStatusModalOpen(false)} className="mt-4">Close</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={isTestModalOpen} onOpenChange={setIsTestModalOpen}>
        <DialogContent className="max-w-2xl bg-card border-border shadow-large">
          <DialogHeader>
            <DialogTitle>Test Ticket Response</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto space-y-4 p-1">
            {testResult?.fullResponse?.ticketCreate ? (
              <>
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-foreground">Ticket Creation Response</h4>
                  <pre className="bg-muted/50 p-4 rounded-lg text-xs font-mono text-foreground border border-border">
                    {JSON.stringify(testResult.fullResponse.ticketCreate, null, 2)}
                  </pre>
                </div>
                {testResult.fullResponse.sendReply && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-foreground">Send Reply Response</h4>
                    <pre className="bg-muted/50 p-4 rounded-lg text-xs font-mono text-foreground border border-border">
                      {JSON.stringify(testResult.fullResponse.sendReply, null, 2)}
                    </pre>
                  </div>
                )}
                {isTestVerifying && (
                  <div className="p-4 rounded-md bg-muted/50 text-center flex items-center justify-center">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin"/>
                    <span className="text-sm text-muted-foreground">Verifying email, please wait...</span>
                  </div>
                )}
                {testResult.fullResponse.verifyEmail && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-foreground">Email Verification Response</h4>
                    <pre className="bg-muted/50 p-4 rounded-lg text-xs font-mono text-foreground border border-border">
                      {JSON.stringify(testResult.fullResponse.verifyEmail, null, 2)}
                    </pre>
                  </div>
                )}
              </>
            ) : (
              <pre className="bg-muted/50 p-4 rounded-lg text-xs font-mono text-foreground border border-border">
                {JSON.stringify(testResult, null, 2)}
              </pre>
            )}
          </div>
          <Button onClick={() => setIsTestModalOpen(false)}>Close</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={isFailuresModalOpen} onOpenChange={setIsFailuresModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Email Delivery Failure Alerts ({emailFailures.length})</DialogTitle>
            <DialogDescription>Showing recent email delivery failures for the selected department.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto -mx-6 px-6">
            {emailFailures.length > 0 ? (
              <div className="space-y-4">
                {emailFailures.map((failure, index) => (
                  <div key={index} className="p-4 rounded-lg border bg-card">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <Ticket className="h-4 w-4 text-primary"/>
                        <span className="font-semibold text-foreground">Ticket #{failure.ticketNumber}:<span className="font-normal text-muted-foreground ml-2">{failure.email}</span></span>
                      </div>
                      <Badge variant="destructive">Failed</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground italic mb-3">"{failure.subject}"</p>
                    <div className="text-xs space-y-2 mb-3">
                      <div className="flex items-center">
                        <Building className="h-3 w-3 mr-2 text-muted-foreground"/>
                        <span className="text-muted-foreground mr-1">Department:</span>
                        <span className="font-medium text-foreground">{failure.departmentName}</span>
                      </div>
                      <div className="flex items-center">
                        <User className="h-3 w-3 mr-2 text-muted-foreground"/>
                        <span className="text-muted-foreground mr-1">Assignee:</span>
                        <span className="font-medium text-foreground">{failure.assignee?.name || 'Unassigned'}</span>
                      </div>
                    </div>
                    <div className="p-3 rounded-md bg-muted/50 text-xs space-y-1">
                      <p><strong className="text-foreground">Reason:</strong> {failure.reason}</p>
                      <p><strong className="text-foreground">Error:</strong> {failure.errorMessage}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="font-semibold">No Failures Found</p>
                <p className="text-sm text-muted-foreground mt-1">There are no recorded email delivery failures for this department.</p>
              </div>
            )}
          </div>
          <DialogFooter className="pt-4 border-t mt-4">
            <Button variant="outline" onClick={handleExportFailures} disabled={emailFailures.length === 0}>
              <Download className="h-4 w-4 mr-2" />Export Emails
            </Button>
            <Button variant="destructive" onClick={handleClearFailures} disabled={emailFailures.length === 0}>
              <Trash2 className="h-4 w-4 mr-2" />Clear All Failures
            </Button>
            <Button onClick={() => setIsFailuresModalOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};