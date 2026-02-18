import SystemOption from "../models/SystemOption.js";
import WorkLog from "../models/WorkLog.js";
import { ensureFoxDigitalOneTeamChannel } from "./channelController.js";

// @desc    Get All Options (Global + User Specific + Legacy from WorkLogs)
// @route   GET /api/system-options
// @access  Private
// @desc    Get All Options (Global + User Specific + Legacy from WorkLogs)
// @route   GET /api/system-options
// @access  Private
export const getOptions = async (req, res) => {
    try {
        console.log("[getOptions] Request user:", req.user ? req.user._id : "No User");
        const userId = req.user.id || req.user._id;
        const { category } = req.query; // optional filter

        // User sees ONLY their own options + System defaults
        const query = {
            $or: [
                { createdBy: userId },
                { createdBy: null }
            ]
        };

        if (category) {
            query.category = category;
        }

        const systemOptions = await SystemOption.find(query).sort({ value: 1 });

        // Map system options
        const formattedOptions = systemOptions.map(opt => ({
            _id: opt._id,
            value: opt.value,
            category: opt.category,
            isCustom: true,
            // Only creator can delete. System opts (null) cannot be deleted.
            canDelete: opt.createdBy && opt.createdBy.toString() === userId.toString()
        }));

        res.json(formattedOptions);
    } catch (error) {
        console.error("Error fetching options:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Add New Option
// @route   POST /api/system-options
// @access  Private
export const addOption = async (req, res) => {
    try {
        console.log("[addOption] Body:", req.body);
        const { category, value } = req.body;
        const userId = req.user.id || req.user._id;

        if (!category || !value) {
            return res.status(400).json({ message: "Category and Value are required" });
        }

        // Check availability (User's list + System Defaults)
        const existing = await SystemOption.findOne({
            category,
            value,
            $or: [
                { createdBy: userId },
                { createdBy: null }
            ]
        });

        if (existing) {
            // Return existing option with success status so frontend uses it smoothly
            return res.status(200).json({
                _id: existing._id,
                value: existing.value,
                category: existing.category,
                isCustom: true,
                canDelete: existing.createdBy && existing.createdBy.toString() === userId.toString(),
                message: "Option already exists."
            });
        }

        const newOption = await SystemOption.create({
            category,
            value,
            createdBy: userId
        });

        // If a Department is created, ensure the company-wide channel exists
        if (category === 'department') {
            const io = req.app.get("io");
            // Run asynchronously to not block response
            ensureFoxDigitalOneTeamChannel(io).catch(err => console.error("Error creating One Team channel", err));
        }

        res.status(201).json({
            _id: newOption._id,
            value: newOption.value,
            category: newOption.category,
            isCustom: true,
            canDelete: true
        });

    } catch (error) {
        console.error("Error adding option:", error);
        if (error.code === 11000) {
            // Handle Race Condition: Try to find the user's option
            const retry = await SystemOption.findOne({ category, value, createdBy: userId });
            if (retry) {
                return res.status(200).json({
                    _id: retry._id,
                    value: retry.value,
                    category: retry.category,
                    isCustom: true,
                    canDelete: true
                });
            }
            return res.status(400).json({ message: "Option exists." });
        }
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: "Server Error" });
    }
};

// @desc    Delete Option
// @route   DELETE /api/system-options/:id
// @access  Private
export const deleteOption = async (req, res) => {
    try {
        const option = await SystemOption.findById(req.params.id);

        if (!option) {
            return res.status(404).json({ message: "Option not found" });
        }

        if (!option.createdBy || option.createdBy.toString() !== req.user.id.toString()) {
            return res.status(403).json({ message: "Not authorized to delete this option" });
        }

        await SystemOption.findByIdAndDelete(req.params.id);

        res.json({ message: "Option removed" });
    } catch (error) {
        console.error("Error deleting option:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
