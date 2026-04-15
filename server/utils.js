// --- FILE: server/utils.js ---
const http = require('http');
const https = require('https');

// The "Carpool" - reuses network ports so Windows doesn't freeze
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data'); 

const WORKER_URL = "https://zoho-ops-logger.arfilm47.workers.dev"; 

const PROFILES_PATH = path.join(__dirname, 'profiles.json');
const tokenCache = {};

const readProfiles = () => { try { if (fs.existsSync(PROFILES_PATH)) { return JSON.parse(fs.readFileSync(PROFILES_PATH)); } } catch (e) { console.error(e); } return []; };
const writeProfiles = (profiles) => { try { fs.writeFileSync(PROFILES_PATH, JSON.stringify(profiles, null, 2)); } catch (e) { console.error(e); } };

// 🔥 FIX: Jobs are now tracked by Profile Name, NOT the browser tab ID!
const createJobId = (socketId, profileName, jobType) => `${profileName}_${jobType}`;

const parseError = (error) => {
    if (error.response) return { message: `HTTP ${error.response.status}`, fullResponse: error.response.data };
    return { message: error.message || 'Unknown Error', fullResponse: error.stack };
};

const getValidAccessToken = async (profile, service) => {
    const now = Date.now();
    const cacheKey = `${profile.profileName}_${service}`;
    if (tokenCache[cacheKey] && tokenCache[cacheKey].data.access_token && tokenCache[cacheKey].expiresAt > now) return tokenCache[cacheKey].data;

    // Scopes strictly for Desk and Projects
    const scopes = {
        desk: 'Desk.tickets.ALL,Desk.settings.ALL,Desk.basic.READ',
        projects: 'ZohoProjects.portals.ALL,ZohoProjects.projects.ALL,ZohoProjects.tasklists.ALL,ZohoProjects.tasks.ALL,ZohoProjects.custom_fields.READ,ZohoProjects.custom_fields.CREATE'
    };

    const requiredScope = scopes[service];
    if (!requiredScope) throw new Error(`Invalid service: ${service}`);

    try {
        const params = new URLSearchParams({
            refresh_token: profile.refreshToken,
            client_id: profile.clientId,
            client_secret: profile.clientSecret,
            grant_type: 'refresh_token',
            scope: requiredScope
        });
        const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', params);
        if (response.data.error) throw new Error(response.data.error);
        
        tokenCache[cacheKey] = { data: response.data, expiresAt: now + ((response.data.expires_in - 60) * 1000) };
        return response.data;
    } catch (error) {
        throw error;
    }
};

function extractDetails(service, data, logExtras) {
    if (!data) return "No Data Payload";
    if (data instanceof FormData) return "📦 FormData Payload (File Upload)";
    
    let cleanData = data;
    if (data instanceof URLSearchParams) {
        cleanData = Object.fromEntries(data);
    } else if (data.data) {
        cleanData = data.data; 
    }

    const jsonKeys = ['inputData', 'customer_details', 'data'];
    jsonKeys.forEach(key => {
        if (cleanData && cleanData[key] && typeof cleanData[key] === 'string') {
            try {
                const inner = JSON.parse(cleanData[key]);
                cleanData = { ...cleanData, ...inner };
                delete cleanData[key];
            } catch (e) {}
        }
    });

    if (Array.isArray(cleanData)) {
        if (cleanData.length === 0) return "Empty Data Array";
        cleanData = cleanData[0]; 
    }

    const get = (obj, key) => {
        if (!obj || typeof obj !== 'object') return null;
        const foundKey = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
        return foundKey ? obj[foundKey] : null;
    };

    if (service === 'desk') {
        const subject = get(cleanData, 'subject');
        if (subject) {
            const email = get(cleanData, 'email') || (cleanData.contact ? get(cleanData.contact, 'email') : "No Email");
            let desc = get(cleanData, 'description') || "";
            if (desc.length > 50) desc = desc.substring(0, 50) + "...";
            return `🎫 Ticket: ${subject} | 📧 ${email}${desc ? ' | 📝 ' + desc : ''}`;
        }
        const content = get(cleanData, 'content');
        if (content) {
            const cleanContent = content.replace(/<[^>]*>?/gm, '').substring(0, 40);
            return `💬 Desk Reply: ${cleanContent}...`;
        }
        const status = get(cleanData, 'status');
        if (status) return `🔄 Desk Status: ${status}`;
        const keys = Object.keys(cleanData).join(', ');
        return keys.length > 0 ? `⚙️ Desk Operation: ${keys}` : `⚙️ Desk Operation (No Data)`;
    }

    if (service === 'projects') {
        const ignoredKeys = ['layout_id', 'auth_token', 'authtoken', 'scope', 'tasklist', 'tasklist_id', 'form_link_name', 'inputData', 'recordId'];
        
        const details = Object.entries(cleanData)
            .filter(([key, value]) => !ignoredKeys.includes(key) && value) 
            .map(([key, value]) => {
                let label = null;
                if (logExtras) label = logExtras[key] || logExtras[key.toLowerCase()];
                if (typeof value === 'object') return null; 
                if (label) return `${label}: ${value}`;
                return `${key}: ${value}`;
            })
            .filter(Boolean)
            .join(' | ');
        
        return `✅ Task: ${details || "Unknown"}`;
    }

    return `Payload Keys: ${Object.keys(cleanData).join(', ')}`;
}

