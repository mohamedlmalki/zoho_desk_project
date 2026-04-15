import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Activity, Rocket, Users, Database, Trash2 } from 'lucide-react';

export default function SpeedTest() {
    const { toast } = useToast();
    const navigate = useNavigate();
    
    const [total, setTotal] = useState(10000);
    const [batch, setBatch] = useState(100);
    const [profiles, setProfiles] = useState(1);
    const [isRunning, setIsRunning] = useState(false);

    const startTest = async () => {
        setIsRunning(true);
        toast({ title: "Stress Test Fired! 🚀", description: "Teleporting to dashboard..." });
        
        try {
            // Send the request to the server
            fetch(`http://localhost:3000/api/test-speed?total=${total}&batch=${batch}&profiles=${profiles}`)
                .catch(e => console.log("Silent fetch warning ignored"));
            
            // Wait half a second before teleporting so the browser doesn't panic
            setTimeout(() => {
                navigate('/');
            }, 500);

        } catch (error) {
            toast({ title: "Error", description: "Could not reach the server.", variant: "destructive" });
        }
        
        setTimeout(() => setIsRunning(false), 2000);
    };

    const stopAndReset = async () => {
        try {
            fetch('http://localhost:3000/api/test-stop').catch(e => console.log(e));
            localStorage.clear();
            toast({ title: "Test Killed & Cache Cleared!", variant: "destructive" });
            setTimeout(() => { window.location.href = '/'; }, 800);
        } catch (error) {
            toast({ title: "Error", description: "Could not reach the server.", variant: "destructive" });
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 p-8 flex justify-center items-center">
            <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200 max-w-2xl w-full">
                
                <div className="flex items-center gap-3 mb-6 border-b pb-4">
                    <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg"><Activity size={24} /></div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">System Stress Test</h1>
                        <p className="text-slate-500 text-sm">Safely test UI performance without using Zoho API limits.</p>
                    </div>
                </div>

                <div className="space-y-8">
                    {/* INPUT 1: Total Tickets */}
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-2 mb-2">
                            <Database className="text-blue-500" size={18} />
                            <Label className="font-semibold text-lg">Total Tickets to Generate</Label>
                        </div>
                        <p className="text-sm text-slate-500 mb-3">How heavy is the job? A standard heavy job is 5,000. An extreme test is 50,000.</p>
                        <Input type="number" value={total} onChange={(e) => setTotal(Number(e.target.value))} className="text-lg" />
                    </div>

                    {/* INPUT 2: Speed (Batch) */}
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-2 mb-2">
                            <Rocket className="text-orange-500" size={18} />
                            <Label className="font-semibold text-lg">Speed (Tickets per 100ms)</Label>
                        </div>
                        <p className="text-sm text-slate-500 mb-3">How fast is the server sending data? <b>10</b> = Very Fast (100/sec). <b>100</b> = Lightning (1,000/sec). <b>1000</b> = Matrix Mode (10,000/sec).</p>
                        <Input type="number" value={batch} onChange={(e) => setBatch(Number(e.target.value))} className="text-lg" />
                    </div>

                    {/* INPUT 3: Multiple Accounts */}
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-2 mb-2">
                            <Users className="text-emerald-500" size={18} />
                            <Label className="font-semibold text-lg">Concurrent Accounts</Label>
                        </div>
                        <p className="text-sm text-slate-500 mb-3">Simulate multiple profiles running jobs at the exact same time.</p>
                        <Input type="number" value={profiles} onChange={(e) => setProfiles(Number(e.target.value))} className="text-lg" />
                    </div>

                    <div className="flex gap-4 pt-4">
                        <Button 
                            onClick={startTest} 
                            disabled={isRunning} 
                            className="flex-1 h-14 text-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg"
                        >
                            {isRunning ? "Starting..." : "🚀 FIRE STRESS TEST"}
                        </Button>
                        
                        <Button 
                            onClick={stopAndReset}
                            variant="destructive"
                            className="w-16 h-14 rounded-xl flex items-center justify-center shadow-md hover:shadow-lg"
                            title="Stop test and clear all cache data"
                        >
                            <Trash2 size={24} />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}