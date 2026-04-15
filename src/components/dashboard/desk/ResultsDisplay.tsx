// --- FILE: src/components/dashboard/desk/ResultsDisplay.tsx ---

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
    CheckCircle2, XCircle, Eye, Hash, Mail, Clock, BarChart3, 
    Download, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RotateCcw 
} from 'lucide-react';

export interface TicketResult {
  email: string;
  success: boolean;
  ticketNumber?: string;
  error?: string;
  details?: string;
  fullResponse?: any;
  timestamp?: Date | string; 
  delugeStatus?: 'Success' | 'Failed' | 'Pending'; 
  time?: string; 
}

interface ResultsDisplayProps {
  results: TicketResult[];
  isProcessing: boolean;
  isComplete: boolean;
  totalTickets: number;
  countdown: number;
  filterText: string;
  onFilterTextChange: (text: string) => void;
  onRetry: () => void;
  socket: any; 
  activeProfileName: string;
  showDelugeColumn: boolean; 
}

const ITEMS_PER_PAGE = 10;

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ 
  results, 
  isProcessing, 
  isComplete,
  totalTickets,
  countdown,
  filterText,
  onFilterTextChange,
  onRetry,
  socket,
  activeProfileName,
  showDelugeColumn 
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  
  const [selectedResult, setSelectedResult] = useState<TicketResult | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLogsDialogOpen, setIsLogsDialogOpen] = useState(false);
  const [currentLogs, setCurrentLogs] = useState<any[]>([]);
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);

  const filteredResults = useMemo(() => {
    return results.filter(r => {
      let matchesText = true;
      
      if (filterText) {
          const searchLower = filterText.toLowerCase().trim();
          
          if (searchLower.includes('@')) {
              matchesText = r.email.toLowerCase().includes(searchLower);
          } else {
              matchesText = (
                  r.email.toLowerCase().includes(searchLower) ||
                  (r.details || '').toLowerCase().includes(searchLower) ||
                  (r.error || '').toLowerCase().includes(searchLower) ||
                  (r.ticketNumber || '').toLowerCase().includes(searchLower) ||
                  (r.success ? 'success' : 'failed').includes(searchLower)
              );
          }
      }

      const matchesStatus = 
        statusFilter === 'all' ? true :
        statusFilter === 'success' ? r.success :
        !r.success; 

      return matchesText && matchesStatus;
    });
  }, [results, filterText, statusFilter]);

  const reversedFilteredResults = useMemo(() => {
    return [...filteredResults].reverse(); 
  }, [filteredResults]);

  const totalPages = Math.max(1, Math.ceil(reversedFilteredResults.length / ITEMS_PER_PAGE));
  
  useEffect(() => {
    setCurrentPage(1);
  }, [filterText, statusFilter, activeProfileName]);

  const currentData = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
    return reversedFilteredResults.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [reversedFilteredResults, currentPage, totalPages]);

  const successCount = results.filter(r => r.success).length;
  const errorCount = results.filter(r => !r.success).length;
  const progressPercent = totalTickets > 0 ? (results.length / totalTickets) * 100 : 0;

  useEffect(() => {
    if (!socket) return;
    socket.on('ticketCommentsResult', (data: any) => {
        setIsFetchingLogs(false);
        if (data.success) {
            setCurrentLogs(data.logs);
            setIsLogsDialogOpen(true);
        } else {
            console.error("Failed to fetch logs:", data.error);
        }
    });
    return () => { socket.off('ticketCommentsResult'); };
  }, [socket]);

  const handleFetchLogs = (ticketId: string) => {
      setIsFetchingLogs(true);
      socket.emit('getTicketLogs', { 
          ticketId: ticketId, 
          selectedProfileName: activeProfileName 
      });
  };

  const handleExport = () => {
    const content = filteredResults.map(r => r.email).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    
    const filename = statusFilter === 'all' ? 'emails-all.txt' : 
                     statusFilter === 'success' ? 'emails-success.txt' : 'emails-failed.txt';

    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTime = (dateInput?: Date | string) => {
    if (!dateInput) return '-';
    const date = new Date(dateInput);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const openDetails = (result: TicketResult) => {
      setSelectedResult(result);
      setIsDialogOpen(true);
  };

  if (results.length === 0 && !isProcessing) {
    return null;
  }

  return (
    <>
        <Card className="shadow-medium hover:shadow-large transition-all duration-300">
        <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Processing Results</CardTitle>
            </div>
            <div className="flex items-center space-x-3">
                <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {successCount} Success
                </Badge>
                {errorCount > 0 && (
                    <div className="flex items-center space-x-2">
                        <Badge variant="destructive" className="bg-red-50 text-red-600 border-red-200 hover:bg-red-100">
                            <XCircle className="h-3 w-3 mr-1" />
                            {errorCount} Errors
                        </Badge>
                        {!isProcessing && (
                            <Button size="sm" variant="outline" className="h-6 text-xs border-red-200 text-red-700 hover:bg-red-50" onClick={onRetry}>
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Retry Failed
                            </Button>
                        )}
                    </div>
                )}
            </div>
            </div>
            <CardDescription>
            {isProcessing ? 'Creating tickets in real-time...' : 
            isComplete ? `All ${totalTickets} tickets have been processed.` : 
            'View results below.'}
            </CardDescription>
        </CardHeader>

        <CardContent>
            {/* Progress Bar */}
            {(isProcessing || (isComplete && results.length > 0)) && (
            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">Progress</span>
                <div className="flex items-center space-x-2">
                    {isProcessing && countdown > 0 && (
                    <Badge variant="outline" className="font-mono">
                        <Clock className="h-3 w-3 mr-1" />
                        Next ticket in {countdown}s
                    </Badge>
                    )}
                    <span className="text-sm text-muted-foreground">{results.length} / {totalTickets} processed</span>
                </div>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                </div>
            </div>
            )}
            
            {/* Filter Controls */}
            {results.length > 0 && (
            <div className="space-y-4 mb-4">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'success' | 'failed')} className="w-full md:w-auto">
                    <TabsList>
                    <TabsTrigger value="all">All ({results.length})</TabsTrigger>
                    <TabsTrigger value="success">Success ({successCount})</TabsTrigger>
                    <TabsTrigger value="failed">Failed ({errorCount})</TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search emails..." value={filterText} onChange={(e) => onFilterTextChange(e.target.value)} className="pl-10 h-9" />
                    </div>
                    <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredResults.length === 0}>
                    <Download className="h-4 w-4 mr-2"/>
                    Export
                    </Button>
                </div>
                </div>
            </div>
            )}

            {/* --- Results Table --- */}
            {currentData.length > 0 ? (
            <div className="flex flex-col space-y-4">
                <div className="overflow-hidden rounded-lg border border-border">
                <div className="overflow-x-auto">
                    <table className="w-full">
                    <thead className="bg-muted/50 border-b border-border">
                        <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-12">
                            <Hash className="h-4 w-4" />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            <div className="flex items-center space-x-1">
                            <Mail className="h-4 w-4" />
                            <span>Email</span>
                            </div>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-24">
                            Status
                        </th>
                        
                        {/* --- DELUGE HEADER --- */}
                        {showDelugeColumn && (
                             <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-24">
                                Deluge Log
                             </th>
                        )}

                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Details
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider w-24">
                            Time
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider w-20">
                            Action
                        </th>
                        </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-border">
                        {currentData.map((result, index) => {
                        const safePage = Math.min(currentPage, totalPages);
                        const actualIndex = (reversedFilteredResults.length) - ((safePage - 1) * ITEMS_PER_PAGE + index);
                        
                        const rowKey = `unique-row-${actualIndex}-${index}`;

                        return (
                            <tr key={rowKey} className={`transition-colors hover:bg-muted/30 ${result.success ? 'bg-green-50/30 dark:bg-green-900/10' : 'bg-red-50/30 dark:bg-red-900/10'}`}>
                            <td className="px-4 py-2 text-sm text-center text-muted-foreground font-mono">
                                {actualIndex}
                            </td>
                            <td className="px-4 py-2 text-sm font-medium text-foreground">
                                {result.email}
                            </td>
                            <td className="px-4 py-2">
                                {result.success ? (
                                <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Success
                                </Badge>
                                ) : (
                                <Badge variant="destructive" className="bg-red-50 text-red-600 border-red-200 hover:bg-red-100">
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Failed
                                </Badge>
                                )}
                            </td>

                            {showDelugeColumn && (
                                <td className="px-4 py-2">
                                    {result.delugeStatus === 'Success' ? (
                                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50/50">
                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                            Done
                                        </Badge>
                                    ) : result.delugeStatus === 'Failed' ? (
                                        <Badge variant="destructive" className="bg-red-50 text-red-600 border-red-200">
                                            <XCircle className="h-3 w-3 mr-1" />
                                            Failed
                                        </Badge>
                                    ) : result.success ? (
                                        <Badge variant="secondary" className="bg-slate-100 text-slate-500 animate-pulse border-slate-200">
                                            <Clock className="h-3 w-3 mr-1" />
                                            Wait...
                                        </Badge>
                                    ) : (
                                        <span className="text-muted-foreground">-</span>
                                    )}
                                </td>
                            )}

                            <td className="px-4 py-2 text-sm text-foreground">
                                <span className={!result.success ? "text-destructive font-medium" : "font-medium"}>
                                {result.details || result.error}
                                </span>
                            </td>

                            {/* 🚨 UPDATED: Displays BOTH the duration (1.85s) and the exact time (14:30) nicely stacked! */}
                            <td className="px-4 py-2 text-sm text-center font-mono">
                                <div className="flex flex-col items-center justify-center">
                                    {result.time && (
                                        <span className="text-blue-600 dark:text-blue-400 font-bold text-xs" title="Processing Duration">
                                            {result.time}
                                        </span>
                                    )}
                                    <span className="text-muted-foreground text-[11px]" title="Time Completed">
                                        {formatTime(result.timestamp)}
                                    </span>
                                </div>
                            </td>

                            <td className="px-4 py-2 text-center flex justify-center space-x-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDetails(result)} title="View Raw Data">
                                    <Eye className="h-4 w-4" />
                                </Button>
                                {/* LOGS BUTTON */}
                                {result.success && result.fullResponse?.ticketCreate?.id && (
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-50" 
                                        onClick={() => handleFetchLogs(result.fullResponse.ticketCreate.id)}
                                        disabled={isFetchingLogs}
                                        title="View Deluge Logs"
                                    >
                                        <BarChart3 className="h-4 w-4" /> 
                                    </Button>
                                )}
                            </td>
                            </tr>
                        );
                        })}
                    </tbody>
                    </table>
                </div>
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-2">
                        <div className="text-xs text-muted-foreground">
                            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, reversedFilteredResults.length)} of {reversedFilteredResults.length} entries
                        </div>
                        <div className="flex items-center space-x-2">
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}><ChevronsLeft className="h-4 w-4" /></Button>
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                            <div className="flex items-center justify-center text-sm font-medium w-[80px]">Page {currentPage} / {totalPages}</div>
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}><ChevronsRight className="h-4 w-4" /></Button>
                        </div>
                    </div>
                )}
            </div>
            ) : (
            results.length > 0 && (
                <div className="p-8 text-center border border-dashed border-border rounded-lg bg-muted/20">
                <p className="text-muted-foreground">No results match your current filters.</p>
                </div>
            )
            )}

            {isComplete && (
            <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-900">
                <div className="flex items-center justify-center space-x-2 text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Processing Complete!</span>
                </div>
                <p className="text-center text-sm text-green-600 dark:text-green-500 mt-1">
                Successfully processed {successCount} out of {totalTickets} tickets
                </p>
            </div>
            )}
        </CardContent>
        </Card>

        {/* --- GLOBAL DIALOG --- */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center space-x-2">
                        <Eye className="h-4 w-4" />
                        <span>
                            {selectedResult?.success 
                            ? `Full Response - Ticket #${selectedResult?.ticketNumber}`
                            : `Error Response - ${selectedResult?.email}`
                            }
                        </span>
                    </DialogTitle>
                    {selectedResult?.timestamp && (
                         <DialogDescription>Processed at {new Date(selectedResult.timestamp).toLocaleTimeString()}</DialogDescription>
                    )}
                </DialogHeader>
                
                <div className="space-y-4 p-1">
                    {selectedResult && (
                        <>
                            {selectedResult.fullResponse?.ticketCreate ? (
                                <>
                                    <div>
                                        <h4 className="text-sm font-semibold mb-2 text-foreground">Ticket Creation Response</h4>
                                        <pre className="bg-slate-950 text-slate-50 p-4 rounded-lg text-xs font-mono border border-border overflow-auto">
                                            {JSON.stringify(selectedResult.fullResponse.ticketCreate, null, 2)}
                                        </pre>
                                    </div>
                                    {'verifyDeluge' in selectedResult.fullResponse && (
                                        <div>
                                            <h4 className="text-sm font-semibold mb-2 text-foreground">Deluge Execution Log</h4>
                                            <pre className="bg-slate-950 text-green-400 p-4 rounded-lg text-xs font-mono border border-border overflow-auto">
                                                {JSON.stringify(selectedResult.fullResponse.verifyDeluge, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                    {'sendReply' in selectedResult.fullResponse && (
                                        <div>
                                            <h4 className="text-sm font-semibold mb-2 text-foreground">Send Reply Response</h4>
                                            <pre className="bg-slate-950 text-slate-50 p-4 rounded-lg text-xs font-mono border border-border overflow-auto">
                                                {JSON.stringify(selectedResult.fullResponse.sendReply, null, 2)}
                                            </pre>
                                        </div>
                                    )}

                                    {'verifyEmail' in selectedResult.fullResponse && (
                                        <div>
                                            <h4 className="text-sm font-semibold mb-2 text-foreground">Email Verification Response</h4>
                                            <pre className="bg-slate-950 text-slate-50 p-4 rounded-lg text-xs font-mono border border-border overflow-auto">
                                                {JSON.stringify(selectedResult.fullResponse.verifyEmail, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div>
                                    <pre className="bg-slate-950 text-slate-50 p-4 rounded-lg text-xs font-mono border border-border overflow-auto">
                                        {JSON.stringify(selectedResult.fullResponse || selectedResult, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>

        {/* --- DELUGE LOGS DIALOG --- */}
        <Dialog open={isLogsDialogOpen} onOpenChange={setIsLogsDialogOpen}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Deluge Execution Logs</DialogTitle>
                    <DialogDescription>System logs retrieved from private ticket comments.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                    {currentLogs.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            No logs found for this ticket. Did the Deluge script run?
                        </p>
                    ) : (
                        currentLogs.map((log, index) => (
                            <div key={index} className="bg-slate-950 text-green-400 p-3 rounded-md text-xs font-mono border border-slate-800">
                                <div dangerouslySetInnerHTML={{ __html: log.content }} />
                                <div className="text-slate-500 text-[10px] mt-2 border-t border-slate-800 pt-1">
                                    Logged at: {new Date(log.createdTime).toLocaleString()}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    </>
  );
};