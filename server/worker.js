// --- FILE: server/worker.js ---
const { Worker, Queue } = require('bullmq');
const IORedis = require('ioredis');
const terminalUi = require('./terminal-ui');

const connection = new IORedis({ host: '127.0.0.1', port: 6379, maxRetriesPerRequest: null });

let ioInstance = null; 
const activeCashiers = {}; 

const setSocketIo = (io) => { ioInstance = io; };

const hireCashier = (profileName) => {
    const queueName = `ticketQueue_${profileName}`;
    if (activeCashiers[queueName]) return;

    const deskHandler = require('./desk-handler');
    const accountQueue = new Queue(queueName, { connection });

    const worker = new Worker(queueName, async (job) => {
        const activeJobs = deskHandler.getActiveJobs();
        const jobId = job.data.jobId;

        if (activeJobs[jobId] && (activeJobs[jobId].status === 'ended' || activeJobs[jobId].status === 'paused')) {
            while (activeJobs[jobId] && activeJobs[jobId].status === 'paused') {
                await new Promise(resolve => setTimeout(resolve, 2000)); 
            }
            if (activeJobs[jobId] && activeJobs[jobId].status === 'ended') {
                return { success: false, ignored: true };
            }
        }

        let result;
        try {
            result = await deskHandler.processSingleTicketJob(job.data);
            result.jobType = 'ticket'; 
            if (ioInstance) ioInstance.emit('ticketResult', result);
            
            // 🚨 THE REAL WALL-CLOCK PAUSE 🚨
            const delayMs = Number(job.data.delay || 0) * 1000;
            if (delayMs > 0) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
            
            // 🚨 UPDATE TERMINAL UI ON SUCCESS
            if (activeJobs[jobId]) activeJobs[jobId].sessionSuccess = (activeJobs[jobId].sessionSuccess || 0) + 1;
            let sCount = activeJobs[jobId]?.sessionSuccess || 0;
            let fCount = activeJobs[jobId]?.sessionFailed || 0;
            terminalUi.updateBar(profileName, sCount + fCount, sCount, fCount);

        } catch (err) {
            let errorData;
            try { errorData = JSON.parse(err.message); } catch(e) { errorData = { success: false, error: err.message, profileName, email: job.data.email }; }
            errorData.jobType = 'ticket';
            if (ioInstance) ioInstance.emit('ticketResult', errorData);
            
            // 🚨 UPDATE TERMINAL UI ON FAILURE
            if (activeJobs[jobId]) {
                activeJobs[jobId].sessionFailed = (activeJobs[jobId].sessionFailed || 0) + 1;
                let sCount = activeJobs[jobId]?.sessionSuccess || 0;
                let fCount = activeJobs[jobId]?.sessionFailed || 0;
                terminalUi.updateBar(profileName, sCount + fCount, sCount, fCount);
                
                const limit = Number(activeJobs[jobId].stopAfterFailures) || 0;
                
                if (limit > 0 && activeJobs[jobId].consecutiveFailures >= limit) {
                    if (activeJobs[jobId].status !== 'paused') {
                        activeJobs[jobId].status = 'paused'; 
                        terminalUi.log(`\n[🚨 MANAGER] 🛑 ZOHO BLOCKED ${profileName}! (${limit} consecutive failures hit). Pausing for 1 minute...`);
                        if (ioInstance) ioInstance.emit('jobPaused', { profileName, reason: `Cooling down for 1 minute after ${limit} consecutive failures.` });

                        // 🌟 THE SMART COOLDOWN TIMEOUT
                        setTimeout(() => {
                            if (activeJobs[jobId] && activeJobs[jobId].status === 'paused') {
                                activeJobs[jobId].status = 'running';
                                activeJobs[jobId].consecutiveFailures = 0; 
                                
                                try {
                                    const db = require('./database');
                                    // 🌟 THE FIX: No longer needs to fetch the giant results array!
                                    db.updateJobProgress(jobId, 'running', 0);
                                    if (ioInstance) ioInstance.emit('databaseSync', db.getAllJobs());
                                } catch (e) {}

                                terminalUi.log(`\n[🔄 AUTO-RESUME] 🟢 1 Minute cooldown finished! Resuming ${profileName}...`);
                            }
                        }, 60000); 
                    }
                }
            }
        }

        if (activeJobs[jobId] && activeJobs[jobId].status === 'paused') {
            while (activeJobs[jobId] && activeJobs[jobId].status === 'paused') {
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        checkCompletion(accountQueue, profileName);
        return result || { success: false };

    }, { connection: connection, concurrency: 1, lockDuration: 90000 });

    activeCashiers[queueName] = worker;
};

async function checkCompletion(queue, profileName) {
    const waiting = await queue.getWaitingCount();
    const active = await queue.getActiveCount();
    const delayed = await queue.getDelayedCount();
    
    if (waiting === 0 && active <= 1 && delayed === 0) { 
        if (ioInstance) ioInstance.emit('bulkComplete', { profileName, jobType: 'ticket' });
        terminalUi.log(`\n[🧑‍💼 ${profileName}] 🏁 Factory is empty. Job Complete.`);
    }
}

module.exports = { hireCashier, setSocketIo, connection };