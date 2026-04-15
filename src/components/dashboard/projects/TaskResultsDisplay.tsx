// --- FILE: src/components/dashboard/projects/TaskResultsDisplay.tsx ---
import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ZohoProject, ZohoTask } from './ProjectsDataTypes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
    RefreshCw, ListFilter, Search, CheckCircle2, Circle, Clock, Trash2, Terminal, ChevronDown, ChevronLeft, ChevronRight 
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ViewLog } from './ProjectsTasksDashboard';

interface TaskResultsDisplayProps {
  tasks: ZohoTask[];
  projects: ZohoProject[];
  selectedProjectId: string | null;
  setSelectedProjectId: React.Dispatch<React.SetStateAction<string | null>>;
  fetchTasks: () => void;
  viewLogs?: ViewLog[];
  onDeleteSelected?: (taskIds: string[]) => void;
  
  selectedTaskIds: Set<string>;
  setSelectedTaskIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export const TaskResultsDisplay: React.FC<TaskResultsDisplayProps> = ({
  tasks,
  projects,
  selectedProjectId,
  setSelectedProjectId,
  fetchTasks,
  viewLogs = [],
  onDeleteSelected,
  selectedTaskIds,
  setSelectedTaskIds
}) => {
  const [filterText, setFilterText] = useState('');
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 100;

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter(task => {
      if (!filterText) return true;
      const lowerFilter = filterText.toLowerCase();
      return (
        (task.name || '').toLowerCase().includes(lowerFilter) ||
        (task.prefix || '').toLowerCase().includes(lowerFilter) ||
        (task.status?.name || '').toLowerCase().includes(lowerFilter) ||
        (task.tasklist?.name || '').toLowerCase().includes(lowerFilter)
      );
    });
  }, [tasks, filterText]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterText, selectedProjectId]);

  const paginatedTasks = useMemo(() => {
      const startIndex = (currentPage - 1) * pageSize;
      return filteredTasks.slice(startIndex, startIndex + pageSize);
  }, [filteredTasks, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredTasks.length / pageSize);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTaskIds(new Set(filteredTasks.map(t => String(t.id))));
    } else {
      setSelectedTaskIds(new Set());
    }
  };

  const handleSelectOne = (taskId: string, checked: boolean) => {
    const newSet = new Set(selectedTaskIds);
    if (checked) newSet.add(taskId);
    else newSet.delete(taskId);
    setSelectedTaskIds(newSet);
  };

  const handleExecuteDelete = () => {
    if (selectedTaskIds.size === 0) return;
    if (confirm(`You are about to queue ${selectedTaskIds.size} tasks for permanent background deletion. This cannot be undone. Continue?`)) {
        if (onDeleteSelected) {
            onDeleteSelected(Array.from(selectedTaskIds));
            setSelectedTaskIds(new Set()); 
        }
    }
  };

  return (
    <div className="space-y-4">
        {/* LOG TERMINAL */}
        {viewLogs.length > 0 && (
            <Collapsible open={isLogsOpen} onOpenChange={setIsLogsOpen} className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
                <CollapsibleTrigger className="flex w-full items-center justify-between p-3 text-sm font-semibold hover:bg-muted/50 transition-colors">
                    <span className="flex items-center"><Terminal className="w-4 h-4 mr-2"/> Live Network Logs ({viewLogs.length})</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${isLogsOpen ? 'rotate-180' : ''}`} />
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="p-4 max-h-[300px] overflow-y-auto space-y-1.5 bg-zinc-950 dark:bg-black font-mono text-xs">
                        {viewLogs.map(log => (
                            <div key={log.id} className="leading-tight">
                                <span className="text-zinc-500">[{log.timestamp.toLocaleTimeString()}]</span>{' '}
                                <span className={`font-bold ${
                                    log.type === 'error' ? 'text-red-500' : 
                                    log.type === 'success' ? 'text-emerald-400' : 
                                    log.type === 'request' ? 'text-blue-400' : 
                                    log.type === 'response' ? 'text-purple-400' : 'text-zinc-300'
                                }`}>
                                    [{log.type.toUpperCase()}]
                                </span>{' '}
                                <span className="text-zinc-200">{log.message}</span>
                                {log.details && (
                                    <pre className="mt-1 ml-6 p-2 bg-white/5 border border-white/10 rounded-md overflow-x-auto text-[10px] text-zinc-400">
                                        {JSON.stringify(log.details, null, 2)}
                                    </pre>
                                )}
                            </div>
                        ))}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        )}

        <Card className="shadow-sm border">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-4 sm:space-y-0 pb-4">
            <CardTitle className="flex items-center space-x-2">
                <ListFilter className="h-5 w-5 text-primary" />
                <span>Task List ({filteredTasks.length})</span>
            </CardTitle>
            <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                <div className="relative w-full sm:w-[250px]">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Filter tasks..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="pl-8 bg-background"
                    />
                </div>
                <Select 
                    value={selectedProjectId || ''} 
                    onValueChange={(val) => {
                        console.log("\n=======================================================");
                        console.log("🎯 [TASK VIEW] Project Dropdown Value Changed!");
                        console.log("🆕 New Project ID:", val);
                        console.log("=======================================================\n");
                        setSelectedProjectId(val);
                    }}
                    disabled={projects.length === 0}
                >
                    <SelectTrigger className="w-full sm:w-[200px] bg-background">
                        <SelectValue placeholder="Select Project" />
                    </SelectTrigger>
                    <SelectContent>
                    {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                        {project.name}
                        </SelectItem>
                    ))}
                    </SelectContent>
                </Select>
                
                {/* EXPLICIT REFRESH BUTTON NEXT TO PROJECT DROPDOWN */}
                <Button 
                    variant="outline" 
                    onClick={() => {
                        console.log("\n=======================================================");
                        console.log("🖱️ [TASK VIEW] 'Refresh' Button Clicked Next to Project Dropdown!");
                        console.log("=======================================================\n");
                        fetchTasks();
                    }} 
                    title="Force Refresh Data" 
                    className="w-full sm:w-auto font-semibold border-blue-200 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    <span>Force Refresh</span>
                </Button>
            </div>
        </CardHeader>

        <CardContent>
            {/* Batch Action Bar */}
            {selectedTaskIds.size > 0 && (
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 mb-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                    <span className="text-sm font-semibold text-primary">
                        {selectedTaskIds.size} task(s) selected
                    </span>
                    <Button variant="destructive" size="sm" onClick={handleExecuteDelete}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Selected Queue
                    </Button>
                </div>
            )}

            {projects.length === 0 ? (
                <div className="p-8 text-center border border-dashed rounded-lg bg-muted/20">
                    <p className="text-muted-foreground">Please select a profile that has Zoho Projects configured.</p>
                </div>
            ) : filteredTasks.length === 0 ? (
                <div className="p-8 text-center border border-dashed rounded-lg bg-muted/20">
                    <p className="text-muted-foreground">No tasks found matching your filters.</p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-border bg-background flex flex-col">
                    <div className="overflow-x-auto">
                        <table className="w-full relative">
                            <thead className="bg-muted/80 backdrop-blur border-b border-border text-left">
                                <tr>
                                    <th className="px-4 py-3 text-center w-[50px]">
                                        <Checkbox 
                                            checked={filteredTasks.length > 0 && selectedTaskIds.size === filteredTasks.length}
                                            onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                                        />
                                    </th>
                                    <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider w-16">#</th>
                                    <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider w-24">Key</th>
                                    <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Task Name</th>
                                    <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider w-32">Status</th>
                                    <th className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Task List</th>
                                    <th className="px-4 py-3 text-right text-xs font-bold text-muted-foreground uppercase tracking-wider w-32">Due Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {paginatedTasks.map((task, localIndex) => {
                                    const taskIdStr = String(task.id);
                                    const isSelected = selectedTaskIds.has(taskIdStr);
                                    const globalIndex = (currentPage - 1) * pageSize + localIndex + 1;

                                    return (
                                        <tr key={taskIdStr} className={`transition-colors hover:bg-muted/30 ${isSelected ? "bg-primary/5" : ""}`}>
                                            <td className="px-4 py-2 text-center">
                                                <Checkbox 
                                                    checked={isSelected}
                                                    onCheckedChange={(checked) => handleSelectOne(taskIdStr, checked as boolean)}
                                                />
                                            </td>
                                            <td className="px-4 py-2 text-xs font-medium text-muted-foreground">
                                                {globalIndex}
                                            </td>
                                            <td className="px-4 py-2">
                                                <Badge variant="outline" className="font-mono text-xs">{task.prefix || '#'}</Badge>
                                            </td>
                                            <td className="px-4 py-2 text-sm font-medium text-foreground">
                                                {task.name}
                                            </td>
                                            <td className="px-4 py-2">
                                                <Badge 
                                                    variant="secondary" 
                                                    className={`text-xs ${
                                                    task.status?.name === 'Closed' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' : 
                                                    task.status?.name === 'Open' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' : ''
                                                    }`}
                                                >
                                                    {task.status?.name === 'Closed' ? <CheckCircle2 className="h-3 w-3 mr-1" /> : 
                                                    task.status?.name === 'Open' ? <Circle className="h-3 w-3 mr-1" /> : 
                                                    <Clock className="h-3 w-3 mr-1" />}
                                                    {task.status?.name || 'Unknown'}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-2 text-sm text-muted-foreground">
                                                {task.tasklist?.name || '-'}
                                            </td>
                                            <td className="px-4 py-2 text-sm text-right font-mono text-muted-foreground whitespace-nowrap">
                                                {task.due_date ? format(new Date(task.due_date), 'MMM d, yyyy') : '-'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 bg-muted/20 border-t border-border">
                            <div className="text-sm text-muted-foreground">
                                Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to <span className="font-medium">{Math.min(currentPage * pageSize, filteredTasks.length)}</span> of <span className="font-medium">{filteredTasks.length}</span> results
                            </div>
                            <div className="flex items-center space-x-2">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                >
                                    <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                                </Button>
                                <div className="text-sm font-medium px-2">
                                    Page {currentPage} of {totalPages}
                                </div>
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                >
                                    Next <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </CardContent>
        </Card>
    </div>
  );
};