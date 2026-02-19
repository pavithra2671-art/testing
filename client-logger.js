// client-logger.js
// Run this script on each laptop using: node client-logger.js

import os from "os";
import axios from "axios";

// UPDATE THIS URL if your backend is hosted remotely
const BACKEND_URL = "http://localhost:5000/api/system-logs";

// Helper function to get IP address
const getIPAddress = () => {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal (i.e. 127.0.0.1) and non-ipv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                addresses.push({ name, address: iface.address, mac: iface.mac });
            }
        }
    }
    return addresses;
};

let publicIP = null;

const getPublicIP = async () => {
    try {
        const response = await axios.get('https://api.ipify.org?format=json');
        publicIP = response.data.ip;
    } catch (error) {
        console.error("Error fetching public IP:", error.message);
        publicIP = "Unavailable";
    }
};

// Fetch Public IP once on startup
getPublicIP();
// Re-fetch Public IP every hour
setInterval(getPublicIP, 3600000);

console.log(`Starting Remote System Logger...`);
console.log(`Sending logs to: ${BACKEND_URL}`);
console.log(`Press Ctrl+C to stop.`);

setInterval(async () => {
    const memory = process.memoryUsage();
    const localIPs = getIPAddress();

    // Total System Memory (Client Side Specific)
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const logData = {
        hostname: os.hostname(),
        publicIP: publicIP || "Unavailable",
        localIPs: localIPs,
        ramUsage: {
            // Node Process Memory
            rss: (memory.rss / 1024 / 1024).toFixed(2) + " MB",
            heapTotal: (memory.heapTotal / 1024 / 1024).toFixed(2) + " MB",
            heapUsed: (memory.heapUsed / 1024 / 1024).toFixed(2) + " MB",
            // System Memory
            systemTotal: (totalMem / 1024 / 1024 / 1024).toFixed(2) + " GB",
            systemUsed: (usedMem / 1024 / 1024 / 1024).toFixed(2) + " GB",
            systemFree: (freeMem / 1024 / 1024 / 1024).toFixed(2) + " GB"
        },
    };

    try {
        await axios.post(BACKEND_URL, logData);
        process.stdout.write("."); // Indicator
    } catch (error) {
        console.error("\nError sending log:", error.message);
    }

}, 1000); // 1 second interval
