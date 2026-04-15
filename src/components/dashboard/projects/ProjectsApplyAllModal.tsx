// --- FILE: src/components/dashboard/projects/ProjectsApplyAllModal.tsx ---
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { CopyCheck, Clock, AlertTriangle, Activity, ListChecks, Edit, SplitSquareHorizontal, Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface ProjectsApplyAllModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (data: any) => Promise<void> | void;
  isApplying: boolean; 
}

export const ProjectsApplyAllModal: React.FC<ProjectsApplyAllModalProps> = ({ isOpen, onClose, onApply, isApplying }) => {
  const [formData, setFormData] = useState({
    primaryValues: '', 
    smartSplitterText: '', 
    delay: '',
    stopAfterFailures: '',
    displayName: '', 
    enableTracking: false,
    appendAccountNumber: false,
  });

  useEffect(() => {
    if (isOpen) {
      setFormData({
        primaryValues: '', 
        smartSplitterText: '', 
        delay: '',
        stopAfterFailures: '',
        displayName: '', 
        enableTracking: false,
        appendAccountNumber: false,
      });
    }
  }, [isOpen]);

  const handleApply = async () => {
    const updates: any = {};
    
    if (formData.primaryValues.trim()) updates.primaryValues = formData.primaryValues;
    if (formData.smartSplitterText.trim()) updates.smartSplitterText = formData.smartSplitterText;
    
    if (formData.delay !== '') updates.delay = Number(formData.delay);
    if (formData.stopAfterFailures !== '') updates.stopAfterFailures = Number(formData.stopAfterFailures);
    if (formData.displayName.trim()) updates.displayName = formData.displayName;
    
    updates.enableTracking = formData.enableTracking;
    updates.appendAccountNumber = formData.appendAccountNumber;

    // 🚨 LOGGING EXACTLY WHAT IS LEAVING THE POPUP
    console.log(`\n🟢 [POPUP] Clicking Apply... Sending these updates:`, updates);

    await onApply(updates);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isApplying && !open && onClose()}>
      <DialogContent className="max-w-4xl bg-card border-border shadow-large max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-xl">
            <CopyCheck className="h-5 w-5 text-primary" />
            <span>Apply Projects Settings to All Accounts</span>
          </DialogTitle>
          <DialogDescription>
            Leave boxes empty if you want to keep the existing data on other accounts. Checkboxes will be forcefully applied everywhere.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          
          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="flex items-center space-x-2 text-indigo-700 dark:text-indigo-300 font-bold">
                <ListChecks className="h-4 w-4" />
                <span>Primary Field Values (Task Names)</span>
              </Label>
              <Textarea 
                value={formData.primaryValues} 
                onChange={(e) => setFormData({...formData, primaryValues: e.target.value})}
                placeholder="Task Name 1&#10;Task Name 2"
                className="min-h-[120px] font-mono text-sm bg-muted/30"
                disabled={isApplying}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center space-x-2 text-purple-700 dark:text-purple-300 font-bold">
                <SplitSquareHorizontal className="h-4 w-4" />
                <span>Smart Text Splitter (Large Body Text)</span>
              </Label>
              <Textarea 
                value={formData.smartSplitterText} 
                onChange={(e) => setFormData({...formData, smartSplitterText: e.target.value})}
                placeholder="Paste the large text here that you want split across custom fields..."
                className="min-h-[120px] font-mono text-sm bg-muted/30"
                disabled={isApplying}
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="flex items-center space-x-2 font-bold">
                <Edit className="h-4 w-4" />
                <span>Active Project Name</span>
              </Label>
              <Input 
                value={formData.displayName} 
                onChange={(e) => setFormData({...formData, displayName: e.target.value})}
                placeholder="Type here to override project name..."
                className="bg-muted/30"
                disabled={isApplying}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Acts like 'Sender Name'. You still need to click the Save icon on the dashboard to push this to Zoho.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <Label className="flex items-center space-x-2 font-bold">
                  <Clock className="h-4 w-4" />
                  <span>Delay (Sec)</span>
                </Label>
                <Input 
                  type="number"
                  value={formData.delay} 
                  onChange={(e) => setFormData({...formData, delay: e.target.value})}
                  placeholder="e.g. 5"
                  className="bg-muted/30"
                  disabled={isApplying}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center space-x-2 font-bold">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span>Auto-Pause</span>
                </Label>
                <Input 
                  type="number"
                  min="0"
                  value={formData.stopAfterFailures} 
                  onChange={(e) => setFormData({...formData, stopAfterFailures: e.target.value})}
                  placeholder="e.g. 4"
                  className="bg-muted/30"
                  disabled={isApplying}
                />
              </div>
            </div>

            <div className="space-y-2 pt-4">
              <Label className="flex items-center space-x-2 font-bold">
                <Activity className="h-4 w-4" />
                <span>Optional Actions (Forces True/False)</span>
              </Label>
              <div className="space-y-4 rounded-lg bg-muted/30 p-4 border border-border">
                
                <div className="flex items-start space-x-3">
                  <Checkbox 
                    id="projects-apply-append-number" 
                    checked={formData.appendAccountNumber} 
                    onCheckedChange={(val) => setFormData({...formData, appendAccountNumber: !!val})} 
                    disabled={isApplying}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="projects-apply-append-number" className="font-medium hover:cursor-pointer flex items-center">
                      Append Account Info to Fields
                    </Label>
                    <p className="text-xs text-muted-foreground">Injects Account Name at the top and Account Number at the bottom of all split fields.</p>
                  </div>
                </div>

                <Separator className="my-2" />

                <div className="flex items-start space-x-3">
                  <Checkbox 
                    id="projects-apply-tracking" 
                    checked={formData.enableTracking} 
                    onCheckedChange={(val) => setFormData({...formData, enableTracking: !!val})} 
                    disabled={isApplying}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="projects-apply-tracking" className="font-medium hover:cursor-pointer text-blue-500">Enable Cloudflare Tracking</Label>
                    <p className="text-xs text-muted-foreground">Appends the invisible 1x1 tracking pixel to tasks.</p>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-4 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={isApplying}>Cancel</Button>
          <Button onClick={handleApply} disabled={isApplying} className="bg-purple-600 hover:bg-purple-700 text-white font-bold">
            {isApplying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CopyCheck className="h-4 w-4 mr-2" />}
            {isApplying ? 'Applying...' : 'Apply to All Accounts'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};