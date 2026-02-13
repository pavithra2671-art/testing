import mongoose from "mongoose";

const workLogSchema = new mongoose.Schema(
    {
        employeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        taskTitle: {
            type: String,
            required: true,
        },
        projectName: {
            type: String,
            required: true,
        },
        date: {
            type: String, // Storing as string "YYYY-MM-DD"
            required: true,
        },
        startTime: {
            type: String,
        },
        endTime: {
            type: String,
        },
        duration: {
            type: String,
        },
        description: {
            type: String,
            required: true,
        },
        documentPath: {
            type: String, // Filename or path
        },
        audioPath: {
            type: String, // Filename or path
        },
        taskStartDate: {
            type: String,
        },
        logEndDate: {
            type: String,
        },
        status: {
            type: String, // "Hold", "In Progress", "Completed"
            default: "In Progress",
        },
        taskNo: {
            type: Number,
        },
        taskOwner: {
            type: String,
        },
        taskType: {
            type: String,
        },
        timeAutomation: {
            type: String,
        },
        logType: {
            type: String,
            default: "Main Task" // Default to Main Task for backward compatibility or auto-logs
        },
        assignedBy: {
            type: String
        },
        // CSV Imported Fields
        "Date": String, // Capitalized Date from CSV
        "Task Owner": String,
        "Project Name": String,
        "Task No": { type: mongoose.Schema.Types.Mixed }, // Could be string or number in CSV
        "Start Time": String,
        "End Time": String,
        "Task Description": String,
        "Task Type": String,
        "Time Estimaion": String,
        "Status": String,
        reworkStartTime: { type: Date },
        reworkCount: { type: Number, default: 0 },
        reworkHistory: [{
            startTime: Date,
            endTime: Date,
            duration: Number, // Duration of this specific rework session in minutes
            events: [{
                action: String, // 'Hold', 'Resume'
                time: Date
            }]
        }],
    },
    { timestamps: true }
);

export default mongoose.model("WorkLog", workLogSchema, "employee_logs");
