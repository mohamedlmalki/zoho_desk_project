const cliProgress = require('cli-progress');

// Design the progress bar look
const multibar = new cliProgress.MultiBar({
    clearOnComplete: false,
    hideCursor: true,
    format: ' {profile} | {bar} | {percentage}% | {value}/{total} Tickets | ✅ {success} | ❌ {failed}'
}, cliProgress.Presets.shades_classic);

const activeBars = {};

module.exports = {
    initBar: (profileName, total) => {
        // Keep the names perfectly aligned by padding with spaces (up to 15 chars)
        const paddedName = profileName.padEnd(15, ' ').substring(0, 15);
        if (!activeBars[profileName]) {
            activeBars[profileName] = multibar.create(total, 0, { profile: paddedName, success: 0, failed: 0 });
        } else {
            activeBars[profileName].setTotal(total);
            activeBars[profileName].update(0, { profile: paddedName, success: 0, failed: 0 });
        }
    },
    updateBar: (profileName, current, success, failed) => {
        if (activeBars[profileName]) {
            activeBars[profileName].update(current, { success, failed });
        }
    },
    // Use this to log system messages safely without breaking the progress bars
    log: (message) => {
        multibar.log(message + '\n');
    }
};