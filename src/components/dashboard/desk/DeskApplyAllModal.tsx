// --- FILE: src/components/dashboard/desk/DeskApplyAllModal.tsx ---

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { MessageSquare, Clock, Edit, Sparkles, Bot, CopyCheck, AlertTriangle, Mail, Hash } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface DeskApplyAllModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (data: any) => void;
}

export const DeskApplyAllModal: React.FC<DeskApplyAllModalProps> = ({ isOpen, onClose, onApply }) => {
  const [formData, setFormData] = useState({
    emails: '',
    subject: '',
    description: '',
    delay: '',
    stopAfterFailures: '', 
    sendDirectReply: false,
    verifyEmail: false,
    enableTracking: false,
    appendAccountNumber: false, // <--- NEW STATE FOR THE NUMBERING
    displayName: '',
    senderName: '',
  });

  const handleApply = () => {
    const updates: any = {};
    
    // Only apply text/number fields if they have content
    if (formData.emails.trim()) updates.emails = formData.emails; 
    if (formData.subject.trim()) updates.subject = formData.subject;
    if (formData.description.trim()) updates.description = formData.description;
    if (formData.delay !== '') updates.delay = Number(formData.delay);
    if (formData.stopAfterFailures !== '') updates.stopAfterFailures = Number(formData.stopAfterFailures); 
    if (formData.displayName.trim()) updates.displayName = formData.displayName;
    if (formData.senderName.trim()) updates.senderName = formData.senderName;
    
    // Checkboxes are always applied based on their state
    updates.sendDirectReply = formData.sendDirectReply;
    updates.verifyEmail = formData.verifyEmail;
    updates.enableTracking = formData.enableTracking;
    updates.appendAccountNumber = formData.appendAccountNumber; // <--- PASS IT TO THE BACKEND

    onApply(updates);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl bg-card border-border shadow-large max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-xl">
            <CopyCheck className="h-5 w-5 text-primary" />
            <span>Apply to All Accounts</span>
          </DialogTitle>
          <DialogDescription>
            Fields left blank will <strong>keep their existing data</strong>. Checkboxes will instantly overwrite existing settings on all accounts.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          
          {/* LEFT COLUMN */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center space-x-2">
                <Mail className="h-4 w-4" />
                <span>Recipient Emails</span>
              </Label>
              <Textarea 
                value={formData.emails} 
                onChange={(e) => setFormData({...formData, emails: e.target.value})}
                placeholder="user1@example.com&#10;user2@example.com&#10;(Leave blank to keep existing)"
                className="min-h-[100px] font-mono text-sm bg-muted/30 border-border focus:bg-card"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center space-x-2">
                <MessageSquare className="h-4 w-4" />
                <span>Ticket Subject</span>
              </Label>
              <Input 
                value={formData.subject} 
                onChange={(e) => setFormData({...formData, subject: e.target.value})}
                placeholder="Leave blank to keep existing..."
                className="bg-muted/30 border-border focus:bg-card"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="flex items-center space-x-2">
                <MessageSquare className="h-4 w-4" />
                <span>Ticket Description</span>
              </Label>
              <Textarea 
                value={formData.description} 
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Leave blank to keep existing HTML..."
                className="min-h-[160px] bg-muted/30 border-border focus:bg-card"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center space-x-2">
                  <Clock className="h-4 w-4" />
                  <span>Delay (Sec)</span>
                </Label>
                <Input 
                  type="number"
                  value={formData.delay} 
                  onChange={(e) => setFormData({...formData, delay: e.target.value})}
                  placeholder="Keep..."
                  className="bg-muted/30 border-border focus:bg-card"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center space-x-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span>Auto-Pause</span>
                </Label>
                <Input 
                  type="number"
                  min="0"
                  value={formData.stopAfterFailures} 
                  onChange={(e) => setFormData({...formData, stopAfterFailures: e.target.value})}
                  placeholder="Keep..."
                  className="bg-muted/30 border-border focus:bg-card"
                />
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center space-x-2">
                <Edit className="h-4 w-4" />
                <span>Sender Name (Native Zoho)</span>
              </Label>
              <Input 
                value={formData.displayName} 
                onChange={(e) => setFormData({...formData, displayName: e.target.value})}
                placeholder="Leave blank to keep existing..."
                className="bg-muted/30 border-border focus:bg-card"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-green-500" />
                <span>Sender Name (Deluge Workflow)</span>
              </Label>
              <Input 
                value={formData.senderName} 
                onChange={(e) => setFormData({...formData, senderName: e.target.value})}
                placeholder="Leave blank to keep existing..."
                className="bg-muted/30 border-border focus:bg-card"
              />
            </div>

            <div className="space-y-2 pt-2">
              <Label className="flex items-center space-x-2">
                <Bot className="h-4 w-4" />
                <span>Optional Email Actions</span>
              </Label>
              <div className="space-y-4 rounded-lg bg-muted/30 p-4 border border-border">
                
                {/* NEW: THE NUMBERING CHECKBOX */}
                <div className="flex items-start space-x-3">
                  <Checkbox 
                    id="apply-append-number" 
                    checked={formData.appendAccountNumber} 
                    onCheckedChange={(val) => setFormData({...formData, appendAccountNumber: !!val})} 
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="apply-append-number" className="font-medium hover:cursor-pointer flex items-center">
                      Append Account Number
                    </Label>
                    <p className="text-xs text-muted-foreground">Adds 1, 2, 3... to the very bottom of the description.</p>
                  </div>
                </div>

                <Separator className="my-2" />

                <div className="flex items-start space-x-3">
                  <Checkbox 
                    id="apply-direct-reply" 
                    checked={formData.sendDirectReply} 
                    onCheckedChange={(val) => setFormData({...formData, sendDirectReply: !!val})} 
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="apply-direct-reply" className="font-medium hover:cursor-pointer">Send Direct Public Reply</Label>
                    <p className="text-xs text-muted-foreground">Disables automation. Sends description as email.</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <Checkbox 
                    id="apply-verify-email" 
                    checked={formData.verifyEmail} 
                    onCheckedChange={(val) => setFormData({...formData, verifyEmail: !!val})} 
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="apply-verify-email" className="font-medium hover:cursor-pointer">Verify Automation Email</Label>
                    <p className="text-xs text-muted-foreground">Slower. Checks if automation was triggered.</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <Checkbox 
                    id="apply-tracking" 
                    checked={formData.enableTracking} 
                    onCheckedChange={(val) => setFormData({...formData, enableTracking: !!val})} 
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="apply-tracking" className="font-medium hover:cursor-pointer">Inject Cloudflare Tracker</Label>
                    <p className="text-xs text-muted-foreground">Appends invisible 1x1 pixel to detect opens instantly.</p>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleApply} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
            <CopyCheck className="h-4 w-4 mr-2" /> Apply to All Accounts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};