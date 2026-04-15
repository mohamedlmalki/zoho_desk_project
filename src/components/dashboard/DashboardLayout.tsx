// --- FILE: src/components/dashboard/DashboardLayout.tsx ---

import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom'; 
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'; 
import { Ticket, UserPlus, FolderKanban, Activity, GripVertical } from 'lucide-react'; 
import { cn } from '@/lib/utils';
import { ProfileSelector } from './ProfileSelector';
import { Profile, Jobs, ProjectsJobs } from '@/App';
import { Socket } from 'socket.io-client';

// --- Drag and Drop Imports ---
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type ApiStatus = {
    status: 'loading' | 'success' | 'error';
    message: string;
    fullResponse?: any;
};

type AllJobs = Jobs | ProjectsJobs;
type ServiceType = 'desk' | 'projects';

interface DashboardLayoutProps {
  children: React.ReactNode;
  stats?: {
    totalTickets: number;
    totalToProcess: number;
    isProcessing: boolean;
  };
  onAddProfile: () => void;
  profiles: Profile[];
  selectedProfile: Profile | null;
  jobs: AllJobs;
  onProfileChange: (profileName: string) => void;
  apiStatus: ApiStatus;
  onShowStatus: () => void;
  onManualVerify: () => void;
  socket: Socket | null;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
  service?: ServiceType;
}

const SidebarNavLink = ({ to, children }: { to: string, children: React.ReactNode }) => (
    <NavLink
      to={to}
      end 
      className={({ isActive }) => cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary",
        isActive && "text-primary bg-primary/10"
      )}
    >
      {children}
    </NavLink>
);

const SidebarDivider = () => (
  <div className="px-4 py-2">
    <div className="border-t border-muted/50" />
  </div>
);

function SortableSection({ id, children, isFirst }: { id: string, children: React.ReactNode, isFirst: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <div {...attributes} {...listeners} className="absolute -left-1 top-4 cursor-grab active:cursor-grabbing p-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground z-10">
        <GripVertical className="h-3 w-3" />
      </div>
      <div>{!isFirst && <SidebarDivider />}{children}</div>
    </div>
  );
}

const DEFAULT_SECTIONS = [
  { id: 'desk', content: (<><h3 className="px-3 text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Zoho Desk</h3><SidebarNavLink to="/"> <Ticket className="h-4 w-4" /> Bulk Tickets</SidebarNavLink><SidebarNavLink to="/single-ticket"> <Ticket className="h-4 w-4" /> Single Ticket</SidebarNavLink></>) },
  { id: 'projects', content: (<><h3 className="px-3 text-xs font-semibold text-foreground uppercase tracking-wider mb-1">Zoho Projects</h3><p className="px-3 text-[11px] font-normal text-muted-foreground/90 italic mb-2">from name - subject and content</p><SidebarNavLink to="/projects-tasks"><FolderKanban className="h-4 w-4" /> Task Management</SidebarNavLink></>) }
];

const getSortedSections = (savedIds: string[]) => {
  if (!savedIds || savedIds.length === 0) return DEFAULT_SECTIONS;
  return [...DEFAULT_SECTIONS].sort((a, b) => {
    const aIndex = savedIds.indexOf(a.id);
    const bIndex = savedIds.indexOf(b.id);
    return (aIndex !== -1 ? aIndex : 999) - (bIndex !== -1 ? bIndex : 999);
  });
};

const ZOOM_LEVELS = [0.25, 0.50, 0.60, 0.70, 0.80, 0.90, 1.0, 1.10, 1.25, 1.50];

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  stats = { totalTickets: 0, totalToProcess: 0, isProcessing: false },
  onAddProfile,
  service, 
  ...profileSelectorProps 
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const progressPercent = stats.totalToProcess > 0 ? (stats.totalTickets / stats.totalToProcess) * 100 : 0;
  const isStatsPage = location.pathname === '/live-stats';

  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const [appZoom, setAppZoom] = useState(() => {
    try {
      const savedZoom = localStorage.getItem('zoho_app_zoom');
      if (savedZoom) return parseFloat(savedZoom);
    } catch (e) {}
    return 1.0; 
  });

  const [sections, setSections] = useState(() => {
    try {
      const cached = localStorage.getItem('zoho_sidebar_order');
      if (cached) return getSortedSections(JSON.parse(cached));
    } catch (e) {}
    return DEFAULT_SECTIONS;
  });

  useEffect(() => { localStorage.setItem('zoho_app_zoom', appZoom.toString()); }, [appZoom]);
  useEffect(() => {
    fetch('http://localhost:3000/api/sidebar-order').then(res => res.json()).then(savedIds => {
        if (savedIds && Array.isArray(savedIds) && savedIds.length > 0) {
          localStorage.setItem('zoho_sidebar_order', JSON.stringify(savedIds));
          setSections(getSortedSections(savedIds));
        }
      }).catch(() => {});
  }, []);

  useEffect(() => {
    if (sidebarScrollRef.current) {
      const savedScroll = sessionStorage.getItem('zoho_sidebar_scroll_pos');
      if (savedScroll) sidebarScrollRef.current.scrollTop = parseInt(savedScroll, 10);
    }
  }, [location.pathname]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => { sessionStorage.setItem('zoho_sidebar_scroll_pos', e.currentTarget.scrollTop.toString()); };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSections((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        const newList = arrayMove(items, oldIndex, newIndex);
        const newOrderIds = newList.map(i => i.id);
        localStorage.setItem('zoho_sidebar_order', JSON.stringify(newOrderIds));
        fetch('http://localhost:3000/api/sidebar-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newOrderIds) }).catch(() => {});
        return newList;
      });
    }
  };

  const inverseZoom = 1 / appZoom;

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
        <div 
        style={{ 
            transform: `scale(${appZoom})`, 
            transformOrigin: '0 0',
            width: `${inverseZoom * 100}%`,
            height: `${inverseZoom * 100}%`,
        }} 
        className="flex min-h-full"
        >
        <div className="hidden border-r bg-card md:flex flex-col w-[280px] lg:w-[340px] shrink-0 h-full">
            <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6 justify-between shrink-0">
                <div className="flex items-center gap-2 font-semibold">
                    <div className="p-2 bg-gradient-primary rounded-lg shadow-glow shrink-0">
                        <Ticket className="h-6 w-6 text-primary-foreground" />
                    </div>
                    <span className="truncate">Zoho Blaster</span>
                </div>
                <div className="shrink-0 ml-2">
                    <Select value={appZoom.toString()} onValueChange={(val) => setAppZoom(parseFloat(val))}>
                        <SelectTrigger className="h-7 w-[70px] text-xs bg-muted/50 border-border focus:ring-0 shadow-sm px-2">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {ZOOM_LEVELS.map((val) => (
                                <SelectItem key={val} value={val.toString()} className="text-xs">{Math.round(val * 100)}%</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            
            <div className="flex-1 overflow-auto py-2 mt-4" ref={sidebarScrollRef} onScroll={handleScroll}>
                <nav className="grid items-start px-2 text-sm font-medium lg:px-4 space-y-0">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                            {sections.map((section, index) => (
                                <SortableSection key={section.id} id={section.id} isFirst={index === 0}>{section.content}</SortableSection>
                            ))}
                        </SortableContext>
                    </DndContext>
                </nav>
            </div>

            <div className="p-4 border-t shrink-0">
                <Button size="sm" className="w-full" onClick={onAddProfile}><UserPlus className="h-4 w-4 mr-2" />Add Account</Button>
            </div>
        </div>
        
        <div className="flex flex-col min-w-0 flex-1 h-full overflow-hidden">
            <header className="flex min-h-[88px] py-3 items-center border-b bg-card px-4 lg:px-6 shrink-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                <div className="flex items-center justify-between w-full gap-8 min-w-max">
                    <div className="flex items-center shrink-0">
                        <ProfileSelector {...profileSelectorProps} service={service} />
                    </div>
                    <Button variant={isStatsPage ? "default" : "outline"} size="sm" className="hidden md:flex items-center gap-2 shrink-0" onClick={() => navigate('/live-stats')}>
                        <Activity className="h-4 w-4" /> Live Statistics
                    </Button>
                </div>
                {stats.isProcessing && stats.totalToProcess > 0 && (
                    <div className="absolute bottom-0 left-0 w-full">
                        <Progress value={progressPercent} className="h-1 w-full rounded-none bg-muted/50" />
                    </div>
                )}
            </header>
            <main className="flex-1 overflow-auto p-4 lg:p-6">
                {children}
            </main>
        </div>
        </div>
    </div>
  );
};