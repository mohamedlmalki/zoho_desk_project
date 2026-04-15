// --- FILE: src/components/dashboard/projects/TaskBulkForm.tsx ---
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch'; 
import { ProjectsJobState, ZohoProject, ProjectsFormData, ProjectsJobs } from './ProjectsDataTypes';
import { Profile } from '@/App'; 
import { Loader2, Play, Pause, Square, ListFilterIcon, ImagePlus, Eye, Save, Upload, List, CheckCircle2, XCircle, Hash, AlertTriangle, Plus, RefreshCw, Trash2, Activity, CopyCheck } from 'lucide-react';
import { Socket } from 'socket.io-client';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from '@/components/ui/skeleton';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { SmartTextSplitter } from './SmartTextSplitter';
import { ProjectsApplyAllModal } from './ProjectsApplyAllModal';

interface TaskLayoutField {
    column_name: string;
    display_name: string;
    i18n_display_name: string;
    column_type: string;
    is_mandatory: boolean;
    is_default: boolean;
    api_name: string; 
}

interface TaskLayoutSection {
    section_name: string;
    customfield_details: TaskLayoutField[];
}

interface TaskLayout {
    layout_id: string;
    section_details: TaskLayoutSection[];
    status_details: any[]; 
}

const CreateFieldDialog = ({ onApply, isLoading }: { onApply: (name: string, type: string) => void, isLoading: boolean }) => {
    const [name, setName] = useState('');
    const [type, setType] = useState('multiline');
    const [isOpen, setIsOpen] = useState(false);

    const handleApply = () => {
        onApply(name, type);
        setIsOpen(false);
        setName('');
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="secondary" size="sm" disabled={isLoading} className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200">
                    <Plus className="h-4 w-4 mr-1" />
                    Create Zoho Field
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>Create New Field in Zoho</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="fieldName">Field Name</Label>
                        <Input id="fieldName" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Client Email" />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="fieldType">Field Type</Label>
                        <Select value={type} onValueChange={setType}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="multiline">Multi-Line (Textarea)</SelectItem>
                                <SelectItem value="text">Single Line (Text)</SelectItem>
                                <SelectItem value="integer">Number</SelectItem>
                                <SelectItem value="email">Email</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <Button onClick={handleApply} disabled={!name}>Create Field</Button>
            </DialogContent>
        </Dialog>
    );
};

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
        
        if (linkUrl) {
            imgTag = `<a href="${linkUrl}">${imgTag}</a>`;
        }

        const containerStyle = `text-align: ${alignment};`;
        const finalHtml = `<div style="${containerStyle}">${imgTag}</div>`;
        
        onApply(finalHtml);
        setIsOpen(false);
        setImageUrl('');
        setAltText('');
        setLinkUrl('');
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs border border-dashed border-slate-300">
                    <ImagePlus className="h-3 w-3 mr-1" />
                    Insert Image
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Add and Style Image</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="imageUrl" className="text-right">Image URL</Label>
                        <Input id="imageUrl" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="col-span-3" placeholder="https://example.com/image.png" />
                    </div>
                    {imageUrl && (
                        <div className="col-span-4 flex justify-center p-4 bg-muted rounded-md">
                            <img src={imageUrl} alt="Preview" className="max-w-full max-h-48" />
                        </div>
                    )}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="altText" className="text-right">Alt Text</Label>
                        <Input id="altText" value={altText} onChange={(e) => setAltText(e.target.value)} className="col-span-3" placeholder="Description of the image" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="linkUrl" className="text-right">Link URL</Label>
                        <Input id="linkUrl" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="col-span-3" placeholder="(Optional) Make image clickable" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="width" className="text-right">Width (%)</Label>
                        <Input id="width" type="number" value={width} onChange={(e) => setWidth(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="maxWidth" className="text-right">Max Width (px)</Label>
                        <Input id="maxWidth" type="number" value={maxWidth} onChange={(e) => setMaxWidth(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="alignment" className="text-right">Alignment</Label>
                        <Select value={alignment} onValueChange={setAlignment}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="Select alignment" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="left">Left</SelectItem>
                                <SelectItem value="center">Center</SelectItem>
                                <SelectItem value="right">Right</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <Button onClick={handleApply} disabled={!imageUrl}>Apply and Insert</Button>
            </DialogContent>
        </Dialog>
    );
};

const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
};

interface TaskBulkFormProps {
  selectedProfileName: string | null;
  portalId?: string; 
  projects: ZohoProject[];
  socket: Socket | null;
  jobState: ProjectsJobState;
  setJobs: React.Dispatch<React.SetStateAction<ProjectsJobs>>;
  createInitialJobState: () => ProjectsJobState; 
  autoTaskListId: string | null;
  selectedProjectId: string | null;
  currentProjectName: string;
  setCurrentProjectName: React.Dispatch<React.SetStateAction<string>>;
  isUpdatingName: boolean;
  handleUpdateProjectName: (finalName: string) => void; 
  profiles: Profile[]; 
}

export const TaskBulkForm: React.FC<TaskBulkFormProps> = ({ 
    selectedProfileName, 
    portalId,
    projects, 
    socket, 
    jobState, 
    setJobs, 
    createInitialJobState,
    autoTaskListId,
    selectedProjectId,
    currentProjectName,
    setCurrentProjectName,
    isUpdatingName,
    handleUpdateProjectName,
    profiles
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isProcessing = jobState.isProcessing;
  const isPaused = jobState.isPaused; 
  const results = jobState.results || [];

  const [taskLayout, setTaskLayout] = useState<TaskLayout | null>(null);
  const [allFields, setAllFields] = useState<TaskLayoutField[]>([]);
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
  const [isLoadingLayout, setIsLoadingLayout] = useState(false);
  
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [isApplyingAll, setIsApplyingAll] = useState(false); 

  const stopAfterFailures = (jobState.formData as any).stopAfterFailures || 4;
  const enableTracking = (jobState.formData as any).enableTracking || false; 
  const appendAccountNumber = (jobState.formData as any).appendAccountNumber || false;

  const handleFormDataChange = useCallback((field: keyof ProjectsFormData | 'stopAfterFailures' | 'enableTracking' | 'appendAccountNumber', value: any) => {
    if (!selectedProfileName) return;

    setJobs((prev) => {
      const prevJobState = prev[selectedProfileName] || jobState;
      return {
        ...prev,
        [selectedProfileName]: {
          ...prevJobState, 
          formData: {
            ...prevJobState.formData, 
            [field]: value, 
          },
        },
      };
    });
  }, [selectedProfileName, setJobs, jobState]); 

  const handleDynamicFieldChange = useCallback((columnName: string, value: string) => {
    if (!selectedProfileName) return;
    setJobs((prev) => {
      const prevJobState = prev[selectedProfileName] || jobState;
      const newBulkData = {
        ...prevJobState.formData.bulkDefaultData,
        [columnName]: value,
      };
      
      return {
        ...prev,
        [selectedProfileName]: {
          ...prevJobState,
          formData: {
            ...prevJobState.formData,
            bulkDefaultData: newBulkData,
          },
        },
      };
    });
  }, [selectedProfileName, setJobs, jobState]); 

  const handleClearCustomFields = () => {
    handleFormDataChange('bulkDefaultData', {});
    toast({ title: "Fields Cleared", description: "Wiped custom fields for this project." });
  };

  const onProjectChange = useCallback((newProjectId: string) => {
    handleFormDataChange('projectId', newProjectId);
    setAllFields([]);
    setTaskLayout(null);
    handleFormDataChange('primaryField', 'name');
  }, [handleFormDataChange]); 

  useEffect(() => {
    const currentValidProject = projects.find(p => p.id === jobState.formData.projectId);
    if (projects.length > 0 && !currentValidProject) {
      onProjectChange(projects[0].id);
    }
  }, [projects, jobState.formData.projectId, onProjectChange]); 

  useEffect(() => {
    if (!socket) return;

    const handleTaskLayoutResult = (result: { success: boolean; data?: TaskLayout; message?: string; error?: string }) => {
        setIsLoadingLayout(false);
        if (result.success && result.data) {
            setTaskLayout(result.data);
            const all = result.data.section_details.flatMap(section => section.customfield_details);
            const customOnly = all.filter(field => !field.is_default);
            setAllFields(customOnly);
            const initialVisibility = customOnly.reduce((acc, field) => {
                acc[field.column_name] = true;
                return acc;
            }, {} as Record<string, boolean>);
            setVisibleFields(initialVisibility);
        } else {
            toast({ title: 'Error fetching task layout', description: result.message || result.error, variant: 'destructive' });
            setTaskLayout(null);
            setAllFields([]);
        }
    };

    const handleTaskLayoutError = (error: { message: string }) => {
        setIsLoadingLayout(false);
        toast({ title: 'Error fetching layout', description: error.message, variant: 'destructive' });
    };

    socket.on('projectsTaskLayoutResult', handleTaskLayoutResult);
    socket.on('projectsTaskLayoutError', handleTaskLayoutError);

    return () => {
        socket.off('projectsTaskLayoutResult', handleTaskLayoutResult);
        socket.off('projectsTaskLayoutError', handleTaskLayoutError);
    };
  }, [socket, toast]);

  useEffect(() => {
    const currentProjectId = jobState.formData.projectId;
    if (socket && selectedProfileName && currentProjectId && !taskLayout) {
      setIsLoadingLayout(true);
      socket.emit('getProjectsTaskLayout', {
          selectedProfileName,
          projectId: currentProjectId
      });
    }
  }, [socket, selectedProfileName, jobState.formData.projectId, taskLayout]); 

  const primaryFieldOptions = useMemo(() => {
    const options = [
      { value: 'name', label: 'Task Name' }
    ];
    if (allFields.length > 0) {
      allFields.forEach(field => {
          options.push({
            value: field.column_name,
            label: field.display_name
          });
        });
    }
    return options;
  }, [allFields]);

  useEffect(() => {
    if (allFields.length > 0 && jobState.formData.primaryField === 'name') {
      const emailField = allFields.find(field => 
        field.column_type === 'email' || 
        field.display_name.toLowerCase().includes('email') || 
        field.i18n_display_name.toLowerCase().includes('email')
      );
      if (emailField) {
        handleFormDataChange('primaryField', emailField.column_name);
      }
    }
  }, [allFields, jobState.formData.primaryField, handleFormDataChange]); 

  const handleApplyToAll = async (updates: any) => {
    setIsApplyingAll(true);

    if (updates.displayName !== undefined) {
        setCurrentProjectName(updates.displayName);
        handleFormDataChange('displayName', updates.displayName); 
    }

    await new Promise(resolve => setTimeout(resolve, 800));

    setJobs((prev: any) => {
      const next = { ...prev };
      
      profiles.forEach((profile) => {
        const pName = profile.profileName; 
        
        const existingJob = next[pName] || createInitialJobState();
        
        let customSmartText = updates.smartSplitterText !== undefined 
            ? updates.smartSplitterText 
            : existingJob.formData.smartSplitterText;
            
        const shouldAppend = updates.appendAccountNumber !== undefined 
            ? updates.appendAccountNumber 
            : existingJob.formData.appendAccountNumber;

        if (shouldAppend && customSmartText && customSmartText.trim() !== '') {
            const suffix = `<br><br><br><br><br><br>${pName}`;
            
            if (!customSmartText.endsWith(suffix)) {
                customSmartText = `${customSmartText}${suffix}`;
            }
        }

        next[pName] = {
          ...existingJob,
          formData: { 
            ...existingJob.formData, 
            ...updates,
            smartSplitterText: customSmartText 
          }
        };
      });

      return next;
    });

    setIsApplyingAll(false);
    setIsApplyModalOpen(false); 
    toast({ title: "Settings Applied to All Accounts!" });
  };

  const handleStart = () => {
    const { projectId, primaryValues, delay } = jobState.formData; 

    if (!selectedProfileName) {
      return toast({
        title: 'Validation Error',
        description: 'Please select a profile and project.',
        variant: 'destructive',
      });
    }

    const tasksToProcess = primaryValues.split('\n').map(name => name.trim()).filter(name => name.length > 0);
    
    if (tasksToProcess.length === 0) {
        return toast({
            title: 'Validation Error',
            description: 'Please enter at least one Primary Field Value.',
            variant: 'destructive',
        });
    }

    if (!socket) {
        return toast({ title: 'Connection Error', description: 'Socket not connected.', variant: 'destructive' });
    }

    const payloadFormData: ProjectsFormData = {
      ...jobState.formData, 
      tasklistId: autoTaskListId || jobState.formData.tasklistId, 
      displayName: currentProjectName, 
      stopAfterFailures: stopAfterFailures,
      enableTracking: enableTracking,
      appendAccountNumber: appendAccountNumber
    };

    setJobs((prevJobs: any) => ({
      ...prevJobs,
      [selectedProfileName]: {
        ...jobState,
        formData: payloadFormData, 
        totalToProcess: tasksToProcess.length,
        isProcessing: true,
        isPaused: false,
        isComplete: false,
        processingStartTime: new Date(),
        processingTime: 0, 
        results: [],
        currentDelay: delay,
      },
    }));

    socket.emit('startBulkCreateTasks', {
        selectedProfileName,
        activeProfile: { projects: { portalId: projects.find(p => p.id === projectId)?.portal_id } }, 
        formData: payloadFormData 
    });
    
    toast({ title: 'Bulk Task Job Started', description: `${tasksToProcess.length} tasks queued.` });
  };
  
  const handlePause = () => {
    if (socket && selectedProfileName) {
        socket.emit('pauseJob', { profileName: selectedProfileName, jobType: 'projects' });
        setJobs((prev: any) => ({
            ...prev,
            [selectedProfileName]: { ...prev[selectedProfileName], isPaused: true },
        }));
        toast({ title: 'Job Paused' });
    }
  };

  const handleResume = () => {
    if (socket && selectedProfileName) {
        socket.emit('resumeJob', { profileName: selectedProfileName, jobType: 'projects' });
        setJobs((prev: any) => ({
            ...prev,
            [selectedProfileName]: { ...prev[selectedProfileName], isPaused: false, isProcessing: true },
        }));
        toast({ title: 'Job Resuming...' });
    }
  };

  const handleEnd = () => {
    if (socket && selectedProfileName) {
        socket.emit('endJob', { profileName: selectedProfileName, jobType: 'projects' });
        toast({ title: 'Job Stopping' });
    }
  };

  const renderField = (field: TaskLayoutField) => {
    let inputType = "text";
    if (field.column_type === "date") inputType = "date";
    if (field.column_type === "email") inputType = "email";
    if (field.column_type === "decimal" || field.column_type === "number") inputType = "number";
    
    const fieldKey = field.column_name;

    return <Input 
        type={inputType} 
        placeholder={field.i18n_display_name} 
        value={jobState.formData.bulkDefaultData[fieldKey] || ''} 
        onChange={(e) => handleDynamicFieldChange(fieldKey, e.target.value)}
        disabled={isProcessing}
    />
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => handleFormDataChange('primaryValues', e.target?.result as string);
      reader.readAsText(file);
    }
  };

  const primaryValuesCount = (jobState.formData.primaryValues || '').split('\n').filter(l => l.trim()).length;
  const successCount = results.filter(r => r.success).length;
  const errorCount = results.filter(r => !r.success).length;
  const remainingCount = Math.max(0, (jobState.totalToProcess || primaryValuesCount) - results.length);

  const displayedProjectName = jobState.formData.displayName !== undefined && jobState.formData.displayName !== '' 
      ? jobState.formData.displayName 
      : currentProjectName;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>Bulk Create Zoho Project Tasks</CardTitle>
            <div className="flex items-center space-x-2">
                {jobState.formData.projectId && (
                    <>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => {
                                if (socket && selectedProfileName && jobState.formData.projectId) {
                                    setIsLoadingLayout(true);
                                    socket.emit('getProjectsTaskLayout', {
                                        selectedProfileName,
                                        projectId: jobState.formData.projectId
                                    });
                                    toast({ title: 'Refreshing Fields', description: 'Pulling the latest layout from Zoho...' });
                                }
                            }}
                            disabled={isLoadingLayout || isProcessing}
                            title="Refresh Custom Fields"
                        >
                            <RefreshCw className={`h-4 w-4 ${isLoadingLayout ? 'animate-spin' : ''}`} />
                        </Button>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" disabled={isLoadingLayout || isProcessing}>
                                    <ListFilterIcon className="mr-2 h-4 w-4" />
                                    Customize Fields
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuLabel>Show/Hide Custom Fields</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {isLoadingLayout ? (
                                    <DropdownMenuLabel>Loading...</DropdownMenuLabel>
                                ) : allFields.length > 0 ? (
                                    allFields.map((field) => (
                                        <DropdownMenuCheckboxItem
                                            key={field.column_name}
                                            checked={visibleFields[field.column_name] ?? false}
                                            onCheckedChange={(checked) =>
                                                setVisibleFields(prev => ({
                                                    ...prev,
                                                    [field.column_name]: !!checked
                                                }))
                                            }
                                        >
                                            {field.i18n_display_name || field.display_name}
                                        </DropdownMenuCheckboxItem>
                                    ))
                                ) : (
                                    <DropdownMenuLabel>No custom fields found.</DropdownMenuLabel>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <CreateFieldDialog 
                            isLoading={isLoadingLayout || isProcessing}
                            onApply={async (name, type) => {
                                const trimmedName = String(name || '').trim();
                                const trimmedType = String(type || '').trim();
                                const layoutId = taskLayout?.layout_id;
                                const projectId = jobState.formData.projectId;

                                if (!selectedProfileName) return toast({ title: 'Missing Profile', description: 'Please select a profile.', variant: 'destructive' });
                                if (!projectId) return toast({ title: 'Missing Project', description: 'Please select a project.', variant: 'destructive' });
                                if (!layoutId) return toast({ title: 'Layout Not Ready', description: 'Layout is still loading. Wait 2 seconds.', variant: 'destructive' });
                                if (!trimmedName) return toast({ title: 'Missing Field Name', description: 'Please enter a field name.', variant: 'destructive' });
                                if (!trimmedType) return toast({ title: 'Missing Field Type', description: 'Please choose a field type.', variant: 'destructive' });

                                setIsLoadingLayout(true);

                                try {
                                    const response = await fetch('http://localhost:3000/api/projects/fields/create', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            selectedProfileName,
                                            projectId,
                                            layoutId,
                                            displayName: trimmedName,
                                            fieldType: trimmedType
                                        })
                                    });
                                    
                                    const result = await response.json();

                                    if (result.success) {
                                        toast({
                                            title: 'Success',
                                            description: result.message || 'Field created successfully! Refreshing your layout...'
                                        });

                                        setTaskLayout(null);
                                        setAllFields([]);
                                        socket?.emit('getProjectsTaskLayout', {
                                            selectedProfileName,
                                            projectId
                                        });
                                    } else {
                                        toast({ title: 'Error Creating Field', description: result.error || 'Unknown error.', variant: 'destructive' });
                                        setIsLoadingLayout(false);
                                    }
                                } catch (e) {
                                    toast({ title: 'Network Error', description: 'Could not contact the local backend server.', variant: 'destructive' });
                                    setIsLoadingLayout(false);
                                }
                            }} 
                        />
                        
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setIsApplyModalOpen(true)} 
                            className="border-purple-200 text-purple-700 hover:bg-purple-50"
                            disabled={isLoadingLayout || isProcessing}
                        >
                            <CopyCheck className="w-4 h-4 mr-2" /> Apply All
                        </Button>
                    </>
                )}
            </div>
        </div>
        <CardDescription>
            Enter task names (one per line) to be created in the selected project with an optional delay.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
            
            <div className="grid gap-2 col-span-1 lg:col-span-2">
                <Label htmlFor="projectName">Active Project Name</Label>
                <div className="flex space-x-2">
                    <Input
                        id="projectName"
                        value={displayedProjectName}
                        onChange={(e) => {
                            setCurrentProjectName(e.target.value);
                            handleFormDataChange('displayName', e.target.value);
                        }}
                        placeholder={"Select a project"}
                    />
                    <Button
                        variant="default"
                        size="icon"
                        onClick={(e) => { 
                            e.preventDefault(); 
                            handleUpdateProjectName(displayedProjectName); 
                        }}
                    >
                        <Save className="h-4 w-4" />
                    </Button>
                </div>
            </div>
            
            <div className="grid gap-2">
                <Label htmlFor="projectId">Project</Label>
                <Select 
                  value={jobState.formData.projectId || ''} 
                  onValueChange={onProjectChange} 
                  disabled={isProcessing || projects.length === 0}
                >
                  <SelectTrigger id="projectId">
                    <SelectValue placeholder="Select a Project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
            </div>
            
            <div className="grid gap-2">
                <div className="flex justify-between items-center">
                    <Label htmlFor="tasklistId" className={!autoTaskListId ? 'text-red-500 font-bold' : ''}>
                        {autoTaskListId ? 'Task List ID' : '⚠️ Missing Task List'}
                    </Label>
                </div>
                <Input
                    id="tasklistId"
                    readOnly
                    value={autoTaskListId || ''}
                    placeholder="Requires Refresh"
                    className={!autoTaskListId ? 'border-red-500 bg-red-50/50 dark:bg-red-950/20' : 'bg-muted'}
                />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="delay">Delay (s)</Label>
              <Input
                id="delay"
                type="number"
                min="0.5"
                step="0.1"
                value={jobState.formData.delay} 
                onChange={(e) => handleFormDataChange('delay', Math.max(0.5, parseFloat(e.target.value) || 0.5))} 
                disabled={isProcessing}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="stopAfterFailures" className="flex items-center space-x-1 whitespace-nowrap">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                <span>Auto-Pause</span>
              </Label>
              <Input
                id="stopAfterFailures"
                type="number"
                min="0"
                step="1"
                placeholder="0 (Disabled)"
                value={stopAfterFailures === 0 ? '' : stopAfterFailures}
                onChange={(e) => {
                    const val = e.target.value;
                    handleFormDataChange('stopAfterFailures' as any, val === '' ? 0 : parseInt(val));
                }}
                className="placeholder:text-muted-foreground/70"
                disabled={isProcessing}
              />
            </div>

            <div className="flex flex-col gap-3 justify-center pl-2">
                <div className="flex items-center justify-between space-x-2">
                    <Label htmlFor="enableTracking" className="flex items-center space-x-1 text-xs whitespace-nowrap cursor-pointer">
                        <Activity className="h-3 w-3 text-blue-500" />
                        <span>Track</span>
                    </Label>
                    <Switch
                        id="enableTracking"
                        checked={enableTracking}
                        onCheckedChange={(checked) => handleFormDataChange('enableTracking' as any, checked)}
                        disabled={isProcessing}
                        className="scale-90"
                    />
                </div>
            </div>

          </div>

          <hr className="my-4" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
                <div className="grid gap-2">
                    <Label htmlFor="primaryField">Primary Field (List)</Label>
                    <Select 
                      value={jobState.formData.primaryField} 
                      onValueChange={(value) => handleFormDataChange('primaryField', value)} 
                      disabled={isProcessing || isLoadingLayout}
                    >
                        <SelectTrigger id="primaryField">
                            <SelectValue placeholder="Select a field to bulk" />
                        </SelectTrigger>
                        <SelectContent>
                            {primaryFieldOptions.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                        Select the field you want to fill from the list below.
                    </p>
                </div>
                
                <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="primaryValues">Primary Field Values (Task Names - one per line)</Label>
                        <div className="flex items-center space-x-2">
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept=".txt,.csv"
                                onChange={handleFileImport}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isProcessing}
                                className="h-6 text-xs"
                            >
                                <Upload className="h-3 w-3 mr-1" /> Import
                            </Button>
                            <Badge variant="secondary" className="text-xs h-6">
                                <List className="h-3 w-3 mr-1" />
                                {primaryValuesCount}
                            </Badge>
                        </div>
                    </div>
                    <Textarea
                    id="primaryValues"
                    placeholder="Paste your list here, e.g., a list of task names."
                    rows={8}
                    value={jobState.formData.primaryValues} 
                    onChange={(e) => handleFormDataChange('primaryValues', e.target.value)} 
                    disabled={isProcessing}
                    />

                    {!isLoadingLayout && allFields.length > 0 && (
                        <div className="mt-4">
                            <SmartTextSplitter
                                value={jobState.formData.smartSplitterText || ''}
                                onChange={(val) => handleFormDataChange('smartSplitterText', val)}
                                fields={allFields
                                    .filter(f => f.column_name !== jobState.formData.primaryField)
                                    .map(f => ({
                                        api_name: f.column_name,
                                        field_label: f.i18n_display_name || f.display_name,
                                        data_type: f.column_type
                                    }))}
                                onSplitValues={(newValues) => {
                                    setVisibleFields(prev => {
                                        const next = { ...prev };
                                        Object.keys(newValues).forEach(key => next[key] = true);
                                        return next;
                                    });

                                    setJobs((prev: any) => {
                                        const prevJobState = prev[selectedProfileName!] || jobState;
                                        return {
                                            ...prev,
                                            [selectedProfileName!]: {
                                                ...prevJobState,
                                                formData: {
                                                    ...prevJobState.formData,
                                                    bulkDefaultData: {
                                                        ...prevJobState.formData.bulkDefaultData,
                                                        ...newValues
                                                    }
                                                }
                                            }
                                        };
                                    });
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>
            
            <div className="space-y-6">
                {isLoadingLayout && (
                    <div className="space-y-4 rounded-md border p-4">
                        <Label className="text-base font-medium">Custom Fields</Label>
                        <div className="space-y-2">
                            <Skeleton className="h-5 w-1/3" />
                            <Skeleton className="h-9 w-full" />
                        </div>
                    </div>
                )}
                
                {!isLoadingLayout && allFields.length > 0 && (
                    <div className="space-y-4 rounded-md border p-4 shadow-sm relative">
                        <div className="flex items-center justify-between mb-4">
                            <Label className="text-base font-medium">Custom Fields (Defaults)</Label>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={handleClearCustomFields} 
                                className="h-7 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                                <Trash2 className="h-3 w-3 mr-1" /> Clear Fields
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            {allFields
                                .filter(field => 
                                    visibleFields[field.column_name] && 
                                    field.column_name !== jobState.formData.primaryField  
                                ) 
                                .map(field => {
                                    const fieldKey = field.column_name;
                                    const currentFieldValue = jobState.formData.bulkDefaultData[fieldKey] || '';

                                    const handleApplyImageToField = (html: string) => {
                                        handleDynamicFieldChange(fieldKey, currentFieldValue + '\n' + html);
                                    };

                                    if (field.column_type === "multiline") {
                                        return (
                                            <div key={fieldKey} className="grid gap-2">
                                                <div className="flex items-center justify-between">
                                                    <Label htmlFor={fieldKey}>{field.i18n_display_name}</Label>
                                                    <div className="flex items-center space-x-2">
                                                        <ImageToolDialog onApply={handleApplyImageToField} />
                                                        <Dialog>
                                                            <DialogTrigger asChild>
                                                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                                                                    <Eye className="h-3 w-3 mr-1" />
                                                                    Preview
                                                                </Button>
                                                            </DialogTrigger>
                                                            <DialogContent className="max-w-2xl">
                                                                <DialogHeader><DialogTitle>Preview</DialogTitle></DialogHeader>
                                                                <div
                                                                    className="p-4 bg-muted/30 rounded-lg border max-h-96 overflow-y-auto"
                                                                    dangerouslySetInnerHTML={{ __html: currentFieldValue }}
                                                                />
                                                            </DialogContent>
                                                        </Dialog>
                                                    </div>
                                                </div>
                                                <Textarea
                                                    id={fieldKey}
                                                    placeholder={field.i18n_display_name}
                                                    value={currentFieldValue} 
                                                    onChange={(e) => handleDynamicFieldChange(fieldKey, e.target.value)}
                                                    disabled={isProcessing}
                                                    className="min-h-[120px]"
                                                />
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={fieldKey} className="grid gap-2">
                                            <Label htmlFor={fieldKey}>{field.i18n_display_name}</Label>
                                            {renderField(field)}
                                        </div>
                                    );
                                })
                            }
                        </div>
                    </div>
                )}
            </div>
          </div>

          {(isProcessing || results.length > 0) && (
            <div className="pt-4 border-t border-dashed">
                <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                        <Label className="text-xs text-muted-foreground">Time Elapsed</Label>
                        <p className="text-lg font-bold font-mono">{formatDuration(jobState.processingTime)}</p>
                    </div>
                    <div>
                        <Label className="text-xs text-muted-foreground">Success</Label>
                        <p className="text-lg font-bold font-mono text-success flex items-center justify-center space-x-1">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>{successCount}</span>
                        </p>
                    </div>
                    <div>
                        <Label className="text-xs text-muted-foreground">Failed</Label>
                        <p className="text-lg font-bold font-mono text-destructive flex items-center justify-center space-x-1">
                            <XCircle className="h-4 w-4" />
                            <span>{errorCount}</span>
                        </p>
                    </div>
                    <div>
                        <Label className="text-xs text-muted-foreground">Remaining</Label>
                        <p className="text-lg font-bold font-mono text-muted-foreground flex items-center justify-center space-x-1">
                            <Hash className="h-4 w-4" />
                            <span>{remainingCount >= 0 ? remainingCount : 0}</span>
                        </p>
                    </div>
                </div>
            </div>
          )}

          <div className="mt-4 flex flex-col space-y-3">
            <div className="flex space-x-2">
                {!isProcessing && (
                  <Button 
                    onClick={handleStart} 
                    className="w-full bg-green-600 hover:bg-green-700" 
                    disabled={!selectedProfileName || projects.length === 0 || jobState.formData.primaryValues.trim().length === 0 || (!autoTaskListId && !jobState.formData.tasklistId)}
                  >
                    <Play className="mr-2 h-4 w-4" /> Start Bulk Creation
                  </Button>
                )}
                
                {isProcessing && !isPaused && (
                  <Button onClick={handlePause} className="w-1/2" variant="outline">
                    <Pause className="mr-2 h-4 w-4" /> Pause
                  </Button>
                )}
                
                {isProcessing && isPaused && (
                  <Button onClick={handleResume} className="w-1/2">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Resume
                  </Button>
                )}
                
                {isProcessing && (
                  <Button onClick={handleEnd} className="w-1/2" variant="destructive">
                    <Square className="mr-2 h-4 w-4" /> End Job
                  </Button>
                )}
            </div>

            {/* 🚨 NEW DATABASE CLEAR BUTTONS FOR PROJECTS */}
            <div className="flex justify-end space-x-2 pt-2">
                <Button 
                    type="button"
                    variant="outline" 
                    size="sm"
                    className="border-red-200 text-red-600 hover:bg-red-50 text-xs h-8"
                    onClick={() => {
                        if(window.confirm("Clear this account's job history from the database?")) {
                            socket?.emit('clearJob', { profileName: selectedProfileName, jobType: 'projects' });
                        }
                    }}
                    disabled={isProcessing || !selectedProfileName}
                >
                    <Trash2 className="w-3 h-3 mr-1" /> Clear This Account
                </Button>

                <Button 
                    type="button"
                    variant="ghost" 
                    size="sm"
                    className="text-xs text-red-500 hover:text-red-700 h-8"
                    onClick={() => {
                        if(window.confirm("DANGER: This will delete ALL Projects job history for ALL accounts!")) {
                            socket?.emit('clearAllJobs', { jobType: 'projects' });
                        }
                    }}
                    disabled={isProcessing}
                >
                    Wipe All History
                </Button>
            </div>
          </div>
        </div>

        <ProjectsApplyAllModal 
          isOpen={isApplyModalOpen} 
          onClose={() => setIsApplyModalOpen(false)} 
          onApply={handleApplyToAll}
          isApplying={isApplyingAll}
        />
      </CardContent>
    </Card>
  );
};