// --- FILE: src/components/dashboard/desk/TicketForm.tsx ---

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
    Send, Eye, Mail, Clock, MessageSquare, Users, Pause, Play, Square, 
    Bot, Upload, RefreshCw, Trash2, MailWarning, CheckCircle2, 
    XCircle, ImagePlus, AlertTriangle, RotateCcw, Sparkles, Edit, 
    BarChart3, CopyCheck 
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Socket } from 'socket.io-client';
import { Profile, JobState } from '@/App';
import { formatTime } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { TrackingAnalytics } from './TrackingAnalytics';

export interface TicketFormData {
  emails: string | string[]; 
  subject: string;
  description: string;
  delay: number;
  sendDirectReply: boolean;
  verifyEmail: boolean;
  displayName: string;
  stopAfterFailures: number; 
  senderName: string; 
  enableTracking: boolean; 
}

interface TicketFormProps {
  onSubmit: () => void;
  isProcessing: boolean;
  isPaused: boolean;
  onPauseResume: () => void;
  onEndJob: () => void;
  formData: TicketFormData;
  onFormDataChange: (data: TicketFormData) => void;
  socket: Socket | null;
  selectedProfile: Profile | null;
  onFetchFailures: () => void;
  onClearTicketLogs: () => void;
  jobState: JobState | null;
  onRetryFailed: () => void;
  failedCount: number;
  onApplyAllClick: () => void;
}

const ImageToolDialog = ({ onApply }: { onApply: (html: string) => void }) => {
    const [imageUrl, setImageUrl] = useState('');
    const [altText, setAltText] = useState('');
    const [linkUrl, setLinkUrl] = useState('');
    const [width, setWidth] = useState('80');
    const [maxWidth, setMaxWidth] = useState('500');
    const [alignment, setAlignment] = useState('center');
    const [isOpen, setIsOpen] = useState(false);
    const handleApply = () => {
        let style = `width: ${width}%; max-width: ${maxWidth}px; height: auto; border: 1px solid #dddddd; margin-top: 10px; margin-bottom: 10px;`;
        let imgTag = `<img src="${imageUrl}" alt="${altText}" style="${style}" />`;
        if (linkUrl) imgTag = `<a href="${linkUrl}">${imgTag}</a>`;
        const containerStyle = `text-align: ${alignment};`;
        onApply(`<div style="${containerStyle}">${imgTag}</div>`);
        setIsOpen(false);
    };
    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild><Button variant="ghost" size="sm" className="h-7 px-2 text-xs"><ImagePlus className="h-3 w-3 mr-1" />Add Image</Button></DialogTrigger>
            <DialogContent className="sm:max-w-[600px]"><DialogHeader><DialogTitle>Add and Style Image</DialogTitle></DialogHeader><div className="grid gap-4 py-4"><div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="imageUrl" className="text-right">Image URL</Label><Input id="imageUrl" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="col-span-3" placeholder="https://example.com/image.png" /></div>{imageUrl && (<div className="col-span-4 flex justify-center p-4 bg-muted rounded-md"><img src={imageUrl} alt="Preview" className="max-w-full max-h-48" /></div>)}<div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="altText" className="text-right">Alt Text</Label><Input id="altText" value={altText} onChange={(e) => setAltText(e.target.value)} className="col-span-3" placeholder="Description of the image" /></div><div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="linkUrl" className="text-right">Link URL</Label><Input id="linkUrl" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="col-span-3" placeholder="(Optional) Make image clickable" /></div><div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="width" className="text-right">Width (%)</Label><Input id="width" type="number" value={width} onChange={(e) => setWidth(e.target.value)} className="col-span-3" /></div><div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="maxWidth" className="text-right">Max Width (px)</Label><Input id="maxWidth" type="number" value={maxWidth} onChange={(e) => setMaxWidth(e.target.value)} className="col-span-3" /></div><div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="alignment" className="text-right">Alignment</Label><Select value={alignment} onValueChange={setAlignment}><SelectTrigger className="col-span-3"><SelectValue placeholder="Select alignment" /></SelectTrigger><SelectContent><SelectItem value="left">Left</SelectItem><SelectItem value="center">Center</SelectItem><SelectItem value="right">Right</SelectItem></SelectContent></Select></div></div><Button onClick={handleApply} disabled={!imageUrl}>Apply and Insert</Button></DialogContent></Dialog>
    );
};

