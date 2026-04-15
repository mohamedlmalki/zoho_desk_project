// --- FILE: server/queue.js ---
const { Queue, QueueEvents } = require('bullmq');
const IORedis = require('ioredis');

// Connect to your local Memurai/Redis server
const connection = new IORedis({
    host: '127.0.0.1',
    port: 6379,
    maxRetriesPerRequest: null
});

// Create the To-Do List
const ticketQueue = new Queue('ticketQueue', { connection });

// Create the Walkie-Talkie to listen to finished jobs
const ticketQueueEvents = new QueueEvents('ticketQueue', { connection });

module.exports = { ticketQueue, ticketQueueEvents, connection };