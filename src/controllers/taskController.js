import Task from "../models/Task.js";
import User from "../models/User.js";
import WorkLog from "../models/WorkLog.js";
import Channel from "../models/Channel.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// @desc    Create a new task
// @route   POST /api/tasks
// @access  Public (Should be Admin)
export const createTask = async (req, res) => {
    try {
        const {
            projectName,
            taskTitle,
            description,
            workCategory,
            roles, // Array from JSON.parse (handled below)
            assignType,
            assignee, // Can be array of IDs (Single) or Dept Names (Department)
            priority,
            startDate,
            startTime,
            deadline,
        } = req.body;

        // Parse parsedRoles
        let parsedRoles = [];
        if (typeof roles === 'string') {
            try {
                parsedRoles = JSON.parse(roles);
            } catch (e) {
                parsedRoles = [];
            }
        } else if (Array.isArray(roles)) {
            parsedRoles = roles;
        }

        // Ensure array
        if (!Array.isArray(parsedRoles)) parsedRoles = [];
        // Filter out empty/invalid values from roles
        parsedRoles = parsedRoles.filter(r => r && r !== "" && r !== "null" && r !== "undefined");


        // Parse assignee (similar to roles, to handle FormData stringification)
        let parsedAssignee = [];
        if (typeof assignee === 'string') {
            try {
                parsedAssignee = JSON.parse(assignee);
            } catch (e) {
                // If parsing fails, maybe it's a single raw string? Treat as single item array.
                parsedAssignee = [assignee];
            }
        } else if (Array.isArray(assignee)) {
            parsedAssignee = assignee;
        } else if (assignee) {
            parsedAssignee = [assignee];
        }

        // Parse projectLead
        let parsedProjectLead = [];
        if (req.body.projectLead) {
            if (typeof req.body.projectLead === 'string') {
                try {
                    parsedProjectLead = JSON.parse(req.body.projectLead);
                } catch (e) {
                    parsedProjectLead = [req.body.projectLead]; // Fallback
                }
            } else if (Array.isArray(req.body.projectLead)) {
                parsedProjectLead = req.body.projectLead;
            }
        }

        // Ensure array (JSON.parse("null") returns null)
        if (!Array.isArray(parsedProjectLead)) parsedProjectLead = [];
        // Filter out empty strings for ObjectIds to avoid CastError
        parsedProjectLead = parsedProjectLead.filter(id => id && id !== "" && id !== "null" && id !== "undefined");


        // Handle assignedBy (User ID)
        let parsedAssignedBy = req.body.assignedBy;
        if (parsedAssignedBy === "" || parsedAssignedBy === "null" || parsedAssignedBy === "undefined") {
            parsedAssignedBy = null;
        }

        // Parse department
        let parsedDepartment = [];
        if (req.body.department) {
            if (typeof req.body.department === 'string') {
                try {
                    parsedDepartment = JSON.parse(req.body.department);
                } catch (e) {
                    parsedDepartment = [req.body.department];
                }
            } else if (Array.isArray(req.body.department)) {
                parsedDepartment = req.body.department;
            }
        }

        // Ensure array
        if (!Array.isArray(parsedDepartment)) parsedDepartment = [];
        // Filter out empty values
        parsedDepartment = parsedDepartment.filter(d => d && d !== "" && d !== "null" && d !== "undefined");

        // Handle teamLead (Optional ObjectId)
        let parsedTeamLead = req.body.teamLead;
        if (parsedTeamLead === "" || parsedTeamLead === "null" || parsedTeamLead === "undefined") {
            parsedTeamLead = null;
        }

        let targetAssignee = [];

        if (assignType === "Single" || assignType === "Department") {
            targetAssignee = parsedAssignee;
        } else if (assignType === "Overall") {
            targetAssignee = []; // Everyone gets it
        }

        // --- DUPLICATE CHECK ---
        const existingTask = await Task.findOne({
            projectName: projectName,
            taskTitle: taskTitle,
            status: { $ne: "Completed" } // Optional: Allow re-creating if previous one is completed?
            // tailored for "prevent accidental double click" - usually means same active task.
        });

        if (existingTask) {
            return res.status(400).json({
                success: false,
                message: "A task with this Title already exists in this Project."
            });
        }

        const newTask = new Task({
            projectName,
            taskTitle,
            description,
            workCategory,
            roles: parsedRoles,
            assignType,
            assignee: targetAssignee, // Stores Targets
            assignedTo: [], // Starts Empty! (Acceptance Flow)
            projectLead: parsedProjectLead, // Use parsed value
            department: parsedDepartment, // Added Department
            teamLead: parsedTeamLead,     // Added Team Lead
            assignedBy: parsedAssignedBy, // Added Assigned By
            priority,
            startDate,
            startTime,
            deadline,
            // Handle Files
            documentPath: req.files && req.files['documents'] ? req.files['documents'][0].filename : null,
            audioPath: req.files && req.files['audioFile'] ? req.files['audioFile'][0].filename : null
        });

        const savedTask = await newTask.save();

        // Emit real-time event
        const io = req.app.get("io");
        if (io) {
            io.emit("newInvitation", savedTask); // Emit full task for Admin table & Employee list
        }

        res.status(201).json({
            success: true,
            message: "Task created successfully",
            task: savedTask,
        });

    } catch (error) {
        console.error("Error creating task:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// @desc    Get Invitations for a User
// @route   GET /api/tasks/my-invitations
// @access  Public (UserId passed as query)
export const getInvitations = async (req, res) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }



        // Logic to find matching tasks
        // 1. Single: assignedTo == userId
        // 2. Department: assignType="Department" && assignee maps to user.role
        // 3. Project-wise: assignType="Project-wise" && roles includes user.role
        // 4. Overall: assignType="Overall"

        // Mapping Departments to Roles
        const deptRoleMap = {
            "Designer": ["Designer", "Graphic Designer", "UI/UX Designer"],
            "Social Media": ["Social Media", "Social Media Manager"],
            "SEO Specialist": ["SEO Specialist"],
            "Meta Ads": ["Meta Ads", "Meta Ads Specialist"],
            "Software Developer": ["Software Developer", "Developer", "Backend Developer", "Frontend Developer"],
            "Sales": ["Sales", "Sales Executive"],
            "Graphic Designer": ["Graphic Designer", "Designer"] // direct mapping if Dept is named "Graphic Designer"
        };
        // We filter out tasks the user has *already declined*.
        const allPending = await Task.find({
            status: { $in: ["Pending", "In Progress"] },
            "declinedBy.userId": { $ne: userId }
        })
            .populate("projectLead", "name")
            .populate("teamLead", "name");

        const myInvitations = allPending.filter(task => {
            const isAssigned = (task.assignedTo || []).some(id => id.toString() === userId.toString());

            if (task.status === "In Progress" && isAssigned) {
                return false; // Already accepted/working on it
            }

            // --- STRICT MODE INVITATION CHECK ("Single", "Department", "Overall") ---

            // 1. Overall: Everyone receives.
            if (task.assignType === "Overall") return true;

            // 2. Single: assignee array contains User ID
            if (task.assignType === "Single") {
                // targetAssignee stores User IDs as strings
                const targets = task.assignee || [];
                return targets.includes(userId.toString());
            }

            // 3. Department: assignee array contains Department Name -> Maps to Role
            if (task.assignType === "Department") {
                const targetDepts = task.assignee || [];
                const roleMatch = targetDepts.some(dept => {
                    const allowedRoles = deptRoleMap[dept] || [dept]; // Fallback to 1:1
                    // Check if user has ANY of the allowed roles
                    return Array.isArray(user.role)
                        ? user.role.some(r => allowedRoles.includes(r))
                        : allowedRoles.includes(user.role);
                });
                return roleMatch;
            }

            return false;
        });

        res.json(myInvitations);

    } catch (error) {
        console.error("Error fetching invitations:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Respond to Task Invitation
// @route   POST /api/tasks/:id/respond
// @access  Public (UserId in body)
export const respondToTask = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, status, reason } = req.body; // status: "Accepted" or "Declined"

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }

        if (status === "Accepted") {
            if (task.assignedTo && task.assignedTo.length > 0) {
                // Check if already assigned mechanics if needed
            }

            // Check if user already in list (for idempotency)
            const currentAssigned = task.assignedTo.map(id => id.toString());
            if (!currentAssigned.includes(userId)) {
                task.assignedTo.push(userId);
            }

            task.status = "In Progress";

            // Start the first session
            task.sessions.push({
                startTime: new Date(),
                endTime: null,
                status: "In Progress",
                reworkVersion: 0
            });

            await task.save();

            // Emit Event for Admin
            const user = await User.findById(userId);
            const io = req.app.get("io");
            if (io) {
                io.emit("taskAccepted", {
                    taskId: task._id,
                    taskTitle: task.taskTitle,
                    employeeId: userId,
                    employeeName: user ? user.name : "Employee"
                });
            }

            // --- AUTO CREATE CHANNEL LOGIC ---

            try {
                // 1. Identify Department (Parent Channel)
                // 2. Define Members (Fetch Admins first for reuse)
                const memberIds = [userId];
                const admins = await User.find({ role: { $in: ['Super Admin', 'Admin'] } }).select('_id');
                const adminIds = admins.map(a => a._id.toString());

                // Add admins to memberIds
                adminIds.forEach(id => {
                    if (!memberIds.includes(id)) memberIds.push(id);
                });

                // 1. Identify Department (Parent Channel)
                let parentChannel = null;
                if (task.department && task.department.length > 0) {
                    const deptName = task.department[0]; // Primary Dept

                    // Try to find the Department channel
                    parentChannel = await Channel.findOne({ name: deptName });

                    if (!parentChannel) {
                        // Create Parent Channel (Department)
                        // Add current user to department channel as well
                        const initialMembers = [...adminIds];
                        if (!initialMembers.includes(userId)) initialMembers.push(userId);

                        parentChannel = new Channel({
                            name: deptName,
                            type: 'Private', // Valid enum value
                            allowedUsers: initialMembers,
                            description: `${deptName} Department Channel`
                        });
                        await parentChannel.save();

                        if (io) io.emit("newChannel", parentChannel);
                    }
                }

                // ... Continue with sub-channel members ...

                // Team Lead
                if (task.teamLead && !memberIds.includes(task.teamLead.toString())) {
                    memberIds.push(task.teamLead.toString());
                }

                // Project Lead
                if (task.projectLead && Array.isArray(task.projectLead)) {
                    task.projectLead.forEach(pl => {
                        if (!memberIds.includes(pl.toString())) memberIds.push(pl.toString());
                    });
                }

                // Assigned By
                if (task.assignedBy && !memberIds.includes(task.assignedBy.toString())) {
                    memberIds.push(task.assignedBy.toString());
                }

                // 3. Create/Find Channel
                const channelName = task.projectName || task.taskTitle;

                // Check if exists for this Task ID
                let taskChannel = await Channel.findOne({ taskId: task._id });

                if (!taskChannel) {
                    taskChannel = new Channel({
                        name: channelName,
                        type: 'Private',
                        parent: parentChannel ? parentChannel._id : null,
                        taskId: task._id,
                        allowedUsers: memberIds,
                        projectId: task.projectName
                    });
                    await taskChannel.save();

                    // Emit join event? or let frontend handle it via "newChannel"
                    if (io) {
                        io.emit("newChannel", taskChannel); // Custom event or reuse logic
                    }
                } else {
                    // Update members if needed?
                    // For now, assume creation is enough.
                }
            } catch (channelError) {
                console.error("Error auto-creating task channel:", channelError);
                // Don't fail the response, just log it.
            }

            return res.json({ message: "Task accepted successfully" });
        }

        if (status === "Declined") {
            task.declinedBy.push({
                userId,
                reason,
                date: new Date()
            });
            // If it was a Single task, maybe update status to "Declined"? 
            // Logic says "If employee declines -> provide reason". 
            // If Single, it stays pending? or some specific state. For now just push to declinedBy.
            await task.save();
            return res.json({ message: "Task declined" });
        }

        res.status(400).json({ message: "Invalid status" });

    } catch (error) {
        console.error("Error responding to task:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Get Assignments for a User (Accepted/In Progress/Completed)
// @route   GET /api/tasks/my-tasks
// @access  Public (UserId passed as query)
export const getMyTasks = async (req, res) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }

        const tasks = await Task.find({
            assignedTo: userId,
            status: { $in: ["In Progress", "Completed", "Overdue", "Hold"] }
        })
            .populate("projectLead", "name")
            .populate("teamLead", "name")
            .populate("assignedBy", "name");

        res.json(tasks);
    } catch (error) {
    }
};

// Helper to format 24h time
const formatTime24 = (date) => {
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
};

// Helper to format duration
const formatDuration = (ms) => {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    let str = "";
    if (hours > 0) str += `${hours} hr${hours > 1 ? 's' : ''} `;
    if (minutes > 0) str += `${minutes} min${minutes > 1 ? 's' : ''}`;
    return str.trim() || "0 min";
};

// @desc    Update Task Status
// @route   PUT /api/tasks/:id/status
// @access  Public
export const updateTaskStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, userId } = req.body;

        if (!["In Progress", "Completed", "Hold"].includes(status)) {
            return res.status(400).json({ message: "Invalid status" });
        }

        const task = await Task.findById(id).populate('assignedBy', 'name');
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }

        const now = new Date();

        // 1. End active session if exists (Pause timer)
        // Find session that has startTime but NO endTime
        const activeSession = task.sessions.find(s => !s.endTime);
        if (activeSession) {
            const startTime = new Date(activeSession.startTime);
            activeSession.endTime = now;
            activeSession.duration = now - startTime; // Calc duration ms

            if (userId) {
                try {
                    // Fetch user for name (Employee)
                    const user = await User.findById(userId);
                    const employeeName = user ? user.name : "Unknown Employee";

                    const durationStr = formatDuration(activeSession.duration);
                    // Ensure we have a valid task assigner name
                    const assignerName = task.assignedBy ? task.assignedBy.name : "System";

                    const newLog = new WorkLog({
                        employeeId: userId,
                        taskTitle: task.taskTitle,
                        projectName: task.projectName,
                        date: now.toISOString().split('T')[0],
                        startTime: formatTime24(startTime),
                        endTime: formatTime24(now),
                        duration: durationStr,
                        timeAutomation: durationStr,
                        status: status,
                        description: task.description || "Auto-logged task session",
                        taskNo: task.taskNo || task.reworkCount || 0, // Fallback safe
                        taskOwner: employeeName,   // Mapped to Employee Name
                        assignedBy: assignerName,  // Mapped to Assigner Name
                        taskType: "Task",
                        reworkCount: task.reworkCount,
                        logType: "Main Task" // Explicitly set as Main Task
                    });
                    await newLog.save();
                } catch (logError) {
                    console.error("Error creating automated work log:", logError);
                    // Do not block task update if log fails
                }
            }
        }

        // 2. Start new session if status is "In Progress" (Start timer)
        if (status === "In Progress") {
            task.sessions.push({
                startTime: now,
                endTime: null,
                status: "In Progress",
                reworkVersion: task.reworkCount || 0
            });
        }

        // Note: For "Hold", we already ended the active session above.

        task.status = status;
        await task.save();

        res.json(task);
    } catch (error) {
        console.error("Error updating task status:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Trigger Rework
// @route   PUT /api/tasks/:id/rework
// @access  Public
export const reworkTask = async (req, res) => {
    try {
        const { id } = req.params;

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }

        // Increment Rework Count
        task.reworkCount = (task.reworkCount || 0) + 1;

        // Set Status to In Progress
        task.status = "In Progress";

        // Start New Session for Rework
        task.sessions.push({
            startTime: new Date(),
            endTime: null,
            status: "In Progress",
            reworkVersion: task.reworkCount
        });

        await task.save();
        res.json(task);
    } catch (error) {
        console.error("Error triggering rework:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Update Chat Topic
// @route   PUT /api/tasks/:id/chat-topic
// @access  Public
export const updateChatTopic = async (req, res) => {
    try {
        const { id } = req.params;
        const { chatTopic } = req.body;

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }

        task.chatTopic = chatTopic;
        await task.save();

        res.json(task);
    } catch (error) {
        console.error("Error updating chat topic:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Get Single Task by ID
// @route   GET /api/tasks/:id
// @access  Public
export const getTaskById = async (req, res) => {
    try {
        const { id } = req.params;
        const task = await Task.findById(id)
            .populate("assignedBy", "name")
            .populate("projectLead", "name")
            .populate("teamLead", "name");

        if (!task) {
            return res.status(404).json({ message: "Task not found" });
        }
        res.json(task);
    } catch (error) {
        console.error("Error fetching task:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Get Tasks for a specific Employee (Admin View)
// @route   GET /api/tasks/employee/:employeeId
// @access  Public (Should be Admin)
export const getTasksByEmployee = async (req, res) => {
    try {
        const { employeeId } = req.params;

        // Find all tasks where assignedTo includes this employee
        // AND status is NOT "Pending" (Assuming "Tasks" view shows active/completed work)
        // User asked for "When an employee accepts a task... select employee... show tasks"
        // So we probably want everything: Pending, In Progress, Completed.
        // Actually, "In Progress" and "Completed" are the main ones. "Pending" are invitations. 
        // Let's show everything for now.

        // Fix ObjectId casting for array query
        const tasks = await Task.find({
            assignedTo: employeeId
        })
            .sort({ createdAt: -1 })
            .populate("projectLead", "name")
            .populate("teamLead", "name")
            .populate("assignedBy", "name");

        res.json(tasks);
    } catch (error) {
        console.error("Error fetching employee tasks:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Get All Tasks (Admin View)
// @route   GET /api/tasks/all
// @access  Public (Should be Admin)
export const getAllTasks = async (req, res) => {
    try {
        const tasks = await Task.find({})
            .sort({ createdAt: -1 })
            .populate("projectLead", "name")
            .populate("teamLead", "name")
            .populate("assignedBy", "name");
        res.json(tasks);
    } catch (error) {
        console.error("Error fetching all tasks:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

export const downloadFile = async (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(__dirname, "../../uploads", filename);

        if (fs.existsSync(filePath)) {
            res.download(filePath, filename, (err) => {
                if (err) {
                    console.error("Error downloading file:", err);
                    if (!res.headersSent) {
                        res.status(500).send("Could not download file");
                    }
                }
            });
        } else {
            res.status(404).json({ message: "File not found" });
        }
    } catch (error) {
        console.error("Error in download endpoint:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
// @desc    Get Dashboard Stats
// @route   GET /api/tasks/stats
// @access  Public (Should be Admin)
export const getDashboardStats = async (req, res) => {
    try {
        const totalProjects = (await Task.distinct("projectName")).length;
        const totalTasks = await Task.countDocuments();
        const pendingTasks = await Task.countDocuments({ status: "Pending" });
        const activeTasks = await Task.countDocuments({ status: "In Progress" });

        res.json({
            totalProjects,
            totalTasks,
            pendingTasks,
            activeTasks
        });
    } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
