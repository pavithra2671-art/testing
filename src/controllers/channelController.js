import Channel from "../models/Channel.js";
import User from "../models/User.js";

// @desc    Get all channels (Global + Private/Team if allowed)
// @route   GET /api/channels
// @access  Private
export const getChannels = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        // 1. Fetch Global Channels
        // 2. Fetch Private Channels where allowedUsers includes userId
        // 3. Fetch Team Channels where allowedTeams includes user's team (if applicable)

        let query = {
            $or: [
                { type: 'Global' },
                { type: 'Private', allowedUsers: userId },
                // { type: 'Team', allowedTeams: user.teamId } // If teams exist
            ]
        };

        // Admin sees all? Or just what they are in? 
        // Usually Admins might see all, but for clutter reduction, let's stick to assigned + global.
        // But Super Admin might want to see everything?
        if (user.role === 'Super Admin') {
            query = {}; // See all
        } else if (user.role === 'Admin') {
            // Admins should see all Task channels + their own allowed channels
            query = {
                $or: [
                    { type: 'Global' },
                    { type: 'Private', allowedUsers: userId },
                    { taskId: { $exists: true } }
                ]
            };
        }

        const channels = await Channel.find(query).sort({ createdAt: 1 });
        res.json(channels);
    } catch (error) {
        console.error("Error fetching channels:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Create a new channel
// @route   POST /api/channels
// @access  Private (Super Admin / Admin)
export const createChannel = async (req, res) => {
    try {
        const { name, type, parentId } = req.body;

        // Simple validation
        if (!name) return res.status(400).json({ message: "Channel name is required" });

        const newChannel = new Channel({
            name,
            type: type || 'Global',
            parent: parentId || null,
            allowedUsers: [req.user.id] // Creator is always a member
        });

        await newChannel.save();

        const io = req.app.get("io");
        if (io) io.emit("newChannel", newChannel);

        res.status(201).json(newChannel);
    } catch (error) {
        console.error("Error creating channel:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Delete a channel
// @route   DELETE /api/channels/:id
// @access  Private (Super Admin)
export const deleteChannel = async (req, res) => {
    try {
        const { id } = req.params;
        await Channel.findByIdAndDelete(id);

        // Also delete children?
        await Channel.deleteMany({ parent: id });

        const io = req.app.get("io");
        if (io) io.emit("channelDeleted", id);

        res.json({ message: "Channel deleted" });
    } catch (error) {
        console.error("Error deleting channel:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Rename a channel
// @route   PUT /api/channels/:id
// @access  Private (Super Admin)
export const renameChannel = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        const channel = await Channel.findByIdAndUpdate(id, { name }, { new: true });

        const io = req.app.get("io");
        if (io) io.emit("channelUpdated", channel);

        res.json(channel);
    } catch (error) {
        console.error("Error renaming channel:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Add Member to Private Channel
// @route   POST /api/channels/:id/members
// @access  Private (Manager/Admin)
export const addMember = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;

        const channel = await Channel.findById(id);
        if (!channel) return res.status(404).json({ message: "Channel not found" });

        if (!channel.allowedUsers.includes(userId)) {
            channel.allowedUsers.push(userId);
            await channel.save();
        }

        const io = req.app.get("io");
        if (io) io.emit("channelUpdated", channel);

        res.json(channel);
    } catch (error) {
        console.error("Error adding member:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Remove Member from Private Channel
// @route   DELETE /api/channels/:id/members/:userId
// @access  Private (Manager/Admin)
export const removeMember = async (req, res) => {
    try {
        const { id, userId } = req.params;

        const channel = await Channel.findById(id);
        if (!channel) return res.status(404).json({ message: "Channel not found" });

        channel.allowedUsers = channel.allowedUsers.filter(uid => uid.toString() !== userId);
        await channel.save();

        const io = req.app.get("io");
        if (io) io.emit("channelUpdated", channel);

        res.json(channel);
    } catch (error) {
        console.error("Error removing member:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Sync Department Channels (Core Logic)
//          Can be called internally (e.g. on User Add) or via API
export const syncDepartmentChannels = async () => {
    console.log("[Sync] Starting Department Channel Sync...");
    try {
        // 1. Get all Users
        const users = await User.find({});

        // 2. Identify Departments (Roles)
        // Group users by role
        const deptMap = {}; // "Software Developer" -> [User1, User2]

        users.forEach(u => {
            // Handle array of roles or single string
            const roles = Array.isArray(u.role) ? u.role : [u.role];
            roles.forEach(role => {
                if (role && role !== 'User' && role !== 'Admin' && role !== 'Super Admin' && role !== 'Manager') {
                    if (!deptMap[role]) deptMap[role] = [];
                    deptMap[role].push(u._id);
                }
            });
        });

        // 3. Ensure Channel Exists for each Dept
        for (const [deptName, memberIds] of Object.entries(deptMap)) {
            let channel = await Channel.findOne({ name: deptName, type: 'Private' }); // Treat as Private so we can control members? Or Global?
            // Wait, standard Departments might be 'Global' but let's check current usage. 
            // If they are public to everyone, 'Global'. If restricted to that dept, 'Private'.
            // Let's assume 'Private' (Restricted) + Admins.

            // Actually, for "Department Channels", strictly usually means ONLY that dept + management.

            if (!channel) {
                // Check if a Global one exists first to avoid dupes if we switch types
                const globalCheck = await Channel.findOne({ name: deptName });
                if (globalCheck) {
                    channel = globalCheck;
                    // Determine if we need to convert it? For now leave as is.
                } else {
                    console.log(`[Sync] Creating new channel for Department: ${deptName}`);
                    channel = new Channel({
                        name: deptName,
                        type: 'Private', // Default to private for departments
                        allowedUsers: []
                    });
                }
            }

            // 4. Update Members
            // Always add Admins/Super Admins?
            const admins = users.filter(u => u.role === 'Admin' || u.role === 'Super Admin' || u.role === 'Manager').map(u => u._id);

            // Merge memberIds + admins
            const targetMembers = [...new Set([...memberIds, ...admins])].map(id => id.toString());

            // Current members
            const currentMembers = channel.allowedUsers.map(id => id.toString());

            // Check if different
            const isDifferent = targetMembers.length !== currentMembers.length || !targetMembers.every(id => currentMembers.includes(id));

            if (isDifferent) {
                channel.allowedUsers = targetMembers;
                if (channel.type !== 'Private') {
                    // If it was Global, maybe we don't restrict? 
                    // But if we want to enforce dept logic, we might need it to be private or just ignore allowedUsers if types is Global.
                    // Let's force type to Private if it matches a Dept?
                    // channel.type = 'Private'; 
                }
                await channel.save();
                console.log(`[Sync] Updated members for ${deptName}`);
            }
        }
        console.log("[Sync] Department Channel Sync Complete.");

    } catch (error) {
        console.error("[Sync] Error syncing department channels:", error);
    }
};

// @desc    Trigger Sync via API
// @route   POST /api/channels/sync
// @access  Private (Admin)
export const triggerDepartmentSync = async (req, res) => {
    try {
        await syncDepartmentChannels();
        res.json({ message: "Synchronization triggered successfully" });
    } catch (error) {
        res.status(500).json({ message: "Sync failed" });
    }
};
// @desc    Get Channel by Task ID
// @route   GET /api/channels/task/:taskId
// @access  Private
export const getChannelByTaskId = async (req, res) => {
    try {
        const { taskId } = req.params;
        const channel = await Channel.findOne({ taskId });

        if (!channel) {
            return res.status(404).json({ message: "Channel not found for this task" });
        }

        res.json(channel);
    } catch (error) {
        console.error("Error fetching channel by task ID:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
