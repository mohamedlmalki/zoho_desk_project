// --- FILE: server/database.js ---
const Database = require('better-sqlite3');
const path = require('path');

// Color logs for the terminal
const colors = { green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', reset: '\x1b[0m' };

// Initialize local SQLite Database
const dbPath = path.join(__dirname, 'zoho_jobs.db');
const db = new Database(dbPath);

// 🚀 MASSIVE SPEED BOOST FOR SQLITE
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// Initialize Tables on startup
try {
    console.log(`${colors.yellow}[DB] Initializing ultra-fast local SQLite database...${colors.reset}`);
    
    // The main jobs table (Removed the heavy 'results' column)
    db.prepare(`
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            profileName TEXT NOT NULL,
            jobType TEXT NOT NULL,
            status TEXT NOT NULL,
            totalToProcess INTEGER DEFAULT 0,
            consecutiveFailures INTEGER DEFAULT 0,
            stopAfterFailures INTEGER DEFAULT 0,
            processingTime INTEGER DEFAULT 0,
            processingStartTime TEXT,
            formData TEXT,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    // 🌟 THE FIX: The new Relational Table for results
    db.prepare(`
        CREATE TABLE IF NOT EXISTS job_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jobId TEXT NOT NULL,
            email TEXT,
            projectName TEXT,
            success INTEGER,
            ticketNumber TEXT,
            details TEXT,
            fullResponse TEXT,
            profileName TEXT,
            time TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(jobId) REFERENCES jobs(id) ON DELETE CASCADE
        )
    `).run();

    // The Master Engine State
    db.prepare(`
        CREATE TABLE IF NOT EXISTS engine_state (
            id TEXT PRIMARY KEY,
            queue TEXT,
            mode TEXT,
            isPaused INTEGER
        )
    `).run();

    console.log(`${colors.green}[DB] ✅ Local database is ready and optimized!${colors.reset}`);
} catch (err) {
    console.error(`${colors.red}[DB ERROR] ❌ Failed to initialize SQLite. Error: ${err.message}${colors.reset}`);
}

// Export Async Wrappers so the rest of the app doesn't break!
module.exports = {
    upsertJob: async (job) => {
        const formDataStr = JSON.stringify(job.formData || {});
        const processingStartTime = job.processingStartTime ? new Date(job.processingStartTime).toISOString().slice(0, 19).replace('T', ' ') : null;

        const stmt = db.prepare(`
            INSERT INTO jobs (id, profileName, jobType, status, totalToProcess, consecutiveFailures, stopAfterFailures, formData, processingStartTime)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                totalToProcess = excluded.totalToProcess,
                consecutiveFailures = excluded.consecutiveFailures,
                stopAfterFailures = excluded.stopAfterFailures,
                formData = excluded.formData,
                processingStartTime = COALESCE(excluded.processingStartTime, jobs.processingStartTime)
        `);
        stmt.run(job.id, job.profileName, job.jobType, job.status, job.totalToProcess, job.consecutiveFailures, job.stopAfterFailures, formDataStr, processingStartTime);
    },

    updateJobProgress: async (id, status, consecutiveFailures) => {
        const stmt = db.prepare(`UPDATE jobs SET status = ?, consecutiveFailures = ? WHERE id = ?`);
        stmt.run(status, consecutiveFailures, id);
    },

    insertJobResult: async (jobId, result) => {
        const stmt = db.prepare(`
            INSERT INTO job_results (jobId, email, projectName, success, ticketNumber, details, fullResponse, profileName, time, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        let details = result.details || result.error || null;
        let successInt = result.success ? 1 : 0;
        let fullResponseStr = result.fullResponse ? JSON.stringify(result.fullResponse) : null;
        let timestamp = result.timestamp ? new Date(result.timestamp).toISOString() : new Date().toISOString();

        stmt.run(jobId, result.email || null, result.projectName || null, successInt, result.ticketNumber || null, details, fullResponseStr, result.profileName || null, result.time || null, timestamp);
    },

    updateJobStatusByProfile: async (profileName, jobType, status) => {
        const stmt = db.prepare(`UPDATE jobs SET status = ? WHERE profileName = ? AND jobType = ? AND status != 'ended' AND status != 'complete'`);
        stmt.run(status, profileName, jobType);
    },

    getJobById: async (id) => {
        // 🚨 FIXED: Passed the 'id' parameter into the get() and all() functions
        const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
        if (!job) return null;
        try { job.formData = JSON.parse(job.formData); } catch(e) { job.formData = {}; }
        
        const results = db.prepare('SELECT * FROM job_results WHERE jobId = ? ORDER BY id ASC').all(id);
        job.results = results.map(r => ({
            ...r,
            success: r.success === 1,
            fullResponse: r.fullResponse ? JSON.parse(r.fullResponse) : null,
            error: r.success === 0 ? r.details : undefined
        }));
        return job;
    },

    getAllJobs: async () => {
        const jobs = db.prepare('SELECT * FROM jobs').all();
        
        return jobs.map(row => {
            let currentProcessingTime = row.processingTime || 0;
            if ((row.status === 'running' || row.status === 'paused') && row.processingStartTime) {
                const startTimestamp = new Date(row.processingStartTime + 'Z').getTime(); 
                currentProcessingTime += Math.floor((Date.now() - startTimestamp) / 1000);
            }

            // 🚨 FIXED: Passed 'row.id' into the all() function here!
            const results = db.prepare('SELECT * FROM job_results WHERE jobId = ? ORDER BY id ASC').all(row.id);
            const total = results.length;

            const safeResults = results.map((r, index) => {
                let parsedResponse = null;
                try { if (r.fullResponse) parsedResponse = JSON.parse(r.fullResponse); } catch(e){}

                const lightweight = {
                    email: r.email,
                    projectName: r.projectName,
                    success: r.success === 1,
                    ticketNumber: r.ticketNumber,
                    details: r.details,
                    profileName: r.profileName,
                    time: r.time,
                    timestamp: r.timestamp
                };

                if (!lightweight.success) lightweight.error = r.details;

                if (total - index <= 50) {
                    lightweight.fullResponse = parsedResponse;
                }
                return lightweight;
            });

            return {
                ...row,
                processingTime: currentProcessingTime,
                formData: JSON.parse(row.formData || "{}"),
                results: safeResults
            };
        });
    },

    deleteJob: async (profileName, jobType) => {
        const stmt = db.prepare('DELETE FROM jobs WHERE profileName = ? AND jobType = ?');
        const info = stmt.run(profileName, jobType);
        return { affectedRows: info.changes };
    },

    deleteAllJobsByType: async (jobType) => {
        const stmt = db.prepare('DELETE FROM jobs WHERE jobType = ?');
        const info = stmt.run(jobType);
        return { affectedRows: info.changes };
    },

    saveEngineState: async (state) => {
        const stmt = db.prepare(`
            INSERT INTO engine_state (id, queue, mode, isPaused)
            VALUES ('master', ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET queue = excluded.queue, mode = excluded.mode, isPaused = excluded.isPaused
        `);
        stmt.run(JSON.stringify(state.queue || []), state.mode || 'none', state.isPaused ? 1 : 0);
    },

    getEngineState: async () => {
        const row = db.prepare("SELECT * FROM engine_state WHERE id = 'master'").get();
        if (!row) return { queue: [], mode: 'none', isPaused: false };
        return {
            queue: JSON.parse(row.queue || "[]"),
            mode: row.mode,
            isPaused: Boolean(row.isPaused)
        };
    }
};