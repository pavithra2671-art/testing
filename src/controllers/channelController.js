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
                { name: 'Offline History' }, // Explicitly allow Offline History for everyone
                { type: 'Private', allowedUsers: userId },
                { type: 'Department', allowedUsers: userId },
                { type: 'DM', allowedUsers: userId },
                // { type: 'Team', allowedTeams: user.teamId } // If teams exist
            ]
        };

        // Admin sees all? Or just what they are in? 
        // Usually Admins might see all, but for clutter reduction, let's stick to assigned + global.
        // But Super Admin might want to see everything?

        console.log(`[getChannels] User: ${user.name}, ID: ${user._id}, Roles: ${JSON.stringify(user.role)}`);

        if (user.role.includes('Super Admin') || user.role.includes('Admin')) {
            console.log(`[getChannels] Granting full access to Admin/Super Admin: ${user.name}`);
            query = {}; // See all
        }

        const channels = await Channel.find(query).sort({ createdAt: 1 });
        console.log(`[getChannels] Found ${channels.length} channels for user ${user.name}`);
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
        const { name, type, parentId, allowedUsers } = req.body;

        // Simple validation
        if (!name) return res.status(400).json({ message: "Channel name is required" });

        // Special handling for DM creation
        if (type === 'DM') {
            const { targetUserId } = req.body;
            if (!targetUserId) return res.status(400).json({ message: "Target user required for DM" });

            // Check if DM exists between these 2 users
            const existingDM = await Channel.findOne({
                type: 'DM',
                allowedUsers: { $all: [req.user.id, targetUserId] }
            });

            if (existingDM) {
                return res.json(existingDM);
            }

            const newDM = new Channel({
                name: 'dm-' + Date.now(), // Placeholder name, frontend resolves real name
                type: 'DM',
                allowedUsers: [req.user.id, targetUserId]
            });
            await newDM.save();

            const io = req.app.get("io");
            if (io) {
                io.to(req.user.id).emit("newChannel", newDM);
                io.to(targetUserId).emit("newChannel", newDM);
            }
            return res.status(201).json(newDM);
        }

        // Prepare initial members
        let initialMembers = [req.user.id];
        if (allowedUsers && Array.isArray(allowedUsers)) {
            allowedUsers.forEach(uid => {
                if (uid && !initialMembers.includes(uid)) {
                    initialMembers.push(uid);
                }
            });
        }

        const newChannel = new Channel({
            name,
            type: type || 'Global',
            parent: parentId || null,
            allowedUsers: initialMembers, // Creator + Selected Members
            isManual: true // Explicitly mark as manually created
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
// @access  Private (Super Admin / Admin / Manager)
export const deleteChannel = async (req, res) => {
    try {
        const { id } = req.params;

        // AUTH CHECK
        const user = req.user;
        const isAuthorized = user.role.includes('Super Admin') || user.role.includes('Admin') || user.role.includes('Manager');

        if (!isAuthorized) {
            return res.status(403).json({ message: "Not authorized to delete channels" });
        }

        const channel = await Channel.findById(id);
        if (!channel) return res.status(404).json({ message: "Channel not found" });

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

// @desc    Add Member(s) to Private Channel
// @route   POST /api/channels/:id/members
// @access  Private (Manager/Admin)
export const addMember = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, userIds } = req.body; // Support single or multiple

        const channel = await Channel.findById(id);
        if (!channel) return res.status(404).json({ message: "Channel not found" });

        const usersToAdd = userIds || [userId];
        let addedCount = 0;

        for (const uid of usersToAdd) {
            if (uid && !channel.allowedUsers.includes(uid)) {
                channel.allowedUsers.push(uid);
                addedCount++;
            }
        }

        if (addedCount > 0) {
            await channel.save();
            const io = req.app.get("io");
            if (io) {
                io.emit("channelUpdated", channel);

                // Explicitly notify added users so they see it as a "new" channel
                usersToAdd.forEach(uid => {
                    io.to(uid).emit("newChannel", channel);
                });
            }
        }

        res.json(channel);
    } catch (error) {
        console.error("Error adding member:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Remove Member(s) from Private Channel
// @route   POST /api/channels/:id/members/remove
// @access  Private (Manager/Admin)
export const removeMembers = async (req, res) => {
    try {
        const { id } = req.params;
        const { userIds } = req.body;

        const channel = await Channel.findById(id);
        if (!channel) return res.status(404).json({ message: "Channel not found" });

        if (userIds && Array.isArray(userIds)) {
            channel.allowedUsers = channel.allowedUsers.filter(uid => !userIds.includes(uid.toString()));
            await channel.save();

            const io = req.app.get("io");
            if (io) io.emit("channelUpdated", channel);
        }

        res.json(channel);
    } catch (error) {
        console.error("Error removing members:", error);
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
                if (role && !['User', 'Admin', 'Super Admin', 'Manager'].includes(role)) {
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
            const admins = users.filter(u => {
                const roles = Array.isArray(u.role) ? u.role : [u.role];
                return roles.some(r => ['Admin', 'Super Admin', 'Manager'].includes(r));
            }).map(u => u._id);

            // Merge memberIds + admins
            const targetMembers = [...new Set([...memberIds, ...admins])].map(id => id.toString());

            // Current members
            const currentMembers = channel.allowedUsers.map(id => id.toString());

            // Check if different
            const isDifferent = targetMembers.length !== currentMembers.length || !targetMembers.every(id => currentMembers.includes(id));

            if (isDifferent) {
                channel.allowedUsers = targetMembers;
                if (channel.type !== 'Private') {
                    // Force type to Private for Department channels to ensure they appear in queries
                    channel.type = 'Private';
                }
                await channel.save();
                console.log(`[Sync] Updated members and type for ${deptName}`);
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

/**
 * Ensures the "Fox Digital One Team" global channel exists.
 * Should be called when a department is created or system initialized.
 * @param {Server} io - Socket.io instance
 */
export const ensureFoxDigitalOneTeamChannel = async (io) => {
    try {
        const channelName = "Fox Digital One Team";
        let channel = await Channel.findOne({ name: channelName });

        if (!channel) {
            console.log(`[OneTeam] Creating global channel: ${channelName}`);
            channel = new Channel({
                name: channelName,
                type: 'Global',
                description: 'Official Company-Wide Channel',
                allowedUsers: [] // Accessible by all due to 'Global' type
            });
            await channel.save();

            if (io) {
                io.emit("newChannel", channel);
            }
        } else {
            // Ensure strict compliance with requirements (Global)
            if (channel.type !== 'Global') {
                console.log(`[OneTeam] Correcting channel type to Global`);
                channel.type = 'Global';
                await channel.save();
                if (io) io.emit("channelUpdated", channel);
            }
        }
        return channel;
    } catch (error) {
        console.error("Error ensuring Fox Digital One Team channel:", error);
    }
};

