import mongoose from "mongoose";

const SystemLogSchema = new mongoose.Schema({
    hostname: {
        type: String,
        required: true,
    },
    publicIP: {
        type: String,
        required: true,
    },
    localIPs: [
        {
            name: String,
            address: String,
            mac: String,
        },
    ],
    ramUsage: {
        rss: String,
        heapTotal: String,
        heapUsed: String,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
});

// Auto-delete logs older than 7 days (optional, to prevent DB bloat)
SystemLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 });

const SystemLog = mongoose.model("SystemLog", SystemLogSchema);

export default SystemLog;
