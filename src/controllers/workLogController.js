import WorkLog from "../models/WorkLog.js";
import User from "../models/User.js";

// @desc    Create a new Work Log
// @route   POST /api/work-logs
// @access  Public
export const createWorkLog = async (req, res) => {
    try {
        const {
            employeeId,
            taskTitle,
            projectName,
            date,
            startTime,
            endTime,
            duration,
            description,
            status,
            taskStartDate,
            logEndDate,
            taskOwner,
            taskType,
            timeAutomation,
            logType, // Added logType
            assignedBy // Added assignedBy
        } = req.body;

        // Files
        let documentPath = null;
        let audioPath = null;

        if (req.files) {
            if (req.files.document) {
                documentPath = req.files.document[0].filename;
            }
            if (req.files.audio) {
                audioPath = req.files.audio[0].filename;
            }
        }

        // Auto-generate Task No (Day-wise)
        // Count logs for this date (across all employees? User said "Task No... for each new day it should start as 1, 2". 
        // Use global for day or per employee? "Employee Log Time" usually implies per employee. 
        // But the user didn't specify "per employee". I'll assume per employee to avoid conflicts if multiple people log at once? 
        // Actually, "Task No" usually means specific to the log sheet. If it's a personal log sheet, it's per employee.
        // Let's count per employee for that date.
        const count = await WorkLog.countDocuments({
            date,
            employeeId
        });
        const taskNo = count + 1;

        const log = await WorkLog.create({
            employeeId,
            taskTitle: taskTitle || "Untitled Task", // Handle optional
            projectName,
            date,
            startTime,
            endTime,
            duration,
            description,
            status,
            taskStartDate,
            logEndDate,
            documentPath,
            audioPath,
            taskNo,
            taskOwner,
            taskType,
            timeAutomation,
            logType, // Added logType
            assignedBy // Added assignedBy
        });

        res.status(201).json({
            message: "Work log submitted successfully",
            log
        });
    } catch (error) {
        console.error("Error creating work log:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Helper to normalize date from DD/MM/YY to YYYY-MM-DD
const normalizeDate = (dateStr) => {
    if (!dateStr || dateStr === "undefined") return "";
    // Check if it's already YYYY-MM-DD
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return dateStr;

    // Check if it's DD/MM/YY (e.g. 31/01/26)
    const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
    if (match) {
        const [_, day, month, year] = match;
        // Assume 20xx for year
        return `20${year}-${month}-${day}`;
    }
    return dateStr; // Return original if unknown format
};

// Helper to getting role from map
const getRole = (name, userMap) => {
    if (!name) return "N/A";
    const role = userMap.get(name.trim().toLowerCase());
    return role && role.length > 0 ? role.join(", ") : "N/A"; // Handle array or string
};

// @desc    Get Logs by Employee
// @route   GET /api/work-logs/employee/:id
// @access  Public
export const getWorkLogsByEmployee = async (req, res) => {
    try {
        // Fetch the user to get their name
        const user = await User.findById(req.params.id);

        // Fetch all users to build a role map for owners/assigners
        const allUsers = await User.find({}, "name role");
        const userMap = new Map(allUsers.map(u => [u.name.trim().toLowerCase(), u.role]));

        if (!user) {
            // Fallback if user not found, though unlikely if auth is working
            const logs = await WorkLog.find({ employeeId: req.params.id }).sort({ createdAt: -1 });
            return res.json(logs);
        }

        // Find logs where matches employeeId OR matches taskOwner name (both camelCase and CSV format)
        // Use regex for case-insensitive matching
        const logs = await WorkLog.find({
            $or: [
                { employeeId: req.params.id },
                { taskOwner: { $regex: new RegExp(`^${user.name}$`, "i") } },
                { "Task Owner": { $regex: new RegExp(`^${user.name}$`, "i") } }
            ]
        }).sort({ createdAt: -1 }).populate("employeeId", "name email role");

        // Normalize logs for frontend (map CSV fields to schema fields if missing)
        const normalizedLogs = logs.map(log => {
            const logObj = log.toObject();
            // Get date from either field
            const rawDate = logObj.date || logObj.Date;
            let finalDate = normalizeDate(rawDate);

            // Fallback to createdAt if date is still empty
            if (!finalDate && logObj.createdAt) {
                finalDate = logObj.createdAt.toISOString().split('T')[0];
            }

            const taskOwnerName = logObj.taskOwner || logObj["Task Owner"];
            const assignedByName = logObj.assignedBy;

            // Resolve Employee Name/Role from populated employeeId if available, else fallback to current user
            // This is crucial if the log was created by someone else but matches the current user as taskOwner
            const empName = logObj.employeeId?.name || user.name;
            const empRole = logObj.employeeId?.role;
            const empRoleStr = empRole && empRole.length > 0 ? empRole.join(", ") : "N/A";

            return {
                ...logObj,
                date: finalDate, // Normalize date here
                taskOwner: taskOwnerName,
                projectName: logObj.projectName || logObj["Project Name"],
                taskNo: logObj.taskNo || logObj["Task No"],
                startTime: logObj.startTime || logObj["Start Time"],
                endTime: logObj.endTime || logObj["End Time"],
                description: logObj.description || logObj["Task Description"],
                taskType: logObj.taskType || logObj["Task Type"],
                timeAutomation: logObj.timeAutomation || logObj["Time Estimaion"],
                status: logObj.status || logObj["Status"],
                employeeName: empName, // Attach resolved employee name
                employeeRole: empRoleStr,  // Attach resolved employee role
                taskOwnerRole: getRole(taskOwnerName, userMap),
                assignedByRole: getRole(assignedByName, userMap)
            };
        });

        res.json(normalizedLogs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get All Logs (Admin)
// @route   GET /api/work-logs
// @access  Public (Should be Admin protected in production)
export const getAllWorkLogs = async (req, res) => {
    try {
        // Fetch all users to build a role map for owners/assigners
        const allUsers = await User.find({}, "name role");
        const userMap = new Map(allUsers.map(u => [u.name.trim().toLowerCase(), u.role]));

        // Populate employeeId to get name and email
        const logs = await WorkLog.find({})
            .sort({ createdAt: -1 })
            .populate("employeeId", "name email role employeeId");

        // Normalize logs for frontend
        const normalizedLogs = logs.map(log => {
            const logObj = log.toObject();
            // Get date from either field
            const rawDate = logObj.date || logObj.Date;
            let finalDate = normalizeDate(rawDate);

            // Fallback to createdAt if date is still empty
            if (!finalDate && logObj.createdAt) {
                finalDate = logObj.createdAt.toISOString().split('T')[0];
            }

            const taskOwnerName = logObj.taskOwner || logObj["Task Owner"];
            const assignedByName = logObj.assignedBy;

            // For admin check, employeeId is populated
            const empRole = logObj.employeeId?.role;
            const employeeRoleStr = empRole && empRole.length > 0 ? empRole.join(", ") : "N/A";

            return {
                ...logObj,
                date: finalDate, // Normalize date here
                taskOwner: taskOwnerName,
                projectName: logObj.projectName || logObj["Project Name"],
                taskNo: logObj.taskNo || logObj["Task No"],
                startTime: logObj.startTime || logObj["Start Time"],
                endTime: logObj.endTime || logObj["End Time"],
                description: logObj.description || logObj["Task Description"],
                taskType: logObj.taskType || logObj["Task Type"],
                timeAutomation: logObj.timeAutomation || logObj["Time Estimaion"],
                status: logObj.status || logObj["Status"],
                employeeRole: employeeRoleStr,
                taskOwnerRole: getRole(taskOwnerName, userMap),
                assignedByRole: getRole(assignedByName, userMap)
            };
        });

        res.json(normalizedLogs);
    } catch (error) {
        console.error("Error fetching all logs:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
/* 
   Original updateWorkLog used findById + save(), which triggers full document validation.
   This caused errors for logs imported via CSV that might be missing required fields 
   like 'description' (stored as 'Task Description' instead).
   Switching to findByIdAndUpdate allows partial updates without enforcing 
   validation on unrelated fields.
*/
// Helper to calculate minutes from HH:mm
const calculateDurationMinutes = (startTime, endTime) => {
    if (!startTime || !endTime) return 0;
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    let duration = endMinutes - startMinutes;
    if (duration < 0) duration += 24 * 60; // Handle overnight calculation if needed
    return duration;
};

// Helper to format minutes to "X hrs Y mins" or "Y mins"
const formatDurationStr = (totalMinutes) => {
    if (totalMinutes <= 0) return "";
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0 && minutes > 0) return `${hours} hrs ${minutes} mins`;
    if (hours > 0) return `${hours} hrs`;
    return `${minutes} mins`;
};

// Helper to parse "X hrs Y mins" string to minutes
const parseDurationStr = (durationStr) => {
    if (!durationStr) return 0;
    let total = 0;
    const hoursMatch = durationStr.match(/(\d+)\s*hrs?/);
    const minsMatch = durationStr.match(/(\d+)\s*mins?/);

    if (hoursMatch) total += parseInt(hoursMatch[1]) * 60;
    if (minsMatch) total += parseInt(minsMatch[1]);

    // If just specific format like "02:30" or pure number check?
    // User data seems to use "X hrs Y mins" or text from frontend.
    return total;
};

export const updateWorkLog = async (req, res) => {
    try {
        const { status, reworkStartTime, endTime, startTime } = req.body;

        // Fetch existing log to access current state and array data
        const log = await WorkLog.findById(req.params.id);
        if (!log) {
            return res.status(404).json({ message: "Work log not found" });
        }

        const updateData = {};
        const pushData = {};
        const setOnInsertData = {}; // unused really

        // 1. Handle Basic Field Updates
        if (status) updateData.status = status;
        if (reworkStartTime) updateData.reworkStartTime = reworkStartTime; // Legacy/Frontend comp

        // Handle Start/End Time Updates & Initial Duration
        let newStartTime = startTime !== undefined ? startTime : log.startTime;
        let newEndTime = endTime !== undefined ? endTime : log.endTime;

        if (startTime !== undefined) updateData.startTime = startTime;
        if (endTime !== undefined) updateData.endTime = endTime;

        // If we have both start and end time (and endTime is not null), calculate duration
        // Only if not in Rework mode? User said "initial time... duration automatically calculated".
        // If we represent Rework duration separately, base duration is just task duration.
        if (newStartTime && newEndTime) {
            const durationMins = calculateDurationMinutes(newStartTime, newEndTime);
            updateData.duration = formatDurationStr(durationMins);
        }

        // 2. Handle Rework Logic
        // We track rework sessions in `reworkHistory`.
        // A session is "Active" if it has a startTime but no endTime.

        // Check for active session
        const history = log.reworkHistory || [];
        const lastSessionIndex = history.length - 1;
        const activeSession = (lastSessionIndex >= 0 && !history[lastSessionIndex].endTime)
            ? history[lastSessionIndex]
            : null;

        if (status === 'Rework' && log.status !== 'Rework') {
            // Start New Rework Session
            // Unless we are just clicking "Rework" on an already Rework task? 
            // Frontend sends 'Rework' when checking confirming popup.

            // Check if we already have an active session for this (avoid duplicates if frontend retries)
            if (!activeSession) {
                pushData.reworkHistory = {
                    startTime: new Date(),
                    events: []
                };
                // Increment count
                updateData.reworkCount = (log.reworkCount || 0) + 1;
            }
        }
        else if (activeSession) {
            // We are inside an active rework session. Handle Status Changes.

            if (status === 'Hold' && log.status !== 'Hold') {
                // Log Hold Event
                // We need to push to the events array of the LAST element.
                // MongoDB specific syntax: "reworkHistory.$[last].events" requires arrayFilters or just index if we knew it.
                // Since we fetched `log`, we know index is `lastSessionIndex`.
                updateData[`reworkHistory.${lastSessionIndex}.events`] = [
                    ...(activeSession.events || []),
                    { action: 'Hold', time: new Date() }
                ];
            }
            else if (status === 'In Progress' && log.status === 'Hold') {
                // Log Resume Event
                updateData[`reworkHistory.${lastSessionIndex}.events`] = [
                    ...(activeSession.events || []),
                    { action: 'Resume', time: new Date() }
                ];
            }
            else if (status === 'Completed') {
                // End Rework Session
                const reEndTime = new Date();
                const reStartTime = new Date(activeSession.startTime);

                // Calculate Rework Duration (Subtracting Holds)
                let activeDurationMs = 0;
                let lastStart = reStartTime;
                const events = activeSession.events || [];

                // Iterate events to subtract hold times
                // Logic: Start -> Hold (Active), Hold -> Resume (Paused), ...
                // Simple greedy: 
                // We are active from lastStart UNTIL Hold.
                // We resume active from Resume.

                let isHeld = false;

                // Sort events by time just in case
                // events.sort((a,b) => a.time - b.time); 

                for (const event of events) {
                    if (event.action === 'Hold' && !isHeld) {
                        activeDurationMs += (new Date(event.time) - lastStart);
                        isHeld = true;
                    } else if (event.action === 'Resume' && isHeld) {
                        lastStart = new Date(event.time);
                        isHeld = false;
                    }
                }

                // If not held at the end, add remaining time
                if (!isHeld) {
                    activeDurationMs += (reEndTime - lastStart);
                }

                const reworkMins = Math.floor(activeDurationMs / 60000);

                // Update the session in DB
                updateData[`reworkHistory.${lastSessionIndex}.endTime`] = reEndTime;
                updateData[`reworkHistory.${lastSessionIndex}.duration`] = reworkMins;

                // Update Total Duration
                const currentDurationMins = parseDurationStr(log.duration || "");
                const totalMins = currentDurationMins + reworkMins;
                updateData.duration = formatDurationStr(totalMins);
            }
        }

        // Construct Query
        // We use $set for updateData and $push for pushData
        const finalUpdate = {};
        if (Object.keys(updateData).length > 0) finalUpdate.$set = updateData;
        if (Object.keys(pushData).length > 0) finalUpdate.$push = pushData;

        // Execute Update
        // Use findOneAndUpdate to get the fresh updated document
        const updatedLog = await WorkLog.findByIdAndUpdate(
            req.params.id,
            finalUpdate,
            { new: true }
        );

        res.json({ message: "Work log updated successfully", log: updatedLog });
    } catch (error) {
        console.error("Error updating work log:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

// @desc    Get Filter Options (Projects, Owners, Types)
// @route   GET /api/work-logs/filters
// @access  Public
export const getFilterOptions = async (req, res) => {
    try {
        // Fetch distinct values for both standard and legacy fields
        const projects = await WorkLog.distinct("projectName");
        const legacyProjects = await WorkLog.distinct("Project Name");

        const owners = await WorkLog.distinct("taskOwner");
        const legacyOwners = await WorkLog.distinct("Task Owner");

        const types = await WorkLog.distinct("taskType");
        const legacyTypes = await WorkLog.distinct("Task Type");

        const assignedBy = await WorkLog.distinct("assignedBy");

        // Merge and deduplicate
        const uniqueProjects = [...new Set([...projects, ...legacyProjects])].filter(Boolean).sort();
        const uniqueOwners = [...new Set([...owners, ...legacyOwners])].filter(Boolean).sort();
        const uniqueTypes = [...new Set([...types, ...legacyTypes])].filter(Boolean).sort();
        const uniqueAssignedBy = [...new Set(assignedBy)].filter(Boolean).sort();

        res.json({
            projects: uniqueProjects,
            owners: uniqueOwners,
            types: uniqueTypes,
            assignedBy: uniqueAssignedBy
        });
    } catch (error) {
        console.error("Error fetching filter options:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Get Daily Task Count (for auto-incrementing Task No)
// @route   GET /api/work-logs/count?date=YYYY-MM-DD
// @access  Private
export const getDailyTaskCount = async (req, res) => {
    try {
        const { date } = req.query;
        const employeeId = req.user.id; // From auth middleware

        if (!date) {
            return res.status(400).json({ message: "Date is required" });
        }

        const count = await WorkLog.countDocuments({
            date,
            employeeId
        });

        res.json({ count });
    } catch (error) {
        console.error("Error fetching task count:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
