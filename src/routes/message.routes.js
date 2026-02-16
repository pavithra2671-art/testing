import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import {
    getMessages,
    createMessage,
    getSessionMessages,
    deleteMessage,
    exportMessages,
    markAsRead,
    getUnreadCounts
} from '../controllers/messageController.js';

const router = express.Router();

// GET unread counts (Must be before /:channelId)
router.get('/unread/counts', verifyToken, getUnreadCounts);

// MARK channel as read
router.put('/read/:channelId', verifyToken, markAsRead);

// GET messages for a channel
router.get('/:channelId', verifyToken, getMessages);

// POST create message
router.post('/', verifyToken, createMessage);

// GET messages for a session (range)
router.get('/session/:channelId/:startMsgId/:endMsgId', verifyToken, getSessionMessages);

// DELETE message
router.delete('/:id', verifyToken, deleteMessage);

// GET export messages
router.get('/:channelId/export', verifyToken, exportMessages);

export default router;
