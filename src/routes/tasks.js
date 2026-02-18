import express from "express";
import multer from "multer";
import {
    createTask,
    getInvitations,
    respondToTask,
    getMyTasks,
    downloadFile,
    getTasksByEmployee,
    getAllTasks,
    getTasksAssignedByUser, // Import
    getDashboardStats,
    updateTaskStatus,
    reworkTask,
    updateChatTopic,
    getTaskById
} from "../controllers/taskController.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Multer Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, "../../uploads");
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });

// Routes
router.post("/", upload.fields([{ name: 'documents', maxCount: 5 }, { name: 'audioFile', maxCount: 1 }]), createTask);
router.get("/my-invitations", getInvitations);
router.use("/:id/respond", (req, res, next) => {
    console.log(`[TasksRouter] Respond route hit for ID: ${req.params.id}`);
    next();
});
router.post("/:id/respond", respondToTask);
router.get("/my-tasks", getMyTasks);
router.get("/employee/:employeeId", getTasksByEmployee);
router.get("/assigned-by/:userId", getTasksAssignedByUser); // New Route
router.get("/all", getAllTasks);
router.get("/stats", getDashboardStats);
router.get("/download/:filename", downloadFile);
router.put("/:id/status", updateTaskStatus);
router.put("/:id/rework", reworkTask);
router.put("/:id/chat-topic", updateChatTopic);
router.get("/:id", getTaskById); // Place specific routes above if colliding, but this matches ID pattern

export default router;