const logToWorker = (service, method, fullUrl, status, data, logExtras = null) => {
    const summary = extractDetails(service, data, logExtras);
    
    let logBody = data;
    if (data instanceof FormData) {
        logBody = { info: "FormData Object (Hidden)" };
    } else if (data instanceof URLSearchParams) {
        logBody = Object.fromEntries(data);
        const jsonKeys = ['inputData', 'customer_details', 'data'];
        jsonKeys.forEach(key => {
            if (logBody[key] && typeof logBody[key] === 'string') {
                try {
                    const inner = JSON.parse(logBody[key]);
                    logBody = { ...logBody, ...inner };
                    delete logBody[key];
                } catch(e) {}
            }
        });
    }

    const logEntry = {
        source: `zoho-${service}`,
        method: method.toUpperCase(),
        path: fullUrl,
        status: status,
        body: logBody, 
        summary: summary 
    };
    axios.post(WORKER_URL, logEntry).catch(() => {});
};

const makeApiCall = async (method, relativeUrl, data, profile, service, queryParams = {}, logExtras = null, skipWorkerLog = false) => {
    const tokenResponse = await getValidAccessToken(profile, service);
    const accessToken = tokenResponse.access_token;
    
    // Only keeping Desk and Projects Base URLs
    const baseUrls = {
        desk: 'https://desk.zoho.com', 
        projects: 'https://projectsapi.zoho.com/api/v3'
    };
    
    const fullUrl = `${baseUrls[service]}${relativeUrl}`;

    const headers = { 'Authorization': `Zoho-oauthtoken ${accessToken}` };
    if (service === 'desk' && profile.desk?.orgId) headers['orgId'] = profile.desk.orgId;
    
    let requestData = data;
    
    if (data instanceof FormData) {
        headers['Content-Type'] = 'multipart/form-data'; 
    }

    const axiosConfig = { 
        method, 
        url: fullUrl, 
        data: requestData, 
        headers, 
        params: queryParams,
        httpAgent,     // <-- Added Carpool
        httpsAgent     // <-- Added Carpool
    };
    
    const isWriteAction = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());
    
    try {
        const response = await axios(axiosConfig);

        if (isWriteAction && !skipWorkerLog) {
            logToWorker(service, method, fullUrl, response.status, data, logExtras);
        }
        return response;

    } catch (error) {
        let logBody = data;
        if (data instanceof FormData) logBody = "FormData";
        else if (data instanceof URLSearchParams) logBody = Object.fromEntries(data);

        const errorLog = {
            source: `zoho-${service}-error`,
            method: method.toUpperCase(),
            path: fullUrl,
            status: error.response ? error.response.status : 500,
            error: error.message,
            body: logBody,
            summary: "❌ Failed Request"
        };
        axios.post(WORKER_URL, errorLog).catch(() => {});
        throw error;
    }
};

module.exports = {
    readProfiles, writeProfiles,
    createJobId, parseError, getValidAccessToken, makeApiCall, logToWorker
};