export const TicketForm: React.FC<TicketFormProps> = ({
  onSubmit, isProcessing, isPaused, onPauseResume, onEndJob,
  formData, onFormDataChange, socket, selectedProfile, onFetchFailures,
  onClearTicketLogs, jobState, onRetryFailed, failedCount, onApplyAllClick
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [isLoadingName, setIsLoadingName] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false); 
  
  // 🚨 SAFETY NET 1: If data is suddenly cleared by wiping history, wait for refresh
  if (!formData) {
      return (
          <div className="flex justify-center items-center p-12 text-muted-foreground animate-pulse border border-dashed rounded-lg bg-muted/20">
              Refreshing workspace...
          </div>
      );
  }

  useEffect(() => {
    if (formData && formData.stopAfterFailures === undefined) {
        onFormDataChange({ ...formData, stopAfterFailures: 4 });
    }
  }, []);

  // 🚨 SAFETY NET 2: Bulletproof email parsing
  const currentEmailsStr = useMemo(() => {
    if (!formData) return '';
    if (typeof formData.emails === 'string') return formData.emails;
    if (Array.isArray(formData.emails)) return formData.emails.join('\n');
    return '';
  }, [formData]);

  const handleCleanEmails = () => {
      if (!currentEmailsStr) return;
      const raw = currentEmailsStr;
      const split = raw.split(/[\n,;]+/);
      const validEmails = new Set<string>();
      const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
      
      split.forEach(entry => {
          const match = entry.match(emailRegex);
          if (match && match[0]) {
              validEmails.add(match[0].toLowerCase().trim());
          }
      });

      const cleanedList = Array.from(validEmails).join('\n');
      onFormDataChange({ ...formData, emails: cleanedList });
      
      const count = validEmails.size;
      const originalCount = split.filter(s => s.trim()).length;
      toast({ title: "List Cleaned", description: `Removed duplicates & formatting. ${count} valid emails remain (was ${originalCount}).` });
  };

  const fetchDisplayName = () => {
      if (selectedProfile?.desk?.mailReplyAddressId && socket) {
          setIsLoadingName(true);
          socket.emit('getMailReplyAddressDetails', { selectedProfileName: selectedProfile.profileName });
      } else {
          onFormDataChange({ ...formData, displayName: 'N/A' });
      }
  };

  useEffect(() => { if (selectedProfile && socket) fetchDisplayName(); }, [selectedProfile, socket]);
  
  useEffect(() => {
    if (!socket) return;
    const handleDetailsResult = (result: any) => {
        setIsLoadingName(false);
        if (result.success) {
            const name = result.notConfigured ? 'N/A' : (result.data?.displayName || result.data?.data?.displayName || '');
            onFormDataChange({ ...formData, displayName: name });
        } else {
            toast({ title: "Error Fetching Sender Name", description: result.error, variant: "destructive" });
        }
    };
    socket.on('mailReplyAddressDetailsResult', handleDetailsResult);
    return () => { socket.off('mailReplyAddressDetailsResult', handleDetailsResult); };
  }, [socket, toast, onFormDataChange, formData]);

  const handleUpdateName = () => {
      if (selectedProfile?.desk?.mailReplyAddressId && socket) {
          socket.emit('updateMailReplyAddressDetails', { selectedProfileName: selectedProfile.profileName, displayName: formData.displayName });
           toast({ title: "Success", description: "Sender name has been updated." });
      }
  };

  const emailCount = useMemo(() => {
      return currentEmailsStr.split('\n').filter(email => email.trim() !== '').length;
  }, [currentEmailsStr]);

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSubmit(); };
  
  const handleInputChange = (field: keyof Omit<TicketFormData, 'sendDirectReply' | 'verifyEmail' | 'enableTracking'>, value: string | number) => { 
      onFormDataChange({ ...formData, [field]: value }); 
  };
  
  const handleCheckboxChange = (field: 'sendDirectReply' | 'verifyEmail' | 'enableTracking', checked: boolean) => { 
      const newData = { ...formData, [field]: checked };
      
      if (field === 'sendDirectReply' && checked) newData.verifyEmail = false;
      if (field === 'verifyEmail' && checked) newData.sendDirectReply = false;
      
      onFormDataChange(newData); 
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const emails = content.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi) || [];
        onFormDataChange({ ...formData, emails: emails.join('\n') });
      };
      reader.readAsText(file);
    }
  };

  const handleApplyImage = (html: string) => { 
      const currentDesc = typeof formData.description === 'string' ? formData.description : '';
      onFormDataChange({ ...formData, description: currentDesc + '\n' + html }); 
  };

  // 🚨 SAFETY NET 3: Safely count results even if jobState is cleared out
  const successCount = (jobState?.results || []).filter(r => r.success).length;
  const errorCount = (jobState?.results || []).filter(r => !r.success).length;

  return (
    <>
      <Card className="shadow-medium hover:shadow-large transition-all duration-300">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2 text-lg">
                <Send className="h-5 w-5 text-primary" />
                <span>Create Bulk Tickets</span>
              </CardTitle>
            </div>
            <div className="flex items-center space-x-2 flex-wrap gap-y-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onApplyAllClick}
                className="bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 hover:text-purple-800 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800"
              >
                  <CopyCheck className="h-4 w-4 mr-2" />
                  Apply to All
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsAnalyticsOpen(true)}
                className="bg-blue-50/50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800"
              >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Live Analytics
              </Button>
              <Button variant="outline" size="sm" onClick={onClearTicketLogs}>
                  <Trash2 className="h-4 w-4 mr-2"/>
                  Clear Logs
              </Button>
              <Button variant="outline" size="sm" onClick={onFetchFailures}>
                  <MailWarning className="h-4 w-4 mr-2"/>
                  Failures
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="emails" className="flex items-center space-x-2">
                      <Mail className="h-4 w-4" />
                      <span>Recipient Emails</span>
                    </Label>
                    <div className='flex items-center space-x-2'>
                      <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                          onClick={handleCleanEmails}
                          disabled={isProcessing || !currentEmailsStr}
                          title="Remove duplicates and fix formatting"
                      >
                          <Sparkles className="h-3 w-3 mr-1" />
                          Clean List
                      </Button>
                      <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.txt" onChange={handleFileImport} />
                      <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
                        <Upload className="h-3 w-3 mr-2" />
                        Import
                      </Button>
                      <Badge variant="secondary" className="text-xs">
                        <Users className="h-3 w-3 mr-1" />
                        {emailCount}
                      </Badge>
                    </div>
                  </div>
                  
                  <Textarea
                    id="emails"
                    placeholder="user1@example.com&#10;user2@example.com"
                    value={currentEmailsStr}
                    onChange={(e) => handleInputChange('emails', e.target.value)}
                    className="min-h-[200px] font-mono text-sm bg-muted/30 border-border focus:bg-card transition-colors"
                    required
                    disabled={isProcessing}
                  />
                  
                  {jobState && (jobState.isProcessing || (jobState.results && jobState.results.length > 0)) && (
                      <div className="pt-4 border-t border-dashed">
                          <div className="grid grid-cols-4 gap-4 text-center">
                              <div><Label className="text-xs text-muted-foreground">Time Elapsed</Label><p className="text-lg font-bold font-mono">{formatTime(jobState.processingTime || 0)}</p></div>
                              <div><Label className="text-xs text-muted-foreground">Success</Label><p className="text-lg font-bold font-mono text-success flex items-center justify-center space-x-1"><CheckCircle2 className="h-4 w-4" /><span>{successCount}</span></p></div>
                              <div><Label className="text-xs text-muted-foreground">Failed</Label><p className="text-lg font-bold font-mono text-destructive flex items-center justify-center space-x-1"><XCircle className="h-4 w-4" /><span>{errorCount}</span></p></div>
                              <div><Label className="text-xs text-muted-foreground">Remaining</Label><p className="text-lg font-bold font-mono text-muted-foreground flex items-center justify-center space-x-1"><Clock className="h-4 w-4" /><span>{(jobState.totalTicketsToProcess || 0) - ((jobState.results && jobState.results.length) || 0)}</span></p></div>
                          </div>
                      </div>
                  )}
                </div>

                <div className="pt-4 border-t border-border/50">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="space-y-2">
                          <Label htmlFor="delay" className="flex items-center space-x-2"><Clock className="h-4 w-4" /><span>Delay (Sec)</span></Label>
                          <div className="flex items-center space-x-3">
                            <Input id="delay" type="number" min="0" step="1" value={formData.delay || 0} onChange={(e) => handleInputChange('delay', parseInt(e.target.value) || 0)} className="bg-muted/30 border-border focus:bg-card" required disabled={isProcessing} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="stopAfterFailures" className="flex items-center space-x-2"><AlertTriangle className="h-4 w-4 text-amber-500" /><span>Auto-Pause</span></Label>
                          <div className="flex items-center space-x-3">
                            <Input id="stopAfterFailures" type="number" min="0" step="1" placeholder="0 (Disabled)" value={formData.stopAfterFailures ?? ''} onChange={(e) => handleInputChange('stopAfterFailures', e.target.value === '' ? 0 : parseInt(e.target.value))} className="bg-muted/30 border-border focus:bg-card" disabled={isProcessing} />
                          </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="flex items-center space-x-2"><Bot className="h-4 w-4" /><span>Optional Email Actions</span></Label>
                        <div className="space-y-4 rounded-lg bg-muted/30 p-4 border border-border">
                          
                          <div className="flex items-start space-x-3">
                              <Checkbox 
                                  id="sendDirectReply" 
                                  checked={!!formData.sendDirectReply} 
                                  onCheckedChange={(checked) => handleCheckboxChange('sendDirectReply', !!checked)} 
                                  disabled={isProcessing} 
                              />
                              <div className="grid gap-1.5 leading-none">
                                  <Label htmlFor="sendDirectReply" className="font-medium hover:cursor-pointer">Send Direct Public Reply</Label>
                                  <p className="text-xs text-muted-foreground">Disables automation. Sends description as email.</p>
                              </div>
                          </div>
                          
                          <div className="flex items-start space-x-3">
                              <Checkbox 
                                  id="verifyEmail" 
                                  checked={!!formData.verifyEmail} 
                                  onCheckedChange={(checked) => handleCheckboxChange('verifyEmail', !!checked)} 
                                  disabled={isProcessing} 
                              />
                              <div className="grid gap-1.5 leading-none">
                                  <Label htmlFor="verifyEmail" className="font-medium hover:cursor-pointer">Verify Automation Email</Label>
                                  <p className="text-xs text-muted-foreground">Slower. Checks if automation was triggered.</p>
                              </div>
                          </div>   
                          
                          <Separator className="my-2" />
                          
                          <div className="flex items-start space-x-3">
                              <Checkbox 
                                  id="enableTracking" 
                                  checked={!!formData.enableTracking} 
                                  onCheckedChange={(checked) => handleCheckboxChange('enableTracking', !!checked)} 
                                  disabled={isProcessing || !selectedProfile?.desk?.cloudflareTrackingUrl} 
                              />
                              <div className="grid gap-1.5 leading-none">
                                  <Label htmlFor="enableTracking" className="font-medium hover:cursor-pointer flex items-center space-x-1">
                                      <span>Inject Cloudflare Tracker</span>
                                      {!selectedProfile?.desk?.cloudflareTrackingUrl && <span className="text-[10px] text-destructive">(URL missing in Profile)</span>}
                                  </Label>
                                  <p className="text-xs text-muted-foreground">Appends invisible 1x1 pixel to detect opens instantly.</p>
                              </div>
                          </div>

                        </div>
                    </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName" className="flex items-center space-x-2">
                      <Edit className="h-4 w-4" /><span>Sender Name (Native Zoho)</span>
                  </Label>
                  <div className="flex items-center space-x-2">
                      <Input id="displayName" value={formData.displayName || ''} onChange={(e) => handleInputChange('displayName', e.target.value)} placeholder={isLoadingName ? "Loading..." : "Not configured"} disabled={!selectedProfile?.desk?.mailReplyAddressId || isLoadingName} />
                      <Button type="button" size="sm" onClick={handleUpdateName} disabled={!selectedProfile?.desk?.mailReplyAddressId || isLoadingName || formData.displayName === 'N/A'}>Update</Button>
                      <Button type="button" size="icon" variant="ghost" onClick={fetchDisplayName} disabled={!selectedProfile?.desk?.mailReplyAddressId || isLoadingName}>
                          <RefreshCw className={`h-4 w-4 ${isLoadingName ? 'animate-spin' : ''}`} />
                      </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="senderName" className="flex items-center space-x-2">
                      <Sparkles className="h-4 w-4 text-green-500" /><span>Sender Name (Deluge Workflow)</span>
                  </Label>
                  <Input id="senderName" placeholder="e.g., Vibrobet Support" value={formData.senderName || ''} onChange={(e) => handleInputChange('senderName', e.target.value)} className="h-10 bg-muted/30 border-border focus:bg-card transition-colors" disabled={isProcessing} />
                  <p className="text-[10px] text-muted-foreground">This injects the name into the Resolution field for the custom Deluge script.</p>
                </div>

                <div className="space-y-2 mt-4">
                  <Label htmlFor="subject" className="flex items-center space-x-2"><MessageSquare className="h-4 w-4" /><span>Ticket Subject</span></Label>
                  <Input id="subject" placeholder="Enter ticket subject..." value={typeof formData.subject === 'string' ? formData.subject : ''} onChange={(e) => handleInputChange('subject', e.target.value)} className="h-12 bg-muted/30 border-border focus:bg-card transition-colors" required disabled={isProcessing} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="description" className="flex items-center space-x-2"><MessageSquare className="h-4 w-4" /><span>Ticket Description</span></Label>
                    <div className="flex items-center space-x-2">
                      <ImageToolDialog onApply={handleApplyImage} />
                      <Dialog>
                        <DialogTrigger asChild><Button variant="ghost" size="sm" className="h-7 px-2 text-xs"><Eye className="h-3 w-3 mr-1" />Preview</Button></DialogTrigger>
                        <DialogContent className="max-w-2xl bg-card border-border shadow-large"><DialogHeader><DialogTitle>Description Preview</DialogTitle></DialogHeader><div className="p-4 bg-muted/30 rounded-lg border border-border max-h-96 overflow-y-auto" dangerouslySetInnerHTML={{ __html: typeof formData.description === 'string' ? formData.description : '' }} /></DialogContent>
                      </Dialog>
                    </div>
                  </div>
                  <Textarea 
                    id="description" 
                    placeholder="Enter ticket description (HTML supported)..." 
                    value={typeof formData.description === 'string' ? formData.description : ''} 
                    onChange={(e) => handleInputChange('description', e.target.value)} 
                    className="min-h-[245px] bg-muted/30 border-border focus:bg-card transition-colors" 
                    required 
                    disabled={isProcessing} 
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              {!isProcessing ? (
                <div className="flex gap-3">
                  <Button 
                    type="submit" 
                    variant="premium" 
                    size="lg" 
                    disabled={
                      !currentEmailsStr.trim() || 
                      !(typeof formData.subject === 'string' ? formData.subject : '').trim() || 
                      !(typeof formData.description === 'string' ? formData.description : '').trim()
                    } 
                    className="flex-1"
                  >
                      <Send className="h-4 w-4 mr-2" />
                      Create {emailCount} Tickets
                  </Button>
                  {failedCount > 0 && (
                       <Button type="button" variant="secondary" size="lg" className="border-red-200 hover:bg-red-50 text-red-700" onClick={(e) => { e.preventDefault(); onRetryFailed(); }}>
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Retry Failed ({failedCount})
                       </Button>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-4">
                  <Button type="button" variant="secondary" size="lg" onClick={onPauseResume} className="flex-1">
                    {isPaused ? <><Play className="h-4 w-4 mr-2" />Resume Job</> : <><Pause className="h-4 w-4 mr-2" />Pause Job</>}
                  </Button>
                  <Button type="button" variant="destructive" size="lg" onClick={onEndJob} className="flex-1">
                    <Square className="h-4 w-4 mr-2" />End Job
                  </Button>
                </div>
              )}

              <div className="flex justify-end space-x-2 mt-4">
                  <Button 
                      type="button"
                      variant="outline" 
                      size="sm"
                      className="border-red-200 text-red-600 hover:bg-red-50 text-xs h-8"
                      onClick={() => {
                          if(window.confirm("Clear this account's job history from the database?")) {
                              socket?.emit('clearJob', { profileName: selectedProfile?.profileName, jobType: 'ticket' });
                          }
                      }}
                      disabled={isProcessing || !selectedProfile}
                  >
                      <Trash2 className="w-3 h-3 mr-1" /> Clear This Account
                  </Button>

                  <Button 
                      type="button"
                      variant="ghost" 
                      size="sm"
                      className="text-xs text-red-500 hover:text-red-700 h-8"
                      onClick={() => {
                          if(window.confirm("DANGER: This will delete ALL Desk job history for ALL accounts!")) {
                              socket?.emit('clearAllJobs', { jobType: 'ticket' });
                          }
                      }}
                      disabled={isProcessing}
                  >
                      Wipe All History
                  </Button>
              </div>

            </div>
          </form>
        </CardContent>
      </Card>

      <TrackingAnalytics 
        isOpen={isAnalyticsOpen} 
        onClose={() => setIsAnalyticsOpen(false)} 
        trackingUrl={selectedProfile?.desk?.cloudflareTrackingUrl || ''} 
        profileName={selectedProfile?.profileName || 'Unknown'}
      />
    </>
  );
};