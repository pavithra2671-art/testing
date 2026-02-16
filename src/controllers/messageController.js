import Message from '../models/Message.js';
import Channel from '../models/Channel.js';
import mongoose from 'mongoose';

// Get messages for a channel
export const getMessages = async (req, res) => {
    try {
        const { channelId } = req.params;

        const messages = await Message.find({ channel: channelId })
            .sort({ createdAt: 1 })
            .limit(50)
            .populate('sender', 'name email designation description role');

        const formattedMessages = messages.map(msg => ({
            _id: msg._id,
            content: msg.content,
            sender: msg.sender, // Keep as object { _id, name }
            channel: msg.channel,
            createdAt: msg.createdAt, // Frontend needs raw date for parsing
            type: msg.type,
            fileUrl: msg.fileUrl,
            readBy: msg.readBy
        }));

        res.json(formattedMessages);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Create a message
export const createMessage = async (req, res) => {
    try {
        const { content, channelId, type, fileUrl, localId, isOffline } = req.body;

        const newMessage = new Message({
            content,
            sender: req.user.id || req.user._id, // Handle both id (JWT) and _id (mongoose object)
            channel: channelId,
            type: type || 'text',
            fileUrl: fileUrl || '',
            readBy: [req.user.id || req.user._id]
        });

        await newMessage.save();
        // Populate sender details for immediate display
        await newMessage.populate('sender', 'name email designation description role');

        const messageData = {
            _id: newMessage._id.toString(),
            content: newMessage.content,
            sender: newMessage.sender, // Populated object
            channel: newMessage.channel.toString(),
            createdAt: newMessage.createdAt,
            type: newMessage.type,
            fileUrl: newMessage.fileUrl,
            localId: localId, // Pass back to client for dedup
            readBy: newMessage.readBy
        };

        // Emit via Socket.io
        const io = req.app.get('io');
        if (io) {
            io.to(channelId).emit('message', messageData);
        } else {
            console.warn("Socket.io not initialized on request");
        }

        // --- Offline History Logging ---
        if (isOffline) {
            try {
                // Find or Create 'Offline History' channel
                let logChannel = await Channel.findOne({ name: 'Offline History', type: 'Private' });

                if (!logChannel) {
                    logChannel = new Channel({
                        name: 'Offline History',
                        type: 'Private',
                        description: 'System log for offline messages',
                        parent: null,
                        allowedUsers: []
                    });
                    await logChannel.save();
                }

                // Get Source Channel Name
                const sourceChannel = await Channel.findById(channelId);
                const sourceChannelName = sourceChannel ? sourceChannel.name : channelId;

                // Create Log Message
                const logMsg = new Message({
                    content: `${req.user.name}||${sourceChannelName}||${content}`, // Delimiter
                    sender: req.user.id || req.user._id,
                    channel: logChannel._id,
                    type: 'offline_log',
                    readBy: [req.user.id || req.user._id]
                });
                await logMsg.save();

                const logData = {
                    _id: logMsg._id.toString(),
                    content: logMsg.content,
                    sender: { name: req.user.name, _id: req.user.id || req.user._id },
                    channel: logChannel._id.toString(),
                    createdAt: logMsg.createdAt,
                    type: 'offline_log',
                    readBy: logMsg.readBy
                };
                if (io) io.to(logChannel._id.toString()).emit('message', logData);

            } catch (logErr) {
                console.error("Offline Logging Error:", logErr);
            }
        }

        res.json(messageData);
    } catch (err) {
        console.error("Create Message Error Full Object:", JSON.stringify(err, Object.getOwnPropertyNames(err)));
        console.error("Create Message Error Message:", err.message);
        console.error("Create Message Error Stack:", err.stack);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};

// ... (getSessionMessages, deleteMessage, exportMessages exist)

// Mark channel as read
export const markAsRead = async (req, res) => {
    try {
        const { channelId } = req.params;
        const userId = req.user.id || req.user._id;

        await Message.updateMany(
            { channel: channelId, readBy: { $ne: userId } },
            { $addToSet: { readBy: userId } }
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Get Unread Counts
export const getUnreadCounts = async (req, res) => {
    try {
        const userId = req.user.id || req.user._id;

        // Aggregate unread messages by channel
        const unreadCounts = await Message.aggregate([
            { $match: { readBy: { $ne: new mongoose.Types.ObjectId(userId) } } },
            { $group: { _id: "$channel", count: { $sum: 1 } } }
        ]);

        const formattedCounts = {};
        unreadCounts.forEach(item => {
            formattedCounts[item._id] = item.count;
        });

        res.json(formattedCounts);
    } catch (err) {
        console.error(err.message);
        console.error(err.stack); // Added stack for deeper debug if needed
        res.status(500).send('Server Error');
    }
};

// Get messages for a session (range)
export const getSessionMessages = async (req, res) => {
    try {
        const { channelId, startMsgId, endMsgId } = req.params;

        const startMsg = await Message.findById(startMsgId);
        const endMsg = await Message.findById(endMsgId);

        if (!startMsg || !endMsg) return res.status(404).json({ message: 'Session markers not found' });

        const messages = await Message.find({
            channel: channelId,
            createdAt: { $gte: startMsg.createdAt, $lte: endMsg.createdAt }
        })
            .populate('sender', 'name email designation description role')
            .sort({ createdAt: 1 });

        const formattedMessages = messages.map(msg => ({
            _id: msg._id,
            content: msg.content,
            sender: msg.sender,
            channel: msg.channel,
            createdAt: msg.createdAt,
            type: msg.type,
            fileUrl: msg.fileUrl
        }));

        res.json(formattedMessages);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Delete a message
export const deleteMessage = async (req, res) => {
    try {
        const message = await Message.findById(req.params.id);
        if (!message) return res.status(404).json({ message: 'Message not found' });

        // Check Permissions
        if (!req.user.role.includes('Super Admin') && !req.user.role.includes('Admin')) {
            // Must be Manager
            if (!req.user.role.includes('Manager')) return res.status(403).json({ message: 'Access Denied' });

            // Must be member of the channel
            const channel = await Channel.findById(message.channel);
            if (!channel || !channel.allowedUsers.includes(req.user._id)) {
                return res.status(403).json({ message: 'Access Denied: Not a channel member' });
            }
        }

        await Message.findByIdAndDelete(req.params.id);

        const io = req.app.get('io');
        if (io) io.to(message.channel.toString()).emit('message_deleted', req.params.id);

        res.json({ message: 'Message removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Export Messages
export const exportMessages = async (req, res) => {
    try {
        const { channelId } = req.params;
        const messages = await Message.find({ channel: channelId })
            .sort({ createdAt: 1 })
            .populate('sender', 'name');

        res.json(messages);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
