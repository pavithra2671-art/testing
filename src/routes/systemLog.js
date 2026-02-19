import express from "express";
import SystemLog from "../models/SystemLog.js";

const router = express.Router();

// @route   POST /api/system-logs
// @desc    Save system logs from remote clients
// @access  Public (or protected if needed)
router.post("/", async (req, res) => {
    try {
        const { hostname, publicIP, localIPs, ramUsage } = req.body;

        // Basic validation
        if (!hostname || !publicIP || !localIPs || !ramUsage) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const newLog = new SystemLog({
            hostname,
            publicIP,
            localIPs,
            ramUsage,
        });

        await newLog.save();
        res.status(201).json({ message: "Log saved successfully" });
    } catch (error) {
        console.error("Error saving remote system log:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

export default router;
