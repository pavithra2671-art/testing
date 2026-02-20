import express from "express";
import SystemLog from "../models/SystemLog.js";
import { verifyToken, authorizeRole } from "../middleware/authMiddleware.js";

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
            type: "server", // assuming original was meant for server or generic remote telemetry
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

// @route   POST /api/system-logs/client
// @desc    Save client RAM usage
// @access  Private
router.post("/client", verifyToken, async (req, res) => {
    try {
        const { ramUsage } = req.body;
        const userAgent = req.headers['user-agent'];

        if (!ramUsage) {
            return res.status(400).json({ message: "Missing ramUsage data" });
        }

        const newLog = new SystemLog({
            type: "client",
            userId: req.user._id,
            userAgent,
            ramUsage
        });

        await newLog.save();
        res.status(201).json({ message: "Client memory log saved successfully" });
    } catch (error) {
        console.error("Error saving client memory log:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

// @route   GET /api/system-logs/clients/active
// @desc    Get latest RAM usage of active clients (last 5 mins)
// @access  Private (Admin/HR)
router.get("/clients/active", verifyToken, authorizeRole("admin", "hr"), async (req, res) => {
    try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

        const activeClients = await SystemLog.aggregate([
            {
                $match: {
                    type: "client",
                    timestamp: { $gte: fiveMinutesAgo }
                }
            },
            {
                $sort: { timestamp: -1 }
            },
            {
                $group: {
                    _id: "$userId",
                    latestLog: { $first: "$$ROOT" }
                }
            },
            {
                $lookup: {
                    from: "users", // Assuming User model is mapped to "users" collection (often "employees" in this codebase but auth uses User model?) Wait, the app uses standard `User` model but authMiddleware says `import User from '../models/User.js'`.
                    localField: "_id",
                    foreignField: "_id",
                    as: "userDetails"
                }
            },
            {
                $unwind: {
                    path: "$userDetails",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: "$latestLog._id",
                    userId: "$_id",
                    name: "$userDetails.name",
                    email: "$userDetails.email",
                    userAgent: "$latestLog.userAgent",
                    ramUsage: "$latestLog.ramUsage",
                    timestamp: "$latestLog.timestamp"
                }
            }
        ]);

        res.json(activeClients);
    } catch (error) {
        console.error("Error fetching active clients logs:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

export default router;
