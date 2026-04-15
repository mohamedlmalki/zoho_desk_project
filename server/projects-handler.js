const { getValidAccessToken, makeApiCall, parseError, createJobId, readProfiles } = require('./utils');
const { delay } = require('./utils'); 
const axios = require('axios'); 
const db = require('./database'); 

let activeJobs = {};

const getRealProjectsProfile = (profiles, profileName) => {
    return profiles.find(p => p.profileName === profileName && p.projects && p.projects.cloudflareTrackingUrl)
        || profiles.find(p => p.profileName === profileName && p.projects && p.projects.portalId)
        || profiles.find(p => p.profileName === profileName);
};

function injectProjectsTracking(dataForThisTask, taskDescription, email, selectedProfileName, projectsConfig, enableTracking) {
    if (!enableTracking) return { updatedDataForThisTask: dataForThisTask, updatedTaskDescription: taskDescription };

    let updatedDataForThisTask = { ...dataForThisTask };
    let updatedTaskDescription = typeof taskDescription === 'string' ? taskDescription : '';

    let pixelHtml = "";
    let pixelInjected = false;
    if (projectsConfig && projectsConfig.cloudflareTrackingUrl) {
        const baseUrl = projectsConfig.cloudflareTrackingUrl.replace(/\/$/, '').trim();
        pixelHtml = `<img src="${baseUrl}/track.gif?email=${encodeURIComponent(email)}&ticketId=Projects&profile=${encodeURIComponent(selectedProfileName + '_Projects')}" width="1" height="1" alt="" style="opacity:0.01;" />`;
    }

    let customFieldKeys = Object.keys(updatedDataForThisTask).filter(k => typeof updatedDataForThisTask[k] === 'string');
    customFieldKeys.sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));

    let fieldBoundaries = [];
    let currentOffset = 0;
    let combinedString = "";

    for (let key of customFieldKeys) {
        let text = updatedDataForThisTask[key];
        combinedString += text;
        fieldBoundaries.push({ key: key, start: currentOffset, end: currentOffset + text.length });
        currentOffset += text.length;
    }

    let insertionsByField = {};
    for (let key of customFieldKeys) insertionsByField[key] = [];

    const urlRegex = /(https?:\/\/[^\s'\"<>]+|www\.[^\s'\"<>]+)/gi;
    let match;
    
    while ((match = urlRegex.exec(combinedString)) !== null) {
        let rawUrl = match[0];
        if (rawUrl.match(/\.(png|jpg|jpeg|gif|webp|svg)(?:[?#].*)?$/i) || rawUrl.includes('track.gif')) continue;
        if (!rawUrl.toLowerCase().includes('worker')) continue;
        if (rawUrl.includes('?email=') || rawUrl.includes('&email=')) continue;

        const sep = rawUrl.includes('?') ? '&' : '?';
        const paramsToInject = `${sep}email=${encodeURIComponent(email)}&profile=${encodeURIComponent(selectedProfileName + '_Projects')}&ticketId=Projects`;

        let injectionAbsoluteIndex = match.index + rawUrl.length;

        for (let boundary of fieldBoundaries) {
            if (injectionAbsoluteIndex > boundary.start && injectionAbsoluteIndex <= boundary.end) {
                let localIndex = injectionAbsoluteIndex - boundary.start;
                insertionsByField[boundary.key].push({ localIndex: localIndex, textToInsert: paramsToInject, rawUrl: rawUrl });
                break;
            }
        }
    }

    for (let key of customFieldKeys) {
        let insertions = insertionsByField[key];
        if (insertions.length > 0) {
            insertions.sort((a, b) => b.localIndex - a.localIndex);
            let text = updatedDataForThisTask[key];
            for (let ins of insertions) {
                text = text.substring(0, ins.localIndex) + ins.textToInsert + text.substring(ins.localIndex);
            }
            updatedDataForThisTask[key] = text;
        }
    }

    if (pixelHtml) {
        let reversedKeys = [...customFieldKeys].reverse();
        for (let key of reversedKeys) {
            let text = updatedDataForThisTask[key] || "";
            if (text.length + pixelHtml.length <= 1000) { 
                updatedDataForThisTask[key] = text + pixelHtml;
                pixelInjected = true;
                break; 
            }
        }
    }

    const descMatches = updatedTaskDescription.match(urlRegex) || [];
    if (descMatches.length > 0) {
        updatedTaskDescription = updatedTaskDescription.replace(urlRegex, (rawUrl) => {
            if (rawUrl.match(/\.(png|jpg|jpeg|gif|webp|svg)(?:[?#].*)?$/i) || rawUrl.includes('track.gif')) return rawUrl;
            if (!rawUrl.toLowerCase().includes('worker')) return rawUrl;
            if (rawUrl.includes('?email=') || rawUrl.includes('&email=')) return rawUrl;
            const sep = rawUrl.includes('?') ? '&' : '?';
            return `${rawUrl}${sep}email=${encodeURIComponent(email)}&profile=${encodeURIComponent(selectedProfileName + '_Projects')}&ticketId=Projects`;
        });
    }

    if (pixelHtml && !pixelInjected) {
        updatedTaskDescription += pixelHtml;
    }

    return { updatedDataForThisTask, updatedTaskDescription };
}

async function getApiNameMapAndMultiline(portalId, projectId, activeProfile) {
    try {
        const { access_token } = await getValidAccessToken(activeProfile, 'projects');
        const domain = 'https://projectsapi.zoho.com';
        const apiUrl = `${domain}/restapi/portal/${portalId}/projects/${projectId}/tasklayouts`;

        const response = await axios.get(apiUrl, { headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` }, timeout: 10000 });
        
        const layout = response.data;
        if (!layout || !layout.layout_id) throw new Error('No task layout found for this project.');

        const apiNameMap = {};
        const multilineFields = [];
        if (layout.section_details) {
            for (const section of layout.section_details) {
                if (section.customfield_details) {
                    for (const field of section.customfield_details) {
                        apiNameMap[field.column_name] = field.api_name;
                        if (field.column_type === 'multiline') multilineFields.push(field.column_name);
                    }
                }
            }
        }
        apiNameMap["name"] = "name"; 
        return { apiNameMap, multilineFields }; 
    } catch (error) {
        throw new Error(`Failed to get task layout map: ${parseError(error).message}`);
    }
}

function buildSmartV3Payload(data, apiNameMap) {
    const { taskName, taskDescription, tasklistId, bulkDefaultData } = data;
    const payload = { name: taskName, tasklist: { id: tasklistId } };
    if (taskDescription) payload.description = taskDescription;

    if (bulkDefaultData) {
        for (const [columnName, value] of Object.entries(bulkDefaultData)) {
            if (!value) continue; 
            const apiName = apiNameMap[columnName];
            if (apiName) payload[apiName] = value;
        }
    }
    return payload;
}

const setActiveJobs = (jobs) => { activeJobs = jobs; };

const interruptibleSleep = (ms, jobId) => {
    return new Promise(resolve => {
        if (ms <= 0) return resolve();
        const interval = 100;
        let elapsed = 0;
        const timerId = setInterval(() => {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') {
                clearInterval(timerId);
                return resolve();
            }
            elapsed += interval;
            if (elapsed >= ms) {
                clearInterval(timerId);
                resolve();
            }
        }, interval);
    });
};

const handleGetPortals = async (socket, data) => {
    const { clientId, clientSecret, refreshToken } = data;
    const tempProfile = { profileName: `temp_portal_fetch_${clientId || Date.now()}`, clientId, clientSecret, refreshToken, projects: { portalId: '' } };
    try {
        await getValidAccessToken(tempProfile, 'projects');
        const response = await makeApiCall('get', '/portals', null, tempProfile, 'projects');
        if (Array.isArray(response.data) && response.data.length > 0) socket.emit('projectsPortalsResult', { portals: response.data });
        else socket.emit('projectsPortalsResult', { portals: [] });
    } catch (error) { socket.emit('projectsPortalsError', { message: parseError(error).message || 'Failed to fetch portals.' }); }
};

const handleGetProjects = async (socket, data) => {
    const { activeProfile } = data;
    const portalId = activeProfile.projects?.portalId;
    if (!portalId) return socket.emit('projectsProjectsResult', { success: false, error: 'Portal ID missing.', data: [] });

    try {
        const path = `/portal/${portalId}/projects`;
        const response = await makeApiCall('get', path, null, activeProfile, 'projects');
        const projects = Array.isArray(response.data) ? response.data : (response.data.projects || []); 
        socket.emit('projectsProjectsResult', { success: true, data: projects });
    } catch (error) { socket.emit('projectsProjectsResult', { success: false, error: parseError(error).message, data: [] }); }
};

const handleGetTaskLists = async (socket, data) => {
    const { activeProfile, projectId } = data;
    const portalId = activeProfile.projects?.portalId;
    if (!portalId) return socket.emit('projectsTaskListsResult', { success: false, error: 'Portal ID missing.', data: [] });

    try {
        const path = `/portal/${portalId}/all-tasklists`;
        const queryParams = projectId ? { project_id: projectId } : {};
        const response = await makeApiCall('get', path, null, activeProfile, 'projects', queryParams);
        const taskLists = response.data.tasklists || [];
        socket.emit('projectsTaskListsResult', { success: true, data: Array.isArray(taskLists) ? taskLists : [] });
    } catch (error) { socket.emit('projectsTaskListsResult', { success: false, error: parseError(error).message, data: [] }); }
};

const handleGetTasks = async (socket, data) => {
    const { activeProfile, queryParams = {} } = data;
    const portalId = activeProfile.projects?.portalId;
    if (!portalId) return socket.emit('projectsTasksResult', { success: false, error: 'Portal ID missing.', data: [] });

    try {
        const { access_token } = await getValidAccessToken(activeProfile, 'projects');
        const targetLimit = parseInt(queryParams.limit) || 100;
        let allTasks = [];
        
        const projectId = queryParams.project_id;
        let basePath = `/api/v3/portal/${portalId}/tasks`;
        if (projectId) basePath = `/api/v3/portal/${portalId}/projects/${projectId}/tasks`;

        socket.emit('projectsTasksLog', { type: 'info', message: `🚀 Fetching up to ${targetLimit} tasks...` });
        const statusesToFetch = ['open', 'closed'];

        for (const currentStatus of statusesToFetch) {
            if (allTasks.length >= targetLimit) break;
            let page = 1; 
            let hasMore = true;

            while (allTasks.length < targetLimit && hasMore) {
                const per_page = 100; 
                const fetchUrl = `https://projectsapi.zoho.com${basePath}`;

                try {
                    const response = await axios.get(fetchUrl, {
                        headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` },
                        params: { page, per_page, status: currentStatus }, 
                        timeout: 10000 
                    });

                    const tasks = response.data.tasks || [];
                    const newTasks = tasks.filter(t => !allTasks.some(existing => (existing.id_string || String(existing.id)) === (t.id_string || String(t.id))));
                    
                    if (tasks.length === 0 || (newTasks.length === 0 && tasks.length > 0)) hasMore = false; 
                    else { allTasks = allTasks.concat(newTasks); page++; }

                    if (response.data.page_info && response.data.page_info.has_next_page === false) hasMore = false;
                    else if (tasks.length < per_page) hasMore = false;
                } catch (apiError) {
                    if (apiError.response && (apiError.response.status === 400 || apiError.response.status === 404)) { hasMore = false; break; } 
                    else throw apiError;
                }
            }
        }
        if (allTasks.length > targetLimit) allTasks = allTasks.slice(0, targetLimit);
        socket.emit('projectsTasksResult', { success: true, data: allTasks, pageInfo: { total_fetched: allTasks.length } });
    } catch (error) { socket.emit('projectsTasksResult', { success: false, error: error.message, data: [] }); }
};

const handleCreateSingleTask = async (data, providedMap = null) => {
    const { portalId, projectId, tasklistId, selectedProfileName } = data; 
    const profiles = readProfiles();
    const activeProfile = getRealProjectsProfile(profiles, selectedProfileName);
    
    if (!activeProfile || !portalId || !projectId || !tasklistId) return { success: false, error: 'Missing parameters.' };

    try {
        const path = `/portal/${portalId}/projects/${projectId}/tasks`;
        const layoutData = providedMap || await getApiNameMapAndMultiline(portalId, projectId, activeProfile);
        const apiNameMap = layoutData.apiNameMap || layoutData; 
        
        const taskData = buildSmartV3Payload(data, apiNameMap);

        const reverseMap = {};
        if (apiNameMap) Object.entries(apiNameMap).forEach(([label, apiName]) => reverseMap[apiName] = label);

        const response = await makeApiCall('post', path, taskData, activeProfile, 'projects', {}, reverseMap);
        
        let newTask;
        if (response.data && response.data.id && response.data.name) newTask = response.data;
        else if (response.data.tasks && Array.isArray(response.data.tasks) && response.data.tasks.length > 0) newTask = response.data.tasks[0];

        if (newTask) return { success: true, fullResponse: newTask, message: `Task "${newTask.name}" created successfully.`, taskId: newTask.id, taskPrefix: newTask.prefix };
        return { success: false, error: 'Format error', fullResponse: response.data };

    } catch (error) { return { success: false, error: parseError(error).message, fullResponse: parseError(error).fullResponse }; }
};

const handleStartBulkCreateTasks = async (socket, data) => {
    const { formData, selectedProfileName, activeProfile: frontendProfile } = data;
    const { taskName, primaryField, primaryValues, taskDescription, delay, bulkDefaultData, stopAfterFailures = 4, enableTracking, smartSplitterText, appendAccountNumber } = formData; 
    let { projectId, tasklistId } = formData; 
    
    const profiles = readProfiles();
    const realProfile = getRealProjectsProfile(profiles, selectedProfileName);

    const jobId = `${selectedProfileName}_projects`; 
    activeJobs[jobId] = { status: 'running', consecutiveFailures: 0, stopAfterFailures: Number(stopAfterFailures) };
    
    const tasksToProcess = primaryValues.split('\n').map(name => name.trim()).filter(t => t.length > 0);
    if (tasksToProcess.length === 0) return socket.emit('bulkError', { message: 'No valid primary values provided.', profileName: selectedProfileName, jobType: 'projects' });
    
    // 🌟 RELATIONAL DB FIX: Initialize the job correctly without the heavy results array
    try {
        await db.upsertJob({ id: jobId, profileName: selectedProfileName, jobType: 'projects', status: 'running', totalToProcess: tasksToProcess.length, consecutiveFailures: 0, stopAfterFailures: Number(stopAfterFailures), formData: formData, processingStartTime: new Date() });
    } catch(e) { console.error(e) }

    try {
        if (!realProfile) throw new Error("Projects profile not found.");
        
        const portalId = realProfile.projects?.portalId || frontendProfile?.projects?.portalId;
        if (!portalId) throw new Error("Portal ID missing. Please refresh the page to sync your Zoho Portal.");

        if (!projectId) {
            const projResponse = await makeApiCall('get', `/portal/${portalId}/projects`, null, realProfile, 'projects');
            const projList = Array.isArray(projResponse.data) ? projResponse.data : (projResponse.data.projects || []);
            if (projList.length > 0) projectId = projList[0].id;
            else throw new Error("No projects found in this account.");
        }

        if (!tasklistId) {
            const tlResponse = await makeApiCall('get', `/portal/${portalId}/all-tasklists`, null, realProfile, 'projects', { project_id: projectId });
            const tlList = tlResponse.data.tasklists || [];
            if (tlList.length > 0) tasklistId = tlList[0].id;
            else throw new Error("No task lists found in this project.");
        }

        const { apiNameMap, multilineFields } = await getApiNameMapAndMultiline(portalId, projectId, realProfile);

        for (let i = 0; i < tasksToProcess.length; i++) {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            
            while (activeJobs[jobId]?.status === 'paused') {
                db.updateJobStatusByProfile(selectedProfileName, 'projects', 'paused');
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            db.updateJobStatusByProfile(selectedProfileName, 'projects', 'running');

            // 🚨 THE SMART RESUME LOGIC FOR PROJECTS
            if (activeJobs[jobId].stopAfterFailures > 0 && activeJobs[jobId].consecutiveFailures >= activeJobs[jobId].stopAfterFailures) {
                 if (activeJobs[jobId].status !== 'paused') {
                     activeJobs[jobId].status = 'paused';
                     db.updateJobStatusByProfile(selectedProfileName, 'projects', 'paused');
                     socket.emit('jobPaused', { profileName: selectedProfileName, reason: `Paused automatically after ${activeJobs[jobId].stopAfterFailures} consecutive failures. Auto-resuming in 1 minute...` });
                     
                     // 🌟 1 MINUTE AUTO-RESUME
                     setTimeout(() => {
                         if (activeJobs[jobId] && activeJobs[jobId].status === 'paused') {
                             activeJobs[jobId].status = 'running';
                             activeJobs[jobId].consecutiveFailures = 0;
                             db.updateJobStatusByProfile(selectedProfileName, 'projects', 'running');
                             // Force the frontend to resync so the pause button flips back automatically!
                             socket.emit('databaseSync', db.getAllJobs());
                             console.log(`\n[🔄 AUTO-RESUME] 🟢 1 Minute cooldown finished! Resuming Projects for ${selectedProfileName}...`);
                         }
                     }, 60000); 
                 }
                 // Stay in a sleep loop until the 60 seconds are up
                 while (activeJobs[jobId]?.status === 'paused') await new Promise(resolve => setTimeout(resolve, 500));
            }

            if (i > 0 && delay > 0) await interruptibleSleep(delay * 1000, jobId);
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;

            const currentValue = tasksToProcess[i];
            let dataForThisTask = { ...bulkDefaultData }; 
            if (primaryField !== 'name') dataForThisTask[primaryField] = currentValue; 

            if (smartSplitterText && smartSplitterText.trim() !== '') {
                let customSmartText = smartSplitterText;
                if (appendAccountNumber && selectedProfileName) {
                    const suffix = `<br><br><br><br><br><br>${selectedProfileName}`;
                    if (!customSmartText.endsWith(suffix)) customSmartText = `${customSmartText}${suffix}`;
                }
                const sortedFields = [...multilineFields].sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
                if (sortedFields.length > 0) {
                    const numFields = sortedFields.length;
                    const chunkSize = Math.ceil(customSmartText.length / numFields); 
                    for (let j = 0; j < numFields; j++) {
                        const fieldApiName = sortedFields[j];
                        const startIndex = j * chunkSize;
                        dataForThisTask[fieldApiName] = customSmartText.substring(startIndex, startIndex + chunkSize);
                    }
                }
            } else if (appendAccountNumber && selectedProfileName) {
                const accountIndex = profiles.findIndex(p => p.profileName === selectedProfileName) + 1;
                const sortedFields = [...multilineFields].sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
                sortedFields.forEach(key => {
                    if (dataForThisTask[key] && typeof dataForThisTask[key] === 'string') {
                        const prefix = `${selectedProfileName}<br><br>`;
                        if (!dataForThisTask[key].startsWith(prefix)) dataForThisTask[key] = `${prefix}${dataForThisTask[key]}<br><br><br>account number ${accountIndex}`;
                    }
                });
            }

            const trackingData = injectProjectsTracking(dataForThisTask, taskDescription, currentValue, selectedProfileName, realProfile.projects, enableTracking);
            dataForThisTask = trackingData.updatedDataForThisTask;

            let result;
            let retryCount = 0;
            let taskCreated = false;

            while (!taskCreated && retryCount < 3) {
                if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;

                result = await handleCreateSingleTask({
                    portalId, projectId, taskName: primaryField === 'name' ? currentValue : `${taskName}_${i + 1}`, 
                    taskDescription: trackingData.updatedTaskDescription, tasklistId, selectedProfileName, bulkDefaultData: dataForThisTask 
                }, { apiNameMap, multilineFields }); 

                if (result.success) {
                    taskCreated = true;
                } else {
                    const errStr = String(result.error).toLowerCase();
                    if (errStr.includes('task list') || errStr.includes('tasklist') || errStr.includes('limit') || errStr.includes('timeout')) {
                        retryCount++;
                        await interruptibleSleep(15000, jobId);
                    } else { break; }
                }
            }
            
            let resultData = { projectName: currentValue, profileName: selectedProfileName };
            if (result.success) {
                activeJobs[jobId].consecutiveFailures = 0;
                resultData = { ...resultData, success: true, details: result.message, fullResponse: result.fullResponse };
            } else {
                activeJobs[jobId].consecutiveFailures++;
                resultData = { ...resultData, success: false, error: result.error, fullResponse: result.fullResponse };
            }
            
            // 🌟 RELATIONAL DB SPEED FIX: Instantly write ONE row to SQLite instead of rewriting a massive JSON array!
            await db.insertJobResult(jobId, resultData);
            await db.updateJobProgress(jobId, activeJobs[jobId].status, activeJobs[jobId].consecutiveFailures);
            
            socket.emit('projectsResult', resultData);
        }
    } catch (error) {
        db.updateJobStatusByProfile(selectedProfileName, 'projects', 'error');
        socket.emit('bulkError', { message: error.message, profileName: selectedProfileName, jobType: 'projects' });
    } finally {
        if (activeJobs[jobId]) {
            if (activeJobs[jobId].status === 'ended') {
                db.updateJobStatusByProfile(selectedProfileName, 'projects', 'ended');
                socket.emit('bulkEnded', { profileName: selectedProfileName, jobType: 'projects' });
            } else {
                db.updateJobStatusByProfile(selectedProfileName, 'projects', 'complete');
                socket.emit('bulkComplete', { profileName: selectedProfileName, jobType: 'projects' });
            }
            delete activeJobs[jobId];
        }
    }
};

const handleStartBulkDeleteTasks = async (socket, data) => {
    const { activeProfile: frontendProfile, selectedProfileName, portalId, projectId, taskIds, deleteAll } = data;
    const profiles = readProfiles();
    const activeProfile = getRealProjectsProfile(profiles, selectedProfileName) || frontendProfile;
    const jobId = createJobId(socket.id, selectedProfileName, 'projects_delete');
    activeJobs[jobId] = { status: 'running', type: 'delete' };

    try {
        let { access_token } = await getValidAccessToken(activeProfile, 'projects');
        const domain = 'https://projectsapi.zoho.com';
        let targetIds = taskIds || [];

        if (deleteAll) {
             targetIds = [];
             const statusesToFetch = ['open', 'closed'];
             for (const currentStatus of statusesToFetch) {
                 let page = 1;
                 let hasMore = true;
                 while(hasMore && activeJobs[jobId].status !== 'ended') {
                     const fetchUrl = `${domain}/api/v3/portal/${portalId}/projects/${projectId}/tasks`;
                     try {
                         const response = await axios.get(fetchUrl, { headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` }, params: { page, per_page: 100, status: currentStatus }, timeout: 10000 });
                         const tasks = response.data.tasks || [];
                         const newTasks = tasks.filter(t => !targetIds.includes(t.id_string || String(t.id)));
                         
                         if (newTasks.length > 0) { targetIds.push(...newTasks.map(t => t.id_string || String(t.id))); page++; } 
                         else { hasMore = false; }
                         if (response.data.page_info && response.data.page_info.has_next_page === false) hasMore = false;
                     } catch(err) {
                         if (err.response && (err.response.status === 400 || err.response.status === 404)) hasMore = false; 
                         else throw err;
                     }
                 }
             }
        }

        activeJobs[jobId].totalToProcess = targetIds.length;
        socket.emit('projectsDeleteStarted', { total: targetIds.length, profileName: selectedProfileName });

        for (let i = 0; i < targetIds.length; i++) {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            const taskId = targetIds[i];
            let isDeleted = false;
            let retryCount = 0;

            while (!isDeleted && retryCount < 3) {
                if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
                try {
                    const deleteUrl = `${domain}/api/v3/portal/${portalId}/projects/${projectId}/tasks/${taskId}`;
                    await axios.delete(deleteUrl, { headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` }, timeout: 10000 });
                    socket.emit('projectsDeleteResult', { success: true, taskId, profileName: selectedProfileName });
                    isDeleted = true;
                } catch (err) {
                    const status = err.response?.status;
                    const errorCode = err.response?.data?.error?.code;
                    let errorMessage = err.message;
                    if (err.response) errorMessage = err.response.data?.error?.details?.[0]?.message || err.response.data?.message || err.message;

                    if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) { retryCount++; await interruptibleSleep(2000, jobId); } 
                    else if (status === 401) { const refreshed = await getValidAccessToken(activeProfile, 'projects', true); access_token = refreshed.access_token; retryCount++; } 
                    else if (status === 429 || errorCode === 8535 || errorCode === 6504 || (errorMessage && errorMessage.toLowerCase().includes('more than'))) {
                        let waitMinutes = 2; const waitMatch = errorMessage.match(/after (\d+) minutes/);
                        if (waitMatch) waitMinutes = parseInt(waitMatch[1]) + 1;
                        await interruptibleSleep(waitMinutes * 60000, jobId); retryCount++;
                    } 
                    else if (status >= 500) { await interruptibleSleep(10000, jobId); retryCount++; } 
                    else if (status === 404) { socket.emit('projectsDeleteResult', { success: true, taskId, profileName: selectedProfileName }); isDeleted = true; } 
                    else { socket.emit('projectsDeleteResult', { success: false, taskId, error: errorMessage, profileName: selectedProfileName }); break; }
                }
            }
            await interruptibleSleep(1500, jobId); 
        }
    } catch (err) { socket.emit('projectsDeleteError', { message: err.message, profileName: selectedProfileName }); } 
    finally { if (activeJobs[jobId]) { socket.emit('bulkDeleteComplete', { profileName: selectedProfileName }); delete activeJobs[jobId]; } }
};

const handleGetTaskLayout = async (socket, data) => {
    const { activeProfile, projectId } = data;
    const portalId = activeProfile.projects?.portalId;
    if (!portalId || !projectId) return socket.emit('projectsTaskLayoutResult', { success: false, error: 'Portal/Project missing.' });
    try {
        const { access_token } = await getValidAccessToken(activeProfile, 'projects');
        const apiUrl = `https://projectsapi.zoho.com/restapi/portal/${portalId}/projects/${projectId}/tasklayouts`;
        const response = await axios.get(apiUrl, { headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` }, timeout: 10000 });
        const layout = response.data; 
        if (!layout || !layout.layout_id) throw new Error('No task layout found.');
        socket.emit('projectsTaskLayoutResult', { success: true, data: layout });
    } catch (error) { socket.emit('projectsTaskLayoutResult', { success: false, error: error.response?.data?.error?.details?.[0]?.message || error.response?.data?.message || error.message, fullResponse: error.response?.data }); }
};

const handleGetProjectDetails = async (socket, data) => {
    const { activeProfile, portalId, projectId } = data;
    if (!portalId || !projectId) return socket.emit('projectsProjectDetailsError', { success: false, error: 'Portal/Project ID missing.' });
    try {
        const { access_token } = await getValidAccessToken(activeProfile, 'projects');
        const apiUrl = `https://projectsapi.zoho.com/api/v3/portal/${portalId}/projects/${projectId}`;
        const response = await axios.get(apiUrl, { headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` }, timeout: 10000 });
        socket.emit('projectsProjectDetailsResult', { success: true, data: response.data });
    } catch (error) { socket.emit('projectsProjectDetailsError', { success: false, error: parseError(error).message, fullResponse: parseError(error).fullResponse }); }
};

const handleUpdateProjectDetails = async (socket, data) => {
    const { activeProfile, portalId, projectId, payload } = data; 
    if (!portalId || !projectId || !payload) return socket.emit('projectsUpdateProjectError', { success: false, error: 'Missing parameters.' });
    try {
        const { access_token } = await getValidAccessToken(activeProfile, 'projects');
        const apiUrl = `https://projectsapi.zoho.com/api/v3/portal/${portalId}/projects/${projectId}`;
        const response = await axios.patch(apiUrl, payload, { headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` }, timeout: 10000 });
        socket.emit('projectsUpdateProjectResult', { success: true, data: response.data });
    } catch (error) { socket.emit('projectsUpdateProjectError', { success: false, error: parseError(error).message, fullResponse: parseError(error).fullResponse }); }
};

const getTaskModuleId = async (portalId, activeProfile) => {
    const { access_token } = await getValidAccessToken(activeProfile, 'projects');
    const apiUrl = `https://projectsapi.zoho.com/api/v3/portal/${portalId}/settings/modules`;
    const response = await axios.get(apiUrl, { headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` }, timeout: 10000 });
    const modules = Array.isArray(response.data) ? response.data : (response.data?.modules || response.data?.data || []);
    const taskModule = modules.find((module) => {
        const candidates = [module?.api_name, module?.name, module?.module_name, module?.display_name].filter(Boolean).map(v => String(v).toLowerCase());
        return candidates.includes('tasks') || candidates.includes('task');
    });
    if (!taskModule) throw new Error('Could not find the Tasks module in Zoho Projects.');
    return taskModule.id || taskModule.module_id || taskModule.moduleId;
};

const findFieldInLayout = (layout, fieldLookupValue) => {
    if (!layout || !Array.isArray(layout.section_details)) return null;
    for (const section of layout.section_details) {
        const fields = section.customfield_details || [];
        const found = fields.find((field) => {
            const candidates = [ field.column_name, field.api_name, field.display_name, field.i18n_display_name, field.id, field.field_id ].filter(Boolean).map(v => String(v).toLowerCase());
            return candidates.includes(String(fieldLookupValue || '').toLowerCase());
        });
        if (found) return found;
    }
    return null;
};

const handleCreateTaskField = async ({ activeProfile, portalId, projectId, layoutId, displayName, fieldType }) => {
    const { access_token } = await getValidAccessToken(activeProfile, 'projects');
    const moduleId = await getTaskModuleId(portalId, activeProfile);
    const layoutResponse = await axios.get(`https://projectsapi.zoho.com/restapi/portal/${portalId}/projects/${projectId}/tasklayouts`, { headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` }, timeout: 10000 });
    const firstSection = layoutResponse.data?.section_details?.[0];
    const sectionId = firstSection?.id || firstSection?.section_id;
    if (!sectionId) throw new Error("Could not locate a Section ID.");

    let exactFieldType = "singleline";
    if (fieldType === "multiline" || fieldType === "textarea") exactFieldType = "multiline";
    if (fieldType === "integer" || fieldType === "number") exactFieldType = "integer";
    if (fieldType === "email") exactFieldType = "email"; 
    
    const fieldPayload = { module: String(moduleId), layout_id: String(layoutId), section_id: String(sectionId), field_type: exactFieldType, display_name: displayName, field_property: { is_pii: false, is_encrypted: false, context_property: { is_mandatory: false, has_info: false } } };
    const createFieldUrl = `https://projectsapi.zoho.com/api/v3/portal/${portalId}/settings/fields`;

    try {
        const createdFieldResponse = await axios.put(createFieldUrl, fieldPayload, { headers: { 'Authorization': `Zoho-oauthtoken ${access_token}`, 'Content-Type': 'application/json' }, timeout: 10000 });
        return { success: true, message: 'Field created successfully!', fullResponse: createdFieldResponse.data };
    } catch (error) { throw new Error(`Zoho field create failed: ${error.response?.data?.error?.details?.[0]?.message || error.response?.data?.message || error.message}`); }
};

const handleUpdateTaskField = async ({ activeProfile, portalId, projectId, fieldIdentifier, displayName }) => {
    if (!portalId || !projectId || !fieldIdentifier || !displayName) throw new Error('Missing required parameters for field update.');
    const { access_token } = await getValidAccessToken(activeProfile, 'projects');
    const moduleId = await getTaskModuleId(portalId, activeProfile);
    const currentLayoutResponse = await axios.get(`https://projectsapi.zoho.com/restapi/portal/${portalId}/projects/${projectId}/tasklayouts`, { headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` }, timeout: 10000 });
    const existingField = findFieldInLayout(currentLayoutResponse.data, fieldIdentifier);
    const resolvedFieldId = existingField?.id || existingField?.field_id || fieldIdentifier;
    const resolvedDataType = existingField?.column_type || existingField?.data_type || 'text';
    const updateUrl = `https://projectsapi.zoho.com/api/v3/portal/${portalId}/module/${moduleId}/fields`;

    try {
        const response = await axios.put(updateUrl, { id: resolvedFieldId, display_name: displayName, data_type: resolvedDataType }, { headers: { 'Authorization': `Zoho-oauthtoken ${access_token}`, 'Content-Type': 'application/json' }, timeout: 10000 });
        return { success: true, message: 'Field updated successfully.', fullResponse: response.data };
    } catch (error) { throw new Error(`Zoho field update failed: ${error.response?.data?.error?.details?.[0]?.message || error.response?.data?.message || error.message}`); }
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
    setActiveJobs, handleGetPortals, handleGetProjects, handleGetTaskLists, handleGetTasks, handleCreateSingleTask, handleStartBulkCreateTasks, handleStartBulkDeleteTasks, handleGetTaskLayout, handleUpdateProjectDetails, handleGetProjectDetails, handleCreateTaskField, handleUpdateTaskField, handleClearJob, handleClearAllJobs      
};