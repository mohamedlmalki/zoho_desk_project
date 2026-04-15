// --- FILE: server/index.js ---
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios'); 
const path = require('path');               
const { readProfiles, writeProfiles, parseError, getValidAccessToken, makeApiCall, createJobId } = require('./utils');
const deskHandler = require('./desk-handler');
const projectsHandler = require('./projects-handler');
const db = require('./database');
require('dotenv').config();

const { ticketQueueEvents, ticketQueue } = require('./queue');
const workerManager = require('./worker'); 

const WORKER_URL = "https://zoho-ops-logger.arfilm47.workers.dev"; 
const PORT = process.env.PORT || 80;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    maxHttpBufferSize: 1e8 // 100 MB
});
workerManager.setSocketIo(io); 

const REDIRECT_URI = `http://localhost:3000/api/zoho/callback`;

const activeJobs = {};
deskHandler.setActiveJobs(activeJobs);
projectsHandler.setActiveJobs(activeJobs);

const authStates = {};

app.use(cors());
app.use(express.json());

const updateDbStatus = async (profileName, jobType, status) => {
    try { if (db.updateJobStatusByProfile) await db.updateJobStatusByProfile(profileName, jobType, status); } catch (e) {}
};

// --- ZOHO AUTH FLOW ---
app.post('/api/zoho/auth', (req, res) => {
    const { clientId, clientSecret, socketId } = req.body;
    if (!clientId || !clientSecret || !socketId) return res.status(400).send('Missing credentials.');
    const state = crypto.randomBytes(16).toString('hex');
    authStates[state] = { clientId, clientSecret, socketId };
    setTimeout(() => delete authStates[state], 300000); 

    const combinedScopes = [
        'Desk.tickets.ALL,Desk.settings.ALL,Desk.basic.READ',
        'ZohoProjects.tasklists.READ', 'ZohoProjects.portals.ALL', 'ZohoProjects.projects.ALL',
        'ZohoProjects.milestones.ALL', 'ZohoProjects.bugs.ALL', 'ZohoProjects.tasklists.ALL',
        'ZohoProjects.tasks.ALL', 'ZohoProjects.timesheets.ALL', 'ZohoProjects.forums.ALL',
        'ZohoProjects.events.ALL', 'ZohoProjects.users.ALL', 'ZohoProjects.clients.ALL',
        'ZohoProjects.documents.ALL', 'ZohoProjects.custom_fields.ALL', 'ZohoProjects.bulk.READ',
        'ZohoProjects.activities.READ', 'ZohoProjects.custom_functions.custom', 'ZohoProjects.extensions.READ',
        'ZohoProjects.extensions.CREATE', 'ZohoProjects.extensions.UPDATE', 'ZohoProjects.extensions.DELETE',
        'ZohoProjects.custom_fields.CREATE', 'ZohoProjects.custom_fields.READ'
    ].join(',');
    
    const authUrl = `https://accounts.zoho.com/oauth/v2/auth?scope=${combinedScopes}&client_id=${clientId}&response_type=code&access_type=offline&redirect_uri=${REDIRECT_URI}&prompt=consent&state=${state}`;
    res.json({ authUrl });
});

app.get('/api/zoho/callback', async (req, res) => {
    const { code, state } = req.query;
    const authData = authStates[state];
    if (!authData) return res.status(400).send('<h1>Error</h1><p>Invalid session.</p>');
    delete authStates[state];

    try {
        const tokenUrl = 'https://accounts.zoho.com/oauth/v2/token';
        const params = new URLSearchParams();
        params.append('code', code);
        params.append('client_id', authData.clientId);
        params.append('client_secret', authData.clientSecret);
        params.append('redirect_uri', REDIRECT_URI);
        params.append('grant_type', 'authorization_code');
        
        const response = await axios.post(tokenUrl, params);
        const { refresh_token } = response.data;
        if (!refresh_token) throw new Error('Refresh token not found.');

        io.to(authData.socketId).emit('zoho-refresh-token', { refreshToken: refresh_token });
        res.send('<h1>Success!</h1><p>You can close this window.</p><script>window.close();</script>');
    } catch (error) {
        const { message } = parseError(error);
        io.to(authData.socketId).emit('zoho-refresh-token-error', { error: message });
        res.status(500).send(`<h1>Error</h1><p>${message}</p>`);
    }
});

app.post('/api/webhooks/tracking', (req, res) => {
    try {
        if (req.headers['x-tracking-secret'] !== 'eygirl-secret-key-2026') return res.status(403).json({ error: 'Unauthorized' });
        const { email, ticketId, openedAt, device } = req.body;
        console.log(`\n[TRACKING] 👁️  EMAIL OPENED! Email: ${email} | Device: ${device}`);
        io.emit('emailOpened', { email, ticketId, openedAt, device });
        res.status(200).send('OK');
    } catch (error) { res.status(500).send('Webhook Error'); }
});

app.post('/api/tickets/single', async (req, res) => {
    try { res.json(await deskHandler.handleSendSingleTicket(req.body)); } 
    catch (error) { res.status(500).json({ success: false, error: 'Server error' }); }
});

app.post('/api/tickets/verify', async (req, res) => {
    try { res.json(await deskHandler.handleVerifyTicketEmail(req.body)); } 
    catch (error) { res.status(500).json({ success: false, error: 'Server error' }); }
});

app.post('/api/projects/tasks/single', async (req, res) => {
    try {
        const { formData, selectedProfileName } = req.body;
        const profiles = readProfiles();
        const activeProfile = profiles.find(p => p.profileName === selectedProfileName);
        res.json(await projectsHandler.handleCreateSingleTask({
            ...formData, taskName: formData.taskNames, portalId: activeProfile?.projects?.portalId,
            selectedProfileName, bulkDefaultData: formData.bulkDefaultData || {} 
        }));
    } catch (error) { res.status(500).json({ success: false, error: 'Server error' }); }
});

app.post('/api/projects/fields/create', async (req, res) => {
    try {
        const { selectedProfileName, projectId, layoutId, displayName, fieldType } = req.body;
        const profiles = readProfiles();
        const activeProfile = profiles.find(p => p.profileName === selectedProfileName);
        if (!activeProfile) return res.status(404).json({ success: false, error: 'Profile not found.' });
        const portalId = req.body.portalId || activeProfile.projects?.portalId;
        res.json(await projectsHandler.handleCreateTaskField({ activeProfile, portalId, projectId, layoutId, displayName, fieldType }));
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/projects/fields/update', async (req, res) => {
    try {
        const { selectedProfileName, portalId, projectId, fieldIdentifier, displayName } = req.body;
        const profiles = readProfiles();
        const activeProfile = profiles.find(p => p.profileName === selectedProfileName);
        if (!activeProfile) return res.status(404).json({ success: false, error: 'Profile not found.' });
        res.json(await projectsHandler.handleUpdateTaskField({ activeProfile, portalId, projectId, fieldIdentifier, displayName }));
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/profiles', (req, res) => {
    try { res.json(readProfiles()); } catch (error) { res.status(500).json({ message: "Error" }); }
});

app.post('/api/profiles', (req, res) => {
    try {
        const newProfile = req.body;
        const profiles = readProfiles();
        let baseName = newProfile.profileName;
        let finalName = baseName; let counter = 1;
        while (profiles.some(p => p.profileName === finalName)) { finalName = `${baseName} (${counter})`; counter++; }
        newProfile.profileName = finalName;
        profiles.push(newProfile); writeProfiles(profiles);
        res.json({ success: true, profiles });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.put('/api/profiles/:profileNameToUpdate', (req, res) => {
    try {
        const { profileNameToUpdate } = req.params;
        const updatedProfileData = req.body;
        const profiles = readProfiles();
        const profileIndex = profiles.findIndex(p => p.profileName === profileNameToUpdate);
        if (profileIndex === -1) return res.status(404).json({ success: false });

        let baseName = updatedProfileData.profileName;
        let finalName = baseName; let counter = 1;
        if (baseName !== profileNameToUpdate) {
            while (profiles.some(p => p.profileName === finalName)) { finalName = `${baseName} (${counter})`; counter++; }
            updatedProfileData.profileName = finalName;
        }

        profiles[profileIndex] = { ...profiles[profileIndex], ...updatedProfileData };
        writeProfiles(profiles); res.json({ success: true, profiles });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.delete('/api/profiles/:profileNameToDelete', (req, res) => {
    try {
        const { profileNameToDelete } = req.params;
        const profiles = readProfiles();
        const newProfiles = profiles.filter(p => p.profileName !== profileNameToDelete);
        writeProfiles(newProfiles); res.json({ success: true, profiles: newProfiles });
    } catch (error) { res.status(500).json({ success: false }); }
});

ticketQueueEvents.on('completed', async ({ jobId, returnvalue }) => {
    if (!returnvalue) return;
    let parsedResult;
    try { parsedResult = typeof returnvalue === 'string' ? JSON.parse(returnvalue) : returnvalue; } catch (e) { parsedResult = returnvalue; }
    if (parsedResult && parsedResult.success) io.emit('ticketResult', parsedResult);
});

ticketQueueEvents.on('failed', async ({ jobId, failedReason }) => {
    try { const errorData = JSON.parse(failedReason); io.emit('ticketResult', errorData); } catch(e) { }
});

io.on('connection', (socket) => {
    const liveSocket = { id: socket.id, emit: (eventName, data) => io.emit(eventName, data), connected: true };
    const findJobKey = (profileName, jobType) => Object.keys(activeJobs).find(k => k.endsWith(`_${profileName}_${jobType}`) || k === `${profileName}_${jobType}`);

    socket.on('requestActiveJobs', () => socket.emit('activeJobsSync', Object.keys(activeJobs)));

    socket.on('checkApiStatus', async (data) => {
        try {
            const { selectedProfileName, service = 'desk' } = data;
            const profiles = readProfiles();
            const activeProfile = profiles.find(p => p.profileName === selectedProfileName);
            if (!activeProfile) throw new Error("Profile not found");
            
            const tokenResponse = await getValidAccessToken(activeProfile, service);
            let validationData = {};

            if (service === 'desk') {
                 if (!activeProfile.desk || !activeProfile.desk.orgId) throw new Error('Desk Organization ID is not configured.');
                const agentResponse = await makeApiCall('get', '/api/v1/myinfo', null, activeProfile, 'desk');
                 validationData = { agentInfo: agentResponse.data, orgName: agentResponse.data.orgName };
            } else if (service === 'projects') {
                 if (!activeProfile.projects?.portalId) throw new Error('Projects config is missing.');
                const { portalId } = activeProfile.projects;
                const portalResponse = await makeApiCall('get', `/portal/${portalId}`, null, activeProfile, 'projects');
                validationData = { orgName: `Portal: ${portalResponse.data.portal_details.name}`, agentInfo: { firstName: `Portal Owner`, lastName: '' }, portalData: portalResponse.data };
            }

            socket.emit('apiStatusResult', { success: true, message: `Connection to Zoho ${service} API successful.`, fullResponse: { ...tokenResponse, ...validationData } });
        } catch (error) {
            const { message, fullResponse } = parseError(error);
            socket.emit('apiStatusResult', { success: false, message: `Connection failed: ${message}`, fullResponse: fullResponse || error.stack });
        }
    });

    socket.on('pauseJob', async ({ profileName, jobType }) => {
        const jobId = findJobKey(profileName, jobType);
        if (jobId && activeJobs[jobId]) activeJobs[jobId].status = 'paused';
        await updateDbStatus(profileName, jobType, 'paused');
        try {
            const { Queue } = require('bullmq'); const { connection } = require('./worker');
            const accountQueue = new Queue(jobType === 'ticket' ? `ticketQueue_${profileName}` : `${jobType}Queue_${profileName}`, { connection });
            await accountQueue.pause();
        } catch(e) {}
    });

    socket.on('resumeJob', async ({ profileName, jobType }) => {
        let jobId = findJobKey(profileName, jobType);
        if (!jobId || !activeJobs[jobId]) { activeJobs[`${profileName}_${jobType}`] = { status: 'running', consecutiveFailures: 0 }; } 
        else { activeJobs[jobId].status = 'running'; activeJobs[jobId].consecutiveFailures = 0; }
        
        await updateDbStatus(profileName, jobType, 'running');
        try {
            const { Queue } = require('bullmq'); const { connection } = require('./worker');
            const accountQueue = new Queue(jobType === 'ticket' ? `ticketQueue_${profileName}` : `${jobType}Queue_${profileName}`, { connection });
            await accountQueue.resume();
        } catch(e) {}
    });

    socket.on('endJob', async ({ profileName, jobType }) => {
        const jobId = findJobKey(profileName, jobType);
        if (jobId && activeJobs[jobId]) activeJobs[jobId].status = 'ended';
        await updateDbStatus(profileName, jobType, 'ended');
        try {
            const { Queue } = require('bullmq'); const { connection } = require('./worker');
            const accountQueue = new Queue(jobType === 'ticket' ? `ticketQueue_${profileName}` : `${jobType}Queue_${profileName}`, { connection });
            await accountQueue.drain(true); 
        } catch(e) {}
        io.emit('bulkEnded', { profileName, jobType });
    });

    socket.on('markJobComplete', async ({ profileName, jobType }) => await updateDbStatus(profileName, jobType, 'complete'));

    socket.on('getDeskOrganizations', (data) => deskHandler.handleGetDeskOrganizations(liveSocket, data));
    socket.on('getDeskDepartments', (data) => deskHandler.handleGetDeskDepartments(liveSocket, data));
    socket.on('getDeskMailAddresses', (data) => deskHandler.handleGetDeskMailAddresses(liveSocket, data));
    socket.on('getProjectsPortals', (data) => projectsHandler.handleGetPortals(liveSocket, data));

    const deskListeners = { 'startBulkCreate': deskHandler.handleStartBulkCreate, 'getEmailFailures': deskHandler.handleGetEmailFailures, 'clearEmailFailures': deskHandler.handleClearEmailFailures, 'clearTicketLogs': (socket) => {}, 'getMailReplyAddressDetails': deskHandler.handleGetMailReplyAddressDetails, 'updateMailReplyAddressDetails': deskHandler.handleUpdateMailReplyAddressDetails };
    for (const [event, handler] of Object.entries(deskListeners)) { socket.on(event, (data) => { const profiles = readProfiles(); const activeProfile = data ? profiles.find(p => p.profileName === data.selectedProfileName) : null; if (activeProfile) { if (event.startsWith('startBulk')) io.emit('jobStarted', { profileName: data.selectedProfileName, jobType: 'ticket' }); handler(liveSocket, { ...data, activeProfile }); } }); }
    
    const projectsListeners = { 'getProjectsProjects': projectsHandler.handleGetProjects, 'getProjectsTaskLists': projectsHandler.handleGetTaskLists, 'getProjectsTasks': projectsHandler.handleGetTasks, 'startBulkCreateTasks': projectsHandler.handleStartBulkCreateTasks, 'startBulkDeleteTasks': projectsHandler.handleStartBulkDeleteTasks, 'getProjectsTaskLayout': projectsHandler.handleGetTaskLayout, 'updateProjectDetails': projectsHandler.handleUpdateProjectDetails, 'getProjectDetails': projectsHandler.handleGetProjectDetails };
    for (const [event, handler] of Object.entries(projectsListeners)) { socket.on(event, (data) => { const profiles = readProfiles(); const activeProfile = data ? profiles.find(p => p.profileName === data.selectedProfileName) : null; if (activeProfile) { if (event.startsWith('startBulk')) io.emit('jobStarted', { profileName: data.selectedProfileName, jobType: 'projects' }); if (typeof handler === 'function') { handler(liveSocket, { ...data, activeProfile }); } else { socket.emit('bulkError', { message: `Server error` }); } } }); }

    // 🚨 NEW UPGRADE: Database persistence syncing
    socket.on('requestDatabaseSync', async () => {
        try {
            const allJobs = await db.getAllJobs();
            socket.emit('databaseSync', allJobs);
            
            const engineState = await db.getEngineState();
            socket.emit('engineStateSync', engineState);
        } catch (error) { console.error('[DB SYNC] Error fetching state:', error); }
    }); 

    socket.on('saveEngineState', async (state) => {
        try {
            await db.saveEngineState(state);
            socket.broadcast.emit('engineStateSync', state);
        } catch (error) { console.error('[DB SYNC] Error saving engine state:', error); }
    });

    // Route the Wipe commands to our new colorful logging functions!
    socket.on('clearJob', (data) => deskHandler.handleClearJob(liveSocket, data));
    socket.on('clearAllJobs', (data) => deskHandler.handleClearAllJobs(liveSocket, data));

});

const fsPromises = require('fs').promises;
app.get("/api/sidebar-order", async (req, res) => { try { const data = await fsPromises.readFile(__dirname + '/sidebar-order.json', "utf-8"); res.json(JSON.parse(data)); } catch (error) { res.json([]); } });
app.post("/api/sidebar-order", express.json(), async (req, res) => { try { await fsPromises.writeFile(__dirname + '/sidebar-order.json', JSON.stringify(req.body)); res.json({ success: true }); } catch (error) { res.status(500).json({ error: "Failed to save" }); } });

app.use(express.static(path.join(__dirname, '../dist')));
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, '../dist/index.html')); });

server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    try {
        const { spawn } = require('child_process');
        const loggerProcess = spawn('node', [path.join(__dirname, 'analystics.js')], { stdio: 'ignore', detached: false });
        const killLogger = () => { if (loggerProcess) loggerProcess.kill(); process.exit(); };
        process.on('exit', () => { if (loggerProcess) loggerProcess.kill(); });
        process.on('SIGINT', killLogger);   
        process.on('SIGTERM', killLogger);  
    } catch (err) {}
});