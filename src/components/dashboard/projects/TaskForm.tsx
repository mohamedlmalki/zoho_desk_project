// --- FILE: src/components/dashboard/projects/TaskForm.tsx (FINAL CORRECTED) ---
import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ZohoProject } from './ProjectsDataTypes';
import { Socket } from 'socket.io-client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const taskFormSchema = z.object({
  projectId: z.string().min(1, 'Please select a project.'),
  tasklistId: z.string().min(1, 'Task List ID is required.'),
  name: z.string().min(1, 'Task name is required.'),
  description: z.string().optional(),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

interface TaskFormProps {
  selectedProfileName: string | null;
  projects: ZohoProject[];
  socket: Socket | null;
  onCreateTask: () => void;
  autoFilledTaskListId: string;
}

const SERVER_URL = 'http://localhost:3000';

export const TaskForm: React.FC<TaskFormProps> = ({
  selectedProfileName,
  projects,
  socket,
  onCreateTask,
  autoFilledTaskListId,
}) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      projectId: '',
      tasklistId: '',
      name: '',
      description: '',
    },
  });

  const selectedProjectId = form.watch('projectId');

  useEffect(() => {
    form.setValue('tasklistId', autoFilledTaskListId);
  }, [autoFilledTaskListId, form.setValue]);
  
  useEffect(() => {
    // We only clear the tasklistId if the projectId changes
    // But we don't want to clear it if autoFilledTaskListId is just about to be set
    if (!autoFilledTaskListId) {
       form.setValue('tasklistId', '');
    }
  }, [selectedProjectId, autoFilledTaskListId, form.setValue]);


  async function onSubmit(data: TaskFormValues) {
    if (!selectedProfileName) {
      setApiError('No profile selected. Please select a profile from the dropdown.');
      return;
    }
    setIsLoading(true);
    setApiError(null);

    const profile = (await (await fetch(`${SERVER_URL}/api/profiles`)).json()).find(
      (p: any) => p.profileName === selectedProfileName
    );
    const portalId = profile?.projects?.portalId;

    if (!portalId) {
      setApiError('Portal ID is not configured for this profile.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${SERVER_URL}/api/projects/tasks/single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedProfileName: selectedProfileName,
          portalId: portalId,
          projectId: data.projectId,
          tasklistId: data.tasklistId,
          taskName: data.name,
          taskDescription: data.description,
        }),
      });

      const result = await response.json();
      setIsLoading(false);

      if (result.success) {
        toast({
          title: 'Task Created Successfully!',
          description: result.message,
        });
        form.reset({
          projectId: data.projectId, // Keep project selected
          tasklistId: data.tasklistId, // Keep tasklist ID
          name: '', // Clear task name
          description: '', // Clear description
        });
        onCreateTask(); // Refresh the task list in the "View Tasks" tab
      } else {
        setApiError(result.error || 'An unknown error occurred.');
        toast({
          title: 'Error Creating Task',
          description: result.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      setIsLoading(false);
      const errorMessage = (error as Error).message;
      setApiError(errorMessage);
      toast({
        title: 'Network Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  }

  return (
    // --- THIS IS THE FIX: Removed "max-w-2xl" from the className ---
    <Card>
      <CardHeader>
        <CardTitle>Create Single Task</CardTitle>
        <CardDescription>
          Fill in the details to create a new task in Zoho Projects.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a project" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tasklistId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task List ID (Automatic)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={form.getValues('projectId') ? "Loading from 'View Tasks'..." : "Select a project first"}
                      {...field}
                      readOnly // Make it read-only
                      className="text-muted-foreground"
                    />
                  </FormControl>
                  <FormDescription>
                    This ID is filled automatically from the tasks in your 'View Tasks' tab.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Design homepage mockup" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add more details about the task..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {apiError && (
                <Alert variant="destructive">
                    <AlertDescription>{apiError}</AlertDescription>
                </Alert>
            )}

            <Button type="submit" disabled={isLoading || !form.getValues('tasklistId')}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? "Creating..." : "Create Task"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};