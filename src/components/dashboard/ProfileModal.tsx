// --- FILE: src/components/dashboard/ProfileModal.tsx ---

import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Profile } from '@/App';
import { useToast } from '@/hooks/use-toast';
import { KeyRound, Loader2, Building, FolderKanban, Search, Trash2, Radar } from 'lucide-react'; 
import { Socket } from 'socket.io-client';
import { Separator } from '../ui/separator';
import { ScrollArea } from '../ui/scroll-area';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (profileData: Profile, originalProfileName?: string) => void;
  profile: Profile | null;
  socket: Socket | null;
}

const SERVER_URL = "http://localhost:3000";

interface Portal {
  id: string;
  portal_name: string;
  [key: string]: any; 
}

const getInitialFormData = (): Profile & { imapSettings?: any[] } => ({
  profileName: '',
  clientId: '',
  clientSecret: '',
  refreshToken: '',
  desk: {
    orgId: '',
    defaultDepartmentId: '',
    fromEmailAddress: '',
    mailReplyAddressId: '',
    cloudflareTrackingUrl: '', 
  },
  projects: {
    portalId: '',
    cloudflareTrackingUrl: '', 
  },
  imapSettings: [
    { email: '', password: '', host: 'imap-mail.outlook.com' },
    { email: '', password: '', host: 'imap-mail.outlook.com' },
    { email: '', password: '', host: 'imap-mail.outlook.com' },
    { email: '', password: '', host: 'imap-mail.outlook.com' }
  ]
});

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, onSave, profile, socket }) => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [formData, setFormData] = useState<any>(getInitialFormData());
  
  const formDataRef = useRef(formData);
  useEffect(() => { formDataRef.current = formData; }, [formData]);

  const [isFetchingPortals, setIsFetchingPortals] = useState(false);
  const [portalList, setPortalList] = useState<Portal[]>([]);
  const [isPortalModalOpen, setIsPortalModalOpen] = useState(false);

  const [isFetchingDesk, setIsFetchingDesk] = useState(false);
  const [deskOrgList, setDeskOrgList] = useState<any[]>([]);
  const [isDeskOrgModalOpen, setIsDeskOrgModalOpen] = useState(false);
  
  const [deskDepList, setDeskDepList] = useState<any[]>([]);
  const [isDeskDepModalOpen, setIsDeskDepModalOpen] = useState(false);
  
  const [deskMailList, setDeskMailList] = useState<any[]>([]);
  const [isDeskMailModalOpen, setIsDeskMailModalOpen] = useState(false);

  const getCacheBusterProfile = () => ({
      ...formDataRef.current,
      profileName: `temp_bypass_cache_${Date.now()}`
  });

  useEffect(() => {
    if (isOpen) {
        if (profile) {
            setFormData({
                ...getInitialFormData(),
                ...profile,
                desk: { ...getInitialFormData().desk, ...profile.desk },
                projects: { ...getInitialFormData().projects, ...profile.projects },
                imapSettings: (profile as any).imapSettings?.length ? (profile as any).imapSettings : getInitialFormData().imapSettings
            });
        } else {
            setFormData(getInitialFormData());
        }
    }
  }, [profile, isOpen]);

  useEffect(() => {
    if (!socket || !isOpen) return;

    const handleTokenReceived = (data: { refreshToken: string }) => {
      setFormData((prev: any) => ({ ...prev, refreshToken: data.refreshToken }));
      setIsGenerating(false);
      toast({ title: "Success!", description: "Refresh token has been populated." });
    };

    const handleTokenError = (data: { error: string }) => {
        setIsGenerating(false);
        toast({ title: "Token Generation Error", description: data.error, variant: "destructive" });
    }

    const handlePortalsResult = (data: { portals: Portal[] }) => {
        setIsFetchingPortals(false);
        const portals = data.portals;

        if (!portals || portals.length === 0) {
            toast({ title: "No Portals Found", description: "No Zoho Projects portals are associated with this account.", variant: "destructive" });
            return;
        }

        if (portals.length === 1) {
            const portalId = portals[0].id;
            setFormData((prev: any) => ({ 
                ...prev, 
                projects: { ...(prev.projects as object), portalId } 
            }));
            toast({ title: "Success!", description: `Portal ID ${portalId} was auto-filled.` });
            return;
        }

        setPortalList(portals);
        setIsPortalModalOpen(true);
        toast({ title: "Multiple Portals Found", description: "Please select your portal from the list." });
    };

    const handlePortalsError = (data: { message: string }) => {
        setIsFetchingPortals(false);
        toast({ title: "Error Fetching Portals", description: data.message, variant: "destructive" });
    };

    const handleDeskOrgsResult = (data: { success: boolean, organizations: any[] }) => {
        if (!data.success || !data.organizations || data.organizations.length === 0) {
            setIsFetchingDesk(false);
            toast({ title: "No Organizations Found", description: "No Zoho Desk Orgs found.", variant: "destructive" });
            return;
        }
        if (data.organizations.length === 1) {
            const org = data.organizations[0];
            setFormData((prev: any) => ({ ...prev, desk: { ...(prev.desk as object), orgId: org.id.toString() } }));
            
            socket.emit('getDeskDepartments', {
                activeProfile: getCacheBusterProfile(),
                orgId: org.id
            });
        } else {
            setIsFetchingDesk(false);
            setDeskOrgList(data.organizations);
            setIsDeskOrgModalOpen(true);
        }
    };

    const handleDeskDepsResult = (data: { success: boolean, departments: any[] }) => {
        if (!data.success || !data.departments || data.departments.length === 0) {
            setIsFetchingDesk(false);
            toast({ title: "No Departments Found", variant: "destructive" });
            return;
        }
        if (data.departments.length === 1) {
            const dep = data.departments[0];
            setFormData((prev: any) => ({ ...prev, desk: { ...(prev.desk as object), defaultDepartmentId: dep.id.toString() } }));
            
            socket.emit('getDeskMailAddresses', {
                activeProfile: getCacheBusterProfile(),
                orgId: formDataRef.current.desk?.orgId || '',
                departmentId: dep.id
            });
        } else {
            setIsFetchingDesk(false);
            setDeskDepList(data.departments);
            setIsDeskDepModalOpen(true);
        }
    };

    const handleDeskMailsResult = (data: { success: boolean, mailAddresses: any[] }) => {
        setIsFetchingDesk(false);
        if (!data.success || !data.mailAddresses || data.mailAddresses.length === 0) {
            toast({ title: "No Mail Addresses Found", variant: "destructive" });
            return;
        }
        if (data.mailAddresses.length === 1) {
            const mail = data.mailAddresses[0];
            setFormData((prev: any) => ({ 
                ...prev, 
                desk: { ...(prev.desk as object), mailReplyAddressId: mail.id.toString(), fromEmailAddress: mail.address } 
            }));
            toast({ title: "Desk Auto-Fetch Complete!", description: "All settings automatically populated." });
        } else {
            setDeskMailList(data.mailAddresses);
            setIsDeskMailModalOpen(true);
        }
    };

    const handleDeskError = (data: { message: string }) => {
        setIsFetchingDesk(false);
        toast({ title: "Desk Fetch Error", description: data.message, variant: "destructive" });
    };

    socket.on('zoho-refresh-token', handleTokenReceived);
    socket.on('zoho-refresh-token-error', handleTokenError);
    socket.on('projectsPortalsResult', handlePortalsResult);
    socket.on('projectsPortalsError', handlePortalsError);
    
    socket.on('deskOrganizationsResult', handleDeskOrgsResult);
    socket.on('deskDepartmentsResult', handleDeskDepsResult);
    socket.on('deskMailAddressesResult', handleDeskMailsResult);
    socket.on('deskOrganizationsError', handleDeskError);
    socket.on('deskDepartmentsError', handleDeskError);
    socket.on('deskMailAddressesError', handleDeskError);

    return () => {
      socket.off('zoho-refresh-token', handleTokenReceived);
      socket.off('zoho-refresh-token-error', handleTokenError);
      socket.off('projectsPortalsResult', handlePortalsResult);
      socket.off('projectsPortalsError', handlePortalsError);
      socket.off('deskOrganizationsResult', handleDeskOrgsResult);
      socket.off('deskDepartmentsResult', handleDeskDepsResult);
      socket.off('deskMailAddressesResult', handleDeskMailsResult);
      socket.off('deskOrganizationsError', handleDeskError);
      socket.off('deskDepartmentsError', handleDeskError);
      socket.off('deskMailAddressesError', handleDeskError);
    };
  }, [socket, isOpen, toast]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleNestedChange = (service: 'desk' | 'projects', e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({
        ...prev,
        [service]: {
            ...(prev[service] as object),
            [name]: value,
        }
    }));
  };

  const handleImapChange = (index: number, field: string, value: string) => {
    setFormData((prev: any) => {
      const newImap = [...(prev.imapSettings || [])];
      if (!newImap[index]) newImap[index] = { email: '', password: '', host: 'imap-mail.outlook.com' };
      newImap[index][field] = value;
      return { ...prev, imapSettings: newImap };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData, profile?.profileName);
  };

  const handleClearForm = () => {
    if (window.confirm("Are you sure you want to clear all fields? This will reset the form so you can add a fresh account without cache issues.")) {
        setFormData(getInitialFormData());
    }
  };

  const handleGenerateToken = async () => {
    if (!formData.clientId || !formData.clientSecret) {
      toast({
        title: "Missing Information",
        description: "Please enter a Client ID and Client Secret first.",
        variant: "destructive",
      });
      return;
    }
    if (!socket) {
        toast({ title: "Error", description: "Not connected to the server.", variant: "destructive" });
        return;
    }
   
    setIsGenerating(true);

    try {
      const response = await fetch(`${SERVER_URL}/api/zoho/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            clientId: formData.clientId, 
            clientSecret: formData.clientSecret,
            socketId: socket.id 
        }),
      });
      if (!response.ok) throw new Error("Failed to get auth URL from server.");

      const { authUrl } = await response.json();
      window.open(authUrl, '_blank', 'width=600,height=700');

    } catch (error) {
      toast({ title: "Error", description: "Could not initiate authorization.", variant: "destructive" });
      setIsGenerating(false);
    }
  };

  const handleFetchPortals = () => {
    if (!formData.clientId || !formData.clientSecret || !formData.refreshToken) {
        toast({
            title: "Missing Credentials",
            description: "Client ID, Client Secret, and Refresh Token are required to fetch portals.",
            variant: "destructive",
        });
        return;
    }
    if (!socket) {
        toast({ title: "Error", description: "Not connected to the server.", variant: "destructive" });
        return;
    }

    setIsFetchingPortals(true);
    socket.emit('getProjectsPortals', {
        clientId: formData.clientId,
        clientSecret: formData.clientSecret,
        refreshToken: formData.refreshToken,
        profileName: `temp_bypass_cache_${Date.now()}`
    });
  };

  const handleFetchDesk = () => {
    if (!formData.clientId || !formData.clientSecret || !formData.refreshToken) {
        toast({ title: "Missing Credentials", description: "Generate a Refresh Token first.", variant: "destructive" });
        return;
    }
    setIsFetchingDesk(true);
    socket?.emit('getDeskOrganizations', {
        activeProfile: getCacheBusterProfile()
    });
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-start pr-8">
            <div>
              <DialogTitle>{profile ? 'Edit Profile' : 'Add New Profile'}</DialogTitle>
              <DialogDescription>
                Enter the shared credentials and service-specific settings for this Zoho account.
              </DialogDescription>
            </div>
            {!profile && (
              <Button type="button" variant="outline" size="sm" onClick={handleClearForm} className="text-red-500 border-red-200 hover:bg-red-50 mt-1">
                <Trash2 className="h-4 w-4 mr-2" /> Clear Form
              </Button>
            )}
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="profileName" className="text-right">Profile Name</Label>
              <Input id="profileName" name="profileName" value={formData.profileName} onChange={handleChange} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="clientId" className="text-right">Client ID</Label>
              <Input id="clientId" name="clientId" value={formData.clientId} onChange={handleChange} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="clientSecret" className="text-right">Client Secret</Label>
              <Input id="clientSecret" name="clientSecret" value={formData.clientSecret} onChange={handleChange} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="refreshToken" className="text-right">Refresh Token</Label>
              <div className="col-span-3 flex items-center gap-2">
                <Input id="refreshToken" name="refreshToken" value={formData.refreshToken} onChange={handleChange} className="flex-1" required />
                <Button type="button" variant="outline" onClick={handleGenerateToken} disabled={isGenerating}>
                   {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
                  Generate
                </Button>
              </div>
            </div>
          </div>
         
          <Separator className="my-4" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold mb-4 flex items-center justify-between">
                  <span className="flex items-center">
                    <Building className="h-4 w-4 mr-2" />
                    Zoho Desk Settings
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={handleFetchDesk} disabled={isFetchingDesk}>
                      {isFetchingDesk ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                      Auto Fetch
                  </Button>
                </h4>
                <div className="grid gap-4 pl-4 border-l-2 ml-2">
                    <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="desk_orgId" className="text-right">Org ID</Label>
                    <Input id="desk_orgId" name="orgId" value={formData.desk?.orgId || ''} onChange={(e) => handleNestedChange('desk', e)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="defaultDepartmentId" className="text-right">Department ID</Label>
                    <Input id="defaultDepartmentId" name="defaultDepartmentId" value={formData.desk?.defaultDepartmentId || ''} onChange={(e) => handleNestedChange('desk', e)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="fromEmailAddress" className="text-right">From Email</Label>
                    <Input id="fromEmailAddress" name="fromEmailAddress" value={formData.desk?.fromEmailAddress || ''} onChange={(e) => handleNestedChange('desk', e)} className="col-span-3" placeholder="e.g., support@yourco.zohodesk.com" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="mailReplyAddressId" className="text-right">Mail Reply ID</Label>
                    <Input id="mailReplyAddressId" name="mailReplyAddressId" value={formData.desk?.mailReplyAddressId || ''} onChange={(e) => handleNestedChange('desk', e)} className="col-span-3" placeholder="(Optional)" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="cloudflareTrackingUrl" className="text-right flex flex-col">
                            <span>Tracker URL</span>
                            <span className="text-[9px] text-muted-foreground">Cloudflare Worker</span>
                        </Label>
                        <Input id="cloudflareTrackingUrl" name="cloudflareTrackingUrl" value={formData.desk?.cloudflareTrackingUrl || ''} onChange={(e) => handleNestedChange('desk', e)} className="col-span-3" placeholder="https://zoho-tracker...workers.dev" />
                    </div>
                </div>
              </div>
            </div>
           
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold mb-4 flex items-center">
                  <FolderKanban className="h-4 w-4 mr-2" />
                  Zoho Projects Settings
                </h4>
                <div className="grid gap-4 pl-4 border-l-2 ml-2">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="projects_portalId" className="text-right">Portal ID</Label>
                      <div className="col-span-3 flex items-center gap-2">
                          <Input id="projects_portalId" name="portalId" value={formData.projects?.portalId || ''} onChange={(e) => handleNestedChange('projects', e)} className="flex-1" />
                          <Button type="button" variant="outline" size="sm" onClick={handleFetchPortals} disabled={isFetchingPortals}>
                              {isFetchingPortals ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                              <span className="ml-2 hidden sm:inline">Fetch</span>
                          </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="projects_cloudflareTrackingUrl" className="text-right flex flex-col">
                            <span>Tracker URL</span>
                            <span className="text-[9px] text-muted-foreground">Cloudflare Worker</span>
                        </Label>
                        <Input id="projects_cloudflareTrackingUrl" name="cloudflareTrackingUrl" value={formData.projects?.cloudflareTrackingUrl || ''} onChange={(e) => handleNestedChange('projects', e)} className="col-span-3" placeholder="https://project-tracker...workers.dev" />
                    </div>
                </div>
              </div>
            </div>
          </div>

          <Separator className="my-6" />
          <div>
            <h4 className="text-lg font-semibold mb-2 flex items-center text-indigo-500">
              <Radar className="h-5 w-5 mr-2" />
              Inbox Radar (IMAP Test Accounts)
            </h4>
            <p className="text-sm text-muted-foreground mb-4">
              Add up to 4 Outlook/Hotmail accounts to test inbox placement specifically for this Zoho account. Ensure you use an <strong>App Password</strong>, not your regular password!
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map(idx => (
                <div key={idx} className="p-4 border border-border rounded-lg bg-muted/20 space-y-3 shadow-sm">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Test Inbox {idx + 1}
                  </Label>
                  <div className="space-y-3">
                    <Input
                      placeholder="test@outlook.com"
                      value={formData.imapSettings?.[idx]?.email || ''}
                      onChange={e => handleImapChange(idx, 'email', e.target.value)}
                      className="bg-card"
                    />
                    <Input
                      type="password"
                      placeholder="App Password"
                      value={formData.imapSettings?.[idx]?.password || ''}
                      onChange={e => handleImapChange(idx, 'password', e.target.value)}
                      className="bg-card"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-8">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Save Profile</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <PortalSelectorModal
        isOpen={isPortalModalOpen}
        onClose={() => setIsPortalModalOpen(false)}
        portals={portalList}
        onSelect={(portalId) => {
            setFormData((prev: any) => ({ 
                ...prev, 
                projects: { ...(prev.projects as object), portalId } 
            }));
            setIsPortalModalOpen(false);
        }}
    />

    <GenericSelectorModal
        isOpen={isDeskOrgModalOpen}
        onClose={() => setIsDeskOrgModalOpen(false)}
        title="Select Zoho Desk Organization"
        description="Multiple organizations found. Please select one."
        items={deskOrgList}
        displayKey="companyName"
        onSelect={(org) => {
            setFormData((prev: any) => ({ ...prev, desk: { ...(prev.desk as object), orgId: org.id.toString() } }));
            setIsDeskOrgModalOpen(false);
            setIsFetchingDesk(true);
            socket?.emit('getDeskDepartments', {
                activeProfile: getCacheBusterProfile(),
                orgId: org.id
            });
        }}
    />

    <GenericSelectorModal
        isOpen={isDeskDepModalOpen}
        onClose={() => setIsDeskDepModalOpen(false)}
        title="Select Default Department"
        description="Please select a default department for tickets."
        items={deskDepList}
        displayKey="name"
        onSelect={(dep) => {
            setFormData((prev: any) => ({ ...prev, desk: { ...(prev.desk as object), defaultDepartmentId: dep.id.toString() } }));
            setIsDeskDepModalOpen(false);
            setIsFetchingDesk(true);
            socket?.emit('getDeskMailAddresses', {
                activeProfile: getCacheBusterProfile(),
                orgId: formDataRef.current.desk?.orgId || '',
                departmentId: dep.id
            });
        }}
    />

    <GenericSelectorModal
        isOpen={isDeskMailModalOpen}
        onClose={() => setIsDeskMailModalOpen(false)}
        title="Select Send/Reply Address"
        description="Please select the mail address to use as Sender."
        items={deskMailList}
        displayKey="address"
        onSelect={(mail) => {
            setFormData((prev: any) => ({ 
                ...prev, 
                desk: { ...(prev.desk as object), mailReplyAddressId: mail.id.toString(), fromEmailAddress: mail.address } 
            }));
            setIsDeskMailModalOpen(false);
            toast({ title: "Success!", description: "Zoho Desk details filled successfully." });
        }}
    />
    </>
  );
};

interface PortalSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    portals: Portal[];
    onSelect: (portalId: string) => void;
}

const PortalSelectorModal: React.FC<PortalSelectorModalProps> = ({ isOpen, onClose, portals, onSelect }) => {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Select Your Portal</DialogTitle>
                    <DialogDescription>
                        Multiple portals were found. Please choose the one you want to use.
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-60">
                    <div className="space-y-2 p-1">
                        {portals.map((portal) => (
                            <Button
                                key={portal.id}
                                variant="ghost"
                                className="w-full justify-start"
                                onClick={() => onSelect(portal.id)}
                            >
                                {portal.portal_name}
                            </Button>
                        ))}
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

interface GenericSelectorModalProps {
    isOpen: boolean;
    title: string;
    description: string;
    items: any[];
    displayKey: string;
    onSelect: (item: any) => void;
    onClose: () => void;
}

const GenericSelectorModal: React.FC<GenericSelectorModalProps> = ({ isOpen, onClose, title, description, items, displayKey, onSelect }) => {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-60">
                    <div className="space-y-2 p-1">
                        {items.map((item, idx) => (
                            <Button
                                key={item.id || idx}
                                variant="ghost"
                                className="w-full justify-start"
                                onClick={() => onSelect(item)}
                            >
                                {item[displayKey] || `Item ${item.id}`}
                            </Button>
                        ))}
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};