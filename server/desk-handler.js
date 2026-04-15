// --- FILE: server/desk-handler.js ---
const { Queue } = require('bullmq');
const { connection, hireCashier } = require('./worker');
const { makeApiCall, parseError, createJobId, readProfiles } = require('./utils');
const db = require('./database'); 
const terminalUi = require('./terminal-ui'); 

let activeJobs = {};

const getActiveJobs = () => activeJobs;
const setActiveJobs = (jobsObject) => { activeJobs = jobsObject; };

const getRealDeskProfile = (profiles, profileName) => {
    return profiles.find(p => p.profileName === profileName && p.desk && p.desk.cloudflareTrackingUrl)
        || profiles.find(p => p.profileName === profileName && p.desk && p.desk.defaultDepartmentId)
        || profiles.find(p => p.profileName === profileName);
};

async function injectSmartTracking(description, email, selectedProfileName, deskConfig, ticketId, enableTracking) {
    if (!enableTracking) return description;
    let newText = description;
    const workerUrlRegex = /(https?:\/\/[^\s'\"<>]+workers\.dev[^\s'\"<>]*)/gi;
    let rawMatches = description.match(workerUrlRegex) || [];
    let uniqueLinks = [...new Set(rawMatches)];

    for (let rawUrl of uniqueLinks) {
        if (rawUrl.match(/\.(png|jpg|jpeg|gif|webp|svg)(?:[?#].*)?$/i) || rawUrl.includes('track.gif')) continue;
        if (!rawUrl.includes('?email=') && !rawUrl.includes('&email=')) {
            const separator = rawUrl.includes('?') ? '&' : '?';
            const finalTrackedLink = `${rawUrl}${separator}email=${encodeURIComponent(email)}&profile=${encodeURIComponent(selectedProfileName + '_Desk')}&ticketId=${encodeURIComponent(ticketId)}`;
            newText = newText.split(rawUrl).join(finalTrackedLink);
        }
    }

    if (deskConfig && deskConfig.cloudflareTrackingUrl) {
        const baseUrl = deskConfig.cloudflareTrackingUrl.replace(/\/$/, '').trim();
        const pixel = `<img src="${baseUrl}/track.gif?email=${encodeURIComponent(email)}&ticketId=${ticketId}&profile=${encodeURIComponent(selectedProfileName + '_Desk')}" width="1" height="1" alt="" style="display:none;" />`;
        newText += pixel;
    }
    return newText;
}

const handleSendSingleTicket = async (data) => {
    const { email, subject, description, selectedProfileName, sendDirectReply, enableTracking } = data;
    if (!email || !selectedProfileName) return { success: false, error: 'Missing email or profile.' };
    const profiles = readProfiles();
    const activeProfile = getRealDeskProfile(profiles, selectedProfileName);

    try {
        if (!activeProfile) return { success: false, error: 'Profile not found.' };
        const deskConfig = activeProfile.desk;
        const finalDescription = await injectSmartTracking(description, email, selectedProfileName, deskConfig, 'Single', enableTracking);
        const ticketData = { subject, description: finalDescription, departmentId: deskConfig.defaultDepartmentId, contact: { email }, channel: 'Email' };
        const ticketResponse = await makeApiCall('post', '/api/v1/tickets', ticketData, activeProfile, 'desk');
        const newTicket = ticketResponse.data;
        let fullResponseData = { ticketCreate: newTicket };
        
        if (sendDirectReply) {
            try {
                const replyData = { fromEmailAddress: deskConfig.fromEmailAddress, to: email, content: finalDescription, contentType: 'html', channel: 'EMAIL' };
                const replyResponse = await makeApiCall('post', `/api/v1/tickets/${newTicket.id}/sendReply`, replyData, activeProfile, 'desk');
                fullResponseData.sendReply = replyResponse.data;
            } catch (replyError) { fullResponseData.sendReply = parseError(replyError); }
        }
        return { success: true, fullResponse: fullResponseData, message: `Ticket #${newTicket.ticketNumber} created.` };
    } catch (error) {
        const { message, fullResponse } = parseError(error);
        return { success: false, error: message, fullResponse };
    }
};

const handleVerifyTicketEmail = async (data) => {
    const { ticket, profileName } = data;
    if (!ticket || !profileName) return { success: false, details: 'Missing ticket/profile.' };
    const profiles = readProfiles();
    const activeProfile = getRealDeskProfile(profiles, profileName);
    if (!activeProfile) return { success: false, details: 'Profile not found.' };
    return await verifyTicketEmail(null, { ticket, profile: activeProfile });
};

const handleSendTestTicket = async (socket, data) => {
    const { email, subject, description, selectedProfileName, sendDirectReply, verifyEmail, enableTracking } = data;
    if (!email || !selectedProfileName) return socket.emit('testTicketResult', { success: false, error: 'Missing email or profile.' });
    const profiles = readProfiles();
    const activeProfile = getRealDeskProfile(profiles, selectedProfileName);

    try {
        if (!activeProfile) return socket.emit('testTicketResult', { success: false, error: 'Profile not found.' });
        const deskConfig = activeProfile.desk;
        const finalDescription = await injectSmartTracking(description, email, selectedProfileName, deskConfig, 'Test', enableTracking);
        const ticketData = { subject, description: finalDescription, departmentId: deskConfig.defaultDepartmentId, contact: { email }, channel: 'Email' };
        const ticketResponse = await makeApiCall('post', '/api/v1/tickets', ticketData, activeProfile, 'desk');
        const newTicket = ticketResponse.data;
        let fullResponseData = { ticketCreate: newTicket };
        
        if (sendDirectReply) {
            try {
                const replyData = { fromEmailAddress: deskConfig.fromEmailAddress, to: email, content: finalDescription, contentType: 'html', channel: 'EMAIL' };
                const replyResponse = await makeApiCall('post', `/api/v1/tickets/${newTicket.id}/sendReply`, replyData, activeProfile, 'desk');
                fullResponseData.sendReply = replyResponse.data;
            } catch (replyError) { fullResponseData.sendReply = parseError(replyError); }
        }
        socket.emit('testTicketResult', { success: true, fullResponse: fullResponseData });
        if (verifyEmail) {
            verifyTicketEmail(socket, {ticket: newTicket, profile: activeProfile, resultEventName: 'testTicketVerificationResult', email});
        }
    } catch (error) {
        const { message, fullResponse } = parseError(error);
        socket.emit('testTicketResult', { success: false, error: message, fullResponse });
    }
};

const handleStartBulkCreate = async (socket, data) => {
    const { emails, subject, description, delay, selectedProfileName, sendDirectReply, verifyEmail, stopAfterFailures = 0, displayName, enableTracking } = data;
    const profiles = readProfiles();
    const activeProfile = getRealDeskProfile(profiles, selectedProfileName);
    const jobId = createJobId(socket.id, selectedProfileName, 'ticket');
    
    activeJobs[jobId] = { 
        status: 'running', 
        consecutiveFailures: 0, 
        stopAfterFailures: Number(stopAfterFailures), 
        sessionSuccess: 0, 
        sessionFailed: 0,
        lastFinishTime: Date.now() 
    };
    
    try {
        await db.upsertJob({ 
            id: jobId, 
            profileName: selectedProfileName, 
            jobType: 'ticket', 
            status: 'running', 
            totalToProcess: emails.length, 
            consecutiveFailures: 0, 
            stopAfterFailures: Number(stopAfterFailures), 
            formData: data, 
            processingStartTime: new Date()
        });
    } catch (err) { console.error(err); }

    try {
        if (!activeProfile) throw new Error('Profile not found.');
        const deskConfig = activeProfile.desk;
        const queueName = `ticketQueue_${selectedProfileName}`;
        const myAccountQueue = new Queue(queueName, { connection });
        
        await myAccountQueue.drain(true).catch(() => {});
        try { await myAccountQueue.obliterate({ force: true }); } catch (e) {}
        
        hireCashier(selectedProfileName);
        terminalUi.initBar(selectedProfileName, emails.length);

        const jobs = emails.filter(e => e.trim()).map((email) => {
            return {
                name: 'createTicket',
                data: { email, subject, description, selectedProfileName, sendDirectReply, verifyEmail, displayName, enableTracking, deskConfig, activeProfile, jobId, delay },
                opts: { removeOnComplete: true, removeOnFail: true } 
            };
        });

        await myAccountQueue.addBulk(jobs);
    } catch (error) {
        socket.emit('bulkError', { message: error.message || 'Error', profileName: selectedProfileName, jobType: 'ticket' });
    }
};

const processSingleTicketJob = async (jobData) => {
    const { email, subject, description, selectedProfileName, sendDirectReply, verifyEmail, displayName, enableTracking, deskConfig, activeProfile, jobId } = jobData;
    
    try {
        const finalDescription = await injectSmartTracking(description, email, selectedProfileName, deskConfig, 'Bulk', enableTracking);
        const ticketData = { subject, description: finalDescription, departmentId: deskConfig.defaultDepartmentId, contact: { email }, channel: 'Email', resolution: displayName };
        
        // --- ZOHO WORK ---
        const ticketResponse = await makeApiCall('post', '/api/v1/tickets', ticketData, activeProfile, 'desk');
        const newTicket = ticketResponse.data;
        let successMessage = `Ticket #${newTicket.ticketNumber} created.`;
        let fullResponseData = { ticketCreate: newTicket };

        if (sendDirectReply) {
            try {
                const replyData = { fromEmailAddress: deskConfig.fromEmailAddress, to: email, content: finalDescription, contentType: 'html', channel: 'EMAIL' };
                const replyResponse = await makeApiCall('post', `/api/v1/tickets/${newTicket.id}/sendReply`, replyData, activeProfile, 'desk');
                successMessage += ` Reply sent.`;
                fullResponseData.sendReply = replyResponse.data;
            } catch (replyError) {
                successMessage += ` Reply Failed: ${parseError(replyError).message}`;
            }
        }

        if (verifyEmail) {
            const verifyResult = await verifyTicketEmail(null, { ticket: newTicket, profile: activeProfile, jobId, email });
            if (!verifyResult.success) {
                throw new Error(JSON.stringify({ email, success: false, error: verifyResult.details || "Verification Failed", fullResponse: fullResponseData, profileName: selectedProfileName }));
            }
            successMessage += ` | ${verifyResult.details}`;
        }

        // --- GAP TIMER ---
        const now = Date.now();
        if (!activeJobs[jobId]) activeJobs[jobId] = { lastFinishTime: now };
        if (!activeJobs[jobId].lastFinishTime) activeJobs[jobId].lastFinishTime = now;

        const gapMs = now - activeJobs[jobId].lastFinishTime;
        const timeSinceLastTicket = (gapMs / 1000).toFixed(2) + 's';

        activeJobs[jobId].lastFinishTime = now;

        // --- RELATIONAL DATABASE INSERT PHASE ---
        const resultData = { email, success: true, ticketNumber: newTicket.ticketNumber, details: successMessage, fullResponse: fullResponseData, profileName: selectedProfileName, time: timeSinceLastTicket };
        
        // This is where the magic happens. A tiny micro-insert.
        await db.insertJobResult(jobId, resultData);

        if (activeJobs[jobId]) activeJobs[jobId].consecutiveFailures = 0;
        await db.updateJobProgress(jobId, activeJobs[jobId]?.status || 'running', 0);
        
        return resultData;

    } catch (error) {
        // --- GAP TIMER FOR ERRORS ---
        const now = Date.now();
        if (!activeJobs[jobId]) activeJobs[jobId] = { lastFinishTime: now };
        if (!activeJobs[jobId].lastFinishTime) activeJobs[jobId].lastFinishTime = now;

        const gapMs = now - activeJobs[jobId].lastFinishTime;
        const timeSinceLastTicket = (gapMs / 1000).toFixed(2) + 's';
        activeJobs[jobId].lastFinishTime = now;

        const { message, fullResponse } = parseError(error);
        const errorData = { email, success: false, error: message, fullResponse, profileName: selectedProfileName, time: timeSinceLastTicket };
        
        // Fast error insert
        await db.insertJobResult(jobId, errorData);

        const currentFails = (activeJobs[jobId]?.consecutiveFailures || 0) + 1;
        if (activeJobs[jobId]) activeJobs[jobId].consecutiveFailures = currentFails;
        await db.updateJobProgress(jobId, activeJobs[jobId]?.status || 'running', currentFails);
        
        throw new Error(JSON.stringify(errorData));
    }
};

const verifyTicketEmail = async (socket, { ticket, profile, resultEventName = 'ticketUpdate', jobId, email }) => {
    let fullResponse = { ticketCreate: ticket, verifyEmail: {} };
    try {
        if (socket) await new Promise(resolve => setTimeout(resolve, 25000)); 
        if (jobId && activeJobs[jobId] && activeJobs[jobId].status === 'ended') return { success: false, details: 'Job Ended' };
        
        const [workflowHistoryResponse, notificationHistoryResponse] = await Promise.all([
            makeApiCall('get', `/api/v1/tickets/${ticket.id}/History?eventFilter=WorkflowHistory`, null, profile, 'desk'),
            makeApiCall('get', `/api/v1/tickets/${ticket.id}/History?eventFilter=NotificationRuleHistory`, null, profile, 'desk')
        ]);

        const allHistoryEvents = [ ...(workflowHistoryResponse.data?.data || []), ...(notificationHistoryResponse.data?.data || []) ];
        fullResponse.verifyEmail.history = { workflowHistory: workflowHistoryResponse.data, notificationHistory: notificationHistoryResponse.data };

        if (allHistoryEvents.length > 0) {
            let eventDetails = [];
            allHistoryEvents.forEach(evt => {
                let detailStr = '';
                const actorType = evt.actor?.type;
                const actorName = evt.actor?.name || 'Unknown';
                const eventName = evt.eventName;

                if (actorType === 'NotificationRule') {
                    detailStr = `Notification: "${actorName}"`;
                } else if (actorType === 'Workflow') {
                    if (eventName === 'CustomFunctionExecuted') {
                        const funcNameInfo = evt.actorInfo?.find(info => info.propertyName === 'CustomFunctionName');
                        const funcName = funcNameInfo ? funcNameInfo.propertyValue : 'Unknown';
                        detailStr = `Function: "${funcName}"`;
                    } else if (eventName === 'NotificationSent') {
                        const alertNameInfo = evt.actorInfo?.find(info => info.propertyName === 'AlertName');
                        const alertName = alertNameInfo ? alertNameInfo.propertyValue : 'Unknown Alert';
                        detailStr = `Alert: "${alertName}"`;
                    } else {
                        detailStr = `Workflow: "${actorName}"`;
                    }
                } else if (actorType) {
                     detailStr = `${actorType}: "${actorName}"`;
                }

                if (detailStr && !eventDetails.includes(detailStr)) eventDetails.push(detailStr);
            });

            const detailsMessage = eventDetails.length > 0 ? `Verified: ${eventDetails.join(' | ')}` : 'Verified: Automation executed.';
            if (socket) socket.emit(resultEventName, { ticketNumber: ticket.ticketNumber, success: true, details: detailsMessage, fullResponse, profileName: profile.profileName, email: email });
            return { success: true, details: detailsMessage };
        } else {
            const failureResponse = await makeApiCall('get', `/api/v1/emailFailureAlerts?department=${profile.desk.defaultDepartmentId}`, null, profile, 'desk');
            const failure = failureResponse.data.data?.find(f => String(f.ticketNumber) === String(ticket.ticketNumber));
            fullResponse.verifyEmail.failure = failure || "No specific failure found.";
            const failMessage = failure ? `Verification Failed: ${failure.reason}` : 'Verification Failed: No automation history found.';
            if (socket) socket.emit(resultEventName, { ticketNumber: ticket.ticketNumber, success: false, details: failMessage, fullResponse, profileName: profile.profileName, email: email });
            return { success: false, details: failMessage };
        }
    } catch (error) {
        const { message, fullResponse: errorResponse } = parseError(error);
        fullResponse.verifyEmail.error = errorResponse;
        if (socket) socket.emit(resultEventName, { ticketNumber: ticket.ticketNumber, success: false, details: `Verification Error: ${message}`, fullResponse, profileName: profile.profileName, email: email });
        return { success: false, details: message };
    }
};

const handleGetEmailFailures = async (socket, data) => {
    try {
        const profiles = readProfiles();
        const activeProfile = getRealDeskProfile(profiles, data.selectedProfileName);
        if (!activeProfile || !activeProfile.desk) throw new Error('Desk profile not found for fetching email failures.');
        const departmentId = activeProfile.desk.defaultDepartmentId;
        const response = await makeApiCall('get', `/api/v1/emailFailureAlerts?department=${departmentId}&limit=50`, null, activeProfile, 'desk');
        const failures = response.data.data || [];
        const failuresWithEmails = failures.map(failure => { return { ...failure, email: 'Unknown (Log Disabled)' }; });
        socket.emit('emailFailuresResult', { success: true, data: failuresWithEmails });
    } catch (error) { socket.emit('emailFailuresResult', { success: false, error: parseError(error).message }); }
};

const handleClearEmailFailures = async (socket, data) => {
    try {
        const profiles = readProfiles();
        const activeProfile = getRealDeskProfile(profiles, data.selectedProfileName);
        if (!activeProfile || !activeProfile.desk) throw new Error('Desk profile not found for clearing email failures.');
        const departmentId = activeProfile.desk.defaultDepartmentId;
        await makeApiCall('patch', `/api/v1/emailFailureAlerts?department=${departmentId}`, null, activeProfile, 'desk');
        socket.emit('clearEmailFailuresResult', { success: true });
    } catch (error) { socket.emit('clearEmailFailuresResult', { success: false, error: parseError(error).message }); }
};

const handleGetMailReplyAddressDetails = async (socket, data) => {
    try {
        const profiles = readProfiles();
        const activeProfile = getRealDeskProfile(profiles, data.selectedProfileName);
        if (!activeProfile || !activeProfile.desk) return socket.emit('mailReplyAddressDetailsResult', { success: false, error: 'Desk profile not found' });
        const mailReplyAddressId = activeProfile.desk.mailReplyAddressId;
        if (!mailReplyAddressId) return socket.emit('mailReplyAddressDetailsResult', { success: true, notConfigured: true });
        const response = await makeApiCall('get', `/api/v1/mailReplyAddress/${mailReplyAddressId}`, null, activeProfile, 'desk');
        socket.emit('mailReplyAddressDetailsResult', { success: true, data: response.data });
    } catch (error) { socket.emit('mailReplyAddressDetailsResult', { success: false, error: parseError(error).message }); }
};

const handleUpdateMailReplyAddressDetails = async (socket, data) => {
    try {
        const { displayName, selectedProfileName } = data;
        const profiles = readProfiles();
        const activeProfile = getRealDeskProfile(profiles, selectedProfileName);
        if (!activeProfile || !activeProfile.desk || !activeProfile.desk.mailReplyAddressId) throw new Error('Mail Reply Address ID is not configured for this profile.');
        const mailReplyAddressId = activeProfile.desk.mailReplyAddressId;
        const response = await makeApiCall('patch', `/api/v1/mailReplyAddress/${mailReplyAddressId}`, { displayName }, activeProfile, 'desk');
        socket.emit('mailReplyAddressDetailsResult', { success: true, data: response.data });
    } catch (error) { socket.emit('mailReplyAddressDetailsResult', { success: false, error: parseError(error).message }); }
};

const handleGetDeskOrganizations = async (socket, data) => {
    try {
        const profile = data.activeProfile || data.profile || data;
        const response = await makeApiCall('get', '/api/v1/organizations', null, profile, 'desk');
        socket.emit('deskOrganizationsResult', { success: true, organizations: response.data.data || response.data });
    } catch (error) { socket.emit('deskOrganizationsError', { success: false, message: parseError(error).message }); }
};

const handleGetDeskDepartments = async (socket, data) => {
    try {
        const profile = data.activeProfile || data.profile || data;
        if (data.orgId && (!profile.desk || !profile.desk.orgId)) {
            if(!profile.desk) profile.desk = {};
            profile.desk.orgId = data.orgId;
        }
        const response = await makeApiCall('get', '/api/v1/departments', null, profile, 'desk');
        socket.emit('deskDepartmentsResult', { success: true, departments: response.data.data || response.data });
    } catch (error) { socket.emit('deskDepartmentsError', { success: false, message: parseError(error).message }); }
};

const handleGetDeskMailAddresses = async (socket, data) => {
    try {
        const profile = data.activeProfile || data.profile || data;
        if (data.orgId && (!profile.desk || !profile.desk.orgId)) {
            if(!profile.desk) profile.desk = {};
            profile.desk.orgId = data.orgId;
        }
        let url = '/api/v1/mailReplyAddress';
        if (data.departmentId) url += `?departmentId=${data.departmentId}`;
        const response = await makeApiCall('get', url, null, profile, 'desk');
        socket.emit('deskMailAddressesResult', { success: true, mailAddresses: response.data.data || response.data });
    } catch (error) { socket.emit('deskMailAddressesError', { success: false, message: parseError(error).message }); }
};

const handleClearJob = async (socket, data) => {
    const { profileName, jobType } = data;
    const colors = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', reset: '\x1b[0m' };

    console.log(`\n${colors.yellow}================ WIPE ACCOUNT INITIATED =================${colors.reset}`);
    console.log(`${colors.cyan}[WIPE] Target Profile: ${profileName} | Job Type: ${jobType}${colors.reset}`);

    try {
        const allJobs = await db.getAllJobs();
        const jobToDelete = allJobs.find(j => j.profileName === profileName && j.jobType === jobType);
        
        if (jobToDelete) {
            console.log(`${colors.red}[WIPE] 🗑️  Original Database Record Found! Destroying it now...${colors.reset}`);
            console.log(`       - Status before wipe: ${jobToDelete.status}`);
            console.log(`       - Progress: ${jobToDelete.results ? jobToDelete.results.length : 0} out of ${jobToDelete.totalToProcess || 0} completed`);
        }
    } catch (e) { }

    try {
        const rawDbResponse = await db.deleteJob(profileName, jobType);
        console.log(`${colors.green}[WIPE] ✅ Successfully wiped from SQLite Database.${colors.reset}`);
        console.log(`${colors.cyan}--- RAW DATABASE DRIVER RESPONSE ---${colors.reset}`);
        console.log(rawDbResponse);
        console.log(`${colors.cyan}------------------------------------${colors.reset}`);
    } catch (error) {
        console.error(`${colors.red}[WIPE ERROR] DB Error for ${profileName}:${colors.reset}`, error);
    }

    let memoryWiped = false;
    const jobKeys = Object.keys(activeJobs).filter(k => k.includes(profileName) && k.includes(jobType));
    for (let key of jobKeys) {
        delete activeJobs[key];
        memoryWiped = true;
    }
    if (memoryWiped) console.log(`${colors.green}[WIPE] ✅ Successfully wiped from Node.js RAM.${colors.reset}`);

    try {
        const { Queue } = require('bullmq');
        const { connection } = require('./worker');
        const queueName = jobType === 'ticket' ? `ticketQueue_${profileName}` : `${jobType}Queue_${profileName}`;
        const accountQueue = new Queue(queueName, { connection });
        await accountQueue.pause(); 
        await accountQueue.obliterate({ force: true }); 
        console.log(`${colors.green}[WIPE] ✅ Successfully wiped from BullMQ Redis Queue.${colors.reset}`);
    } catch (error) { }

    socket.emit('jobCleared', { profileName, jobType });
    console.log(`${colors.yellow}================ WIPE COMMAND COMPLETE ==================\n${colors.reset}`);
};

const handleClearAllJobs = async (socket, data) => {
    const { jobType } = data;
    const colors = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', reset: '\x1b[0m', magenta: '\x1b[35m' };

    console.log(`\n${colors.magenta}================ NUCLEAR WIPE ALL INITIATED =================${colors.reset}`);
    console.log(`${colors.cyan}[WIPE ALL] Target Job Type: ${jobType}${colors.reset}`);

    try {
        const allJobs = await db.getAllJobs();
        const jobsToDelete = allJobs.filter(j => j.jobType === jobType);
        if (jobsToDelete.length > 0) {
            console.log(`${colors.red}[WIPE ALL] 💥 Preparing to destroy ${jobsToDelete.length} total records:${colors.reset}`);
        }
    } catch (e) {}

    try {
        const rawDbResponse = await db.deleteAllJobsByType(jobType);
        console.log(`${colors.green}[WIPE ALL] ✅ Wiped ALL Database Records.${colors.reset}`);
        console.log(`${colors.cyan}--- RAW DATABASE DRIVER RESPONSE ---${colors.reset}`);
        console.log(rawDbResponse);
        console.log(`${colors.cyan}------------------------------------${colors.reset}`);
    } catch (error) {
        console.error(`${colors.red}[WIPE ALL ERROR] DB Wipe Error:${colors.reset}`, error);
    }

    let memoryWiped = 0;
    const jobKeys = Object.keys(activeJobs).filter(k => k.includes(jobType));
    for (let key of jobKeys) {
        delete activeJobs[key];
        memoryWiped++;
    }
    if (memoryWiped > 0) console.log(`${colors.green}[WIPE ALL] ✅ Wiped ${memoryWiped} jobs from Node.js RAM.${colors.reset}`);

    socket.emit('allJobsCleared', { jobType });
    console.log(`${colors.magenta}================ NUCLEAR COMMAND COMPLETE ==================\n${colors.reset}`);
};

module.exports = {
    setActiveJobs, getActiveJobs, handleSendTestTicket, handleStartBulkCreate, handleGetEmailFailures, handleClearEmailFailures, handleGetMailReplyAddressDetails, handleUpdateMailReplyAddressDetails, handleSendSingleTicket, handleVerifyTicketEmail, handleGetDeskOrganizations, handleGetDeskDepartments, handleGetDeskMailAddresses, processSingleTicketJob,
    handleClearJob, handleClearAllJobs 
};