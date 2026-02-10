import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
    {
        projectName: {
            type: String,
            required: true,
        },
        taskTitle: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            required: true,
        },
        department: {
            type: [String],
        },
        teamLead: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        projectLead: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        }],
        workCategory: {
            type: String,
        },
        roles: {
            type: [String], // Array of strings for tags
            default: [],
        },
        assignType: {
            type: String,
            enum: ["Single", "Department", "Project-wise", "Overall"],
            default: "Single",
        },
        assignee: {
            type: [String], // Changed to Array: Can be list of Dept Names or empty
        },
        priority: {
            type: String,
            enum: ["Medium", "High", "Low"],
            default: "Medium",
        },
        startDate: {
            type: String, // Storing as String "YYYY-MM-DD" or Date
        },
        startTime: {
            type: String, // Storing as String "HH:MM"
        },
        deadline: {
            type: String, // "YYYY-MM-DD"
        },
        multiAssign: {
            type: Boolean,
            default: false,
        },
        documentPath: {
            type: String, // Filename or path
        },
        audioPath: {
            type: String, // Filename or path
        },
        status: {
            type: String,
            enum: ["Pending", "In Progress", "Completed", "Overdue", "Hold"],
            default: "Pending",
        },
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        assignedTo: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        }],
        declinedBy: [
            {
                userId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
                reason: {
                    type: String,
                },
                date: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
    },
    { timestamps: true }
);

export default mongoose.model("Task", taskSchema);
