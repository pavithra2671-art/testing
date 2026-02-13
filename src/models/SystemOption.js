import mongoose from "mongoose";

const systemOptionSchema = new mongoose.Schema({
    category: {
        type: String,
        required: true,
        enum: ["department", "designation", "workType", "Project", "Owner", "Type", "AssignedBy"], // Updated to match usage in options.js
    },
    value: {
        type: String,
        required: true,
        // unique: true // Removed global uniqueness, relying on compound index below
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null // null for global options
    }
}, { timestamps: true });

// Composite unique index to allow same value in different categories
systemOptionSchema.index({ category: 1, value: 1 }, { unique: true });

export default mongoose.model("SystemOption", systemOptionSchema);
