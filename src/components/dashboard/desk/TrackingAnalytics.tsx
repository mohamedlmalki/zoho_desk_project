// --- FILE: src/components/dashboard/desk/TrackingAnalytics.tsx ---

import React, { useState, useEffect, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { RefreshCw, Eye, Users, Globe, Activity, Mail, Calendar as CalendarIcon, Trash2, MousePointerClick } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface TrackingAnalyticsProps {
    isOpen: boolean;
    onClose: () => void;
    trackingUrl: string;
    profileName: string; 
}

interface LogEntry {
    email: string;
    ticketId: string;
    openedAt: string;
    country?: string;
    profileName?: string; 
    profile?: string; 
    hasClicked?: boolean; 
    clickCount?: number; 
    clickCountry?: string; 
}

export const TrackingAnalytics: React.FC<TrackingAnalyticsProps> = ({ isOpen, onClose, trackingUrl, profileName }) => {
    const { toast } = useToast();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    
    const [activeApp, setActiveApp] = useState<'Desk' | 'Projects'>('Desk');
    
    // 🚨 ADDED: State for Table Sorting
    const [sortBy, setSortBy] = useState<'time' | 'opens' | 'clicks' | 'email'>('time');
    const [sortDesc, setSortDesc] = useState(true);

    const [date, setDate] = useState<DateRange | undefined>({
        from: undefined,
        to: undefined,
    });

    const getApiUrl = () => {
        if (!trackingUrl) return '';
        return trackingUrl.endsWith('/api/logs') ? trackingUrl : trackingUrl.replace(/\/$/, '') + '/api/logs';
    };

    const fetchLogs = async () => {
        const url = getApiUrl();
        if (!url) return;
        setIsLoading(true);
        try {
            const res = await fetch(`${url}?t=${new Date().getTime()}`);
            const data = await res.json();
            
            if (data.success && data.logs) {
                const sorted = data.logs.sort((a: LogEntry, b: LogEntry) => 
                    new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()
                );
                setLogs(sorted);
            } else {
                toast({ title: "Error", description: data.error || "Failed to load logs.", variant: "destructive" });
            }
        } catch (error) {
            toast({ title: "Fetch Failed", description: "Could not reach Cloudflare.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearLogs = async () => {
        const url = getApiUrl();
        if (!url) return;
        
        if (!window.confirm(`WARNING: This will permanently delete ALL tracking logs for both Desk and Projects from your Cloudflare database. Continue?`)) return;

        setIsClearing(true);
        try {
            const res = await fetch(url, {
                method: 'DELETE',
                headers: { 'x-tracking-secret': 'eygirl-secret-key-2026' }
            });
            const data = await res.json();
            
            if (data.success) {
                setLogs([]);
                toast({ title: "Database Cleared", description: "All tracking logs have been deleted." });
            } else {
                toast({ title: "Clear Failed", description: data.error || "Unauthorized", variant: "destructive" });
            }
        } catch (error) {
            toast({ title: "Clear Failed", description: "Network error occurred.", variant: "destructive" });
        } finally {
            setIsClearing(false);
        }
    };

    useEffect(() => {
        if (isOpen) fetchLogs();
    }, [isOpen, trackingUrl]);

    const filteredLogs = useMemo(() => {
        const targetProfile = String(profileName + '_' + activeApp).toLowerCase();
        const legacyProfile = String(profileName).toLowerCase();

        let filtered = logs.filter(log => {
            const logProfile = String(log.profileName || log.profile || '').toLowerCase();
            
            if (logProfile === targetProfile) return true; 
            
            if (logProfile === legacyProfile) {
                if (activeApp === 'Projects') return log.ticketId === 'Projects';
                if (activeApp === 'Desk') return log.ticketId !== 'Projects';
            }
            
            return false;
        });

        if (date?.from) {
            filtered = filtered.filter(log => {
                const logDate = parseISO(log.openedAt);
                if (date.from && date.to) {
                    return isWithinInterval(logDate, { start: startOfDay(date.from), end: endOfDay(date.to) });
                }
                return logDate >= startOfDay(date.from);
            });
        }
        return filtered;
    }, [logs, date, profileName, activeApp]);

    const userStats = useMemo(() => {
        const stats: Record<string, { opens: number, clicks: number }> = {};
        filteredLogs.forEach(log => {
            if (!stats[log.email]) {
                stats[log.email] = { opens: 0, clicks: 0 };
            }
            stats[log.email].opens += 1;
            stats[log.email].clicks += (log.clickCount || 0);
        });
        return stats;
    }, [filteredLogs]);

    const uniqueFilteredLogs = useMemo(() => {
        const seen = new Set<string>();
        return filteredLogs.filter(log => {
            if (seen.has(log.email)) return false;
            seen.add(log.email);
            return true;
        });
    }, [filteredLogs]);

    // 🚨 ADDED: Sorting Function for the Data Table
    const handleSort = (column: 'time' | 'opens' | 'clicks' | 'email') => {
        if (sortBy === column) {
            setSortDesc(!sortDesc);
        } else {
            setSortBy(column);
            setSortDesc(true); // Default to Descending (highest number first) when clicking a new column
        }
    };

    const sortedUniqueLogs = useMemo(() => {
        return [...uniqueFilteredLogs].sort((a, b) => {
            let valA: any, valB: any;
            if (sortBy === 'time') {
                valA = new Date(a.openedAt).getTime();
                valB = new Date(b.openedAt).getTime();
            } else if (sortBy === 'opens') {
                valA = userStats[a.email]?.opens || 0;
                valB = userStats[b.email]?.opens || 0;
            } else if (sortBy === 'clicks') {
                valA = userStats[a.email]?.clicks || 0;
                valB = userStats[b.email]?.clicks || 0;
            } else if (sortBy === 'email') {
                valA = a.email.toLowerCase();
                valB = b.email.toLowerCase();
            }
            
            if (valA < valB) return sortDesc ? 1 : -1;
            if (valA > valB) return sortDesc ? -1 : 1;
            return 0;
        });
    }, [uniqueFilteredLogs, userStats, sortBy, sortDesc]);


    // --- DATA PROCESSING FOR CHARTS ---
    const totalOpens = filteredLogs.length;
    const uniqueViewers = new Set(filteredLogs.map(log => log.email)).size;
    const totalClicks = filteredLogs.reduce((sum, log) => sum + (log.clickCount || 0), 0);
    const uniqueClickers = new Set(filteredLogs.filter(log => (log.clickCount || 0) > 0 || log.hasClicked).map(log => log.email)).size;
	
	
    const timelineDataMap: Record<string, number> = {};
    filteredLogs.forEach(log => {
        const dateStr = format(parseISO(log.openedAt), 'MMM dd');
        timelineDataMap[dateStr] = (timelineDataMap[dateStr] || 0) + 1;
    });
    const timelineData = Object.keys(timelineDataMap).reverse().map(d => ({ name: d, Opens: timelineDataMap[d] }));

    const countryMap: Record<string, number> = {};
    filteredLogs.forEach(log => {
        const c = log.country || 'Unknown';
        countryMap[c] = (countryMap[c] || 0) + 1;
    });
    const pieData = Object.keys(countryMap).map(c => ({ name: c, value: countryMap[c] })).sort((a, b) => b.value - a.value);
    const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#64748b', '#0ea5e9', '#84cc16', '#a855f7', '#d946ef'];

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[400px] sm:w-[600px] sm:max-w-none overflow-y-auto bg-slate-50/50 dark:bg-slate-950">
                <SheetHeader className="mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div>
                            <SheetTitle className="flex items-center text-2xl">
                                <Activity className="mr-2 h-6 w-6 text-blue-500" />
                                Live Analytics
                            </SheetTitle>
                            <SheetDescription>Showing data for: <strong className="text-primary">{profileName}</strong></SheetDescription>
                        </div>
                        
                        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !date && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {date?.from ? (
                                            date.to ? (<>{format(date.from, "LLL dd")} - {format(date.to, "LLL dd")}</>) : (format(date.from, "LLL dd"))
                                        ) : (
                                            <span>Filter Date</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
                                    <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={setDate} numberOfMonths={2} />
                                </PopoverContent>
                            </Popover>

                            <Button variant="destructive" size="icon" onClick={handleClearLogs} disabled={isClearing || logs.length === 0} className="h-8 w-8 rounded-full" title="Clear Database">
                                <Trash2 className={`h-4 w-4 ${isClearing ? 'animate-pulse' : ''}`} />
                            </Button>

                            <Button variant="outline" size="icon" onClick={fetchLogs} disabled={isLoading} className="h-8 w-8 rounded-full" title="Refresh Data">
                                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
                            </Button>
                        </div>
                    </div>
                    
                    <div className="flex bg-slate-200/50 dark:bg-slate-800/50 p-1 rounded-lg w-fit mt-2 border border-slate-200 dark:border-slate-700 shadow-sm">
                        <button 
                            onClick={() => setActiveApp('Desk')} 
                            className={cn("px-5 py-1.5 text-sm font-semibold rounded-md transition-all duration-200", 
                                activeApp === 'Desk' ? "bg-white dark:bg-slate-900 shadow-sm text-blue-600 dark:text-blue-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            )}
                        >
                            Desk Stats
                        </button>
                        <button 
                            onClick={() => setActiveApp('Projects')} 
                            className={cn("px-5 py-1.5 text-sm font-semibold rounded-md transition-all duration-200", 
                                activeApp === 'Projects' ? "bg-white dark:bg-slate-900 shadow-sm text-blue-600 dark:text-blue-400" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            )}
                        >
                            Projects Stats
                        </button>
                    </div>

                </SheetHeader>

                {!trackingUrl ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground bg-card rounded-lg border border-dashed mt-6">
                        <Globe className="h-12 w-12 mb-4 opacity-20" />
                        <p>No Tracking URL configured.</p>
                        <p className="text-xs mt-1">Add your Cloudflare Worker URL in your Profile Settings.</p>
                    </div>
                ) : (
                    <div className="space-y-6 mt-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <Card className="shadow-sm border-blue-200 dark:border-blue-900 bg-blue-50/10 dark:bg-blue-900/5">
                                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                                    <Eye className="h-5 w-5 text-blue-500 mb-2" />
                                    <p className="text-3xl font-bold">{totalOpens}</p>
                                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total Opens</p>
                                </CardContent>
                            </Card>
                            <Card className="shadow-sm border-emerald-200 dark:border-emerald-900 bg-emerald-50/10 dark:bg-emerald-900/5">
                                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                                    <Users className="h-5 w-5 text-emerald-500 mb-2" />
                                    <p className="text-3xl font-bold">{uniqueViewers}</p>
                                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Unique Opens</p>
                                </CardContent>
                            </Card>
                            <Card className="shadow-sm border-purple-200 dark:border-purple-900 bg-purple-50/30 dark:bg-purple-900/10">
                                <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                                    <MousePointerClick className="h-5 w-5 text-purple-500 mb-2" />
                                    <p className="text-3xl font-bold text-purple-700 dark:text-purple-400">{totalClicks}</p>
                                    <p className="text-[10px] text-purple-600/70 dark:text-purple-400/70 font-medium uppercase tracking-wider">Total Clicks</p>
                                </CardContent>
                            </Card>
                            <Card className="shadow-sm border-rose-200 dark:border-rose-900 bg-rose-50/30 dark:bg-rose-900/10">
    <CardContent className="p-4 flex flex-col items-center justify-center text-center">
        <Activity className="h-5 w-5 text-rose-500 mb-2" />
        <p className="text-3xl font-bold text-rose-700 dark:text-rose-400">{uniqueClickers}</p>
        <p className="text-[10px] text-rose-600/70 dark:text-rose-400/70 font-medium uppercase tracking-wider">Unique Clickers</p>
    </CardContent>
</Card>
                        </div>

                        {timelineData.length > 0 && (
                            <Card className="shadow-sm">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Engagement Timeline</CardTitle>
                                </CardHeader>
                                <CardContent className="h-[200px] p-0 px-4">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={timelineData}>
                                            <defs>
                                                <linearGradient id="colorOpens" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                                            <YAxis fontSize={10} tickLine={false} axisLine={false} width={30} />
                                            <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                                            <Area type="monotone" dataKey="Opens" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorOpens)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>
                        )}

                        {pieData.length > 0 && (
                            <Card className="shadow-sm">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Top Locations</CardTitle>
                                </CardHeader>
                                <CardContent className="h-[180px] flex items-center">
                                    <ResponsiveContainer width="50%" height="100%">
                                        <PieChart>
                                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value">
                                                {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                            </Pie>
                                            <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <ScrollArea className="w-[50%] h-[160px]">
                                        <div className="pl-2 pr-4 space-y-2">
                                            {pieData.map((entry, index) => (
                                                <div key={entry.name} className="flex items-center justify-between text-xs">
                                                    <div className="flex items-center min-w-0">
                                                        <div className="w-2 h-2 rounded-full mr-2 shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                                        <span className="font-medium truncate" title={entry.name}>{entry.name}</span>
                                                    </div>
                                                    <span className="text-muted-foreground ml-2 shrink-0">{entry.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </CardContent>
                            </Card>
                        )}

                        {/* 🚨 THE NEW SORTABLE DATA TABLE */}
                        <Card className="shadow-sm overflow-hidden">
                            <CardHeader className="pb-2 border-b bg-muted/20">
                                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Recent Activity</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <ScrollArea className="h-[350px] w-full">
                                    <table className="w-full text-sm text-left">
                                        <thead className="text-[11px] text-muted-foreground bg-muted/50 sticky top-0 z-10 shadow-sm uppercase tracking-wider">
                                            <tr>
                                                <th className="px-4 py-3 font-semibold cursor-pointer hover:bg-muted/80 select-none transition-colors" onClick={() => handleSort('email')}>
                                                    User / Details {sortBy === 'email' ? (sortDesc ? '↓' : '↑') : <span className="opacity-30">↕</span>}
                                                </th>
                                                <th className="px-4 py-3 font-semibold cursor-pointer hover:bg-muted/80 text-center select-none transition-colors" onClick={() => handleSort('opens')}>
                                                    Opens {sortBy === 'opens' ? (sortDesc ? '↓' : '↑') : <span className="opacity-30">↕</span>}
                                                </th>
                                                <th className="px-4 py-3 font-semibold cursor-pointer hover:bg-muted/80 text-center select-none transition-colors" onClick={() => handleSort('clicks')}>
                                                    Clicks {sortBy === 'clicks' ? (sortDesc ? '↓' : '↑') : <span className="opacity-30">↕</span>}
                                                </th>
                                                <th className="px-4 py-3 font-semibold cursor-pointer hover:bg-muted/80 text-right select-none transition-colors" onClick={() => handleSort('time')}>
                                                    Last Active {sortBy === 'time' ? (sortDesc ? '↓' : '↑') : <span className="opacity-30">↕</span>}
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {sortedUniqueLogs.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">
                                                        No tracking logs found for this account.
                                                    </td>
                                                </tr>
                                            ) : (
                                                sortedUniqueLogs.map((log, i) => (
                                                    <tr key={i} className="hover:bg-muted/50 transition-colors group">
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center space-x-3">
                                                                <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-full hidden sm:block shrink-0 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 transition-colors">
                                                                    <Mail className="h-4 w-4 text-slate-600 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="font-medium text-sm truncate max-w-[150px] sm:max-w-[220px]" title={log.email}>{log.email}</p>
                                                                    <div className="flex items-center text-[10px] text-muted-foreground mt-1 space-x-2">
                                                                        <span className="bg-muted px-1.5 py-0.5 rounded font-bold text-slate-700 dark:text-slate-300">{log.ticketId || 'Bulk'}</span>
                                                                        {log.country && <span className="truncate max-w-[80px]" title={log.country}>📍 {log.country}</span>}
                                                                        {log.clickCountry && log.clickCountry !== log.country && <span className="truncate max-w-[80px] text-blue-500" title={log.clickCountry}>🖱️ {log.clickCountry}</span>}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center align-middle">
                                                            <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full inline-flex items-center justify-center shadow-sm min-w-[2rem]">
                                                                {userStats[log.email]?.opens || 1}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center align-middle">
                                                            {(userStats[log.email]?.clicks || 0) > 0 ? (
                                                                <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800 text-xs font-bold px-2.5 py-0.5 rounded-full inline-flex items-center justify-center shadow-sm min-w-[2rem]">
                                                                    {userStats[log.email].clicks}
                                                                </span>
                                                            ) : (
                                                                <span className="text-muted-foreground text-xs opacity-40 font-bold">-</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-right whitespace-nowrap align-middle">
                                                            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">{format(parseISO(log.openedAt), 'MMM d')}</span>
                                                            <span className="block text-[10px] text-muted-foreground mt-0.5">{format(parseISO(log.openedAt), 'h:mm a')}</span>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
};