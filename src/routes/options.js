import express from "express";
import SystemOption from "../models/SystemOption.js";
import { getOptions, addOption, deleteOption } from "../controllers/systemOptionController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// New Routes for Dynamic User Options
router.get("/", verifyToken, getOptions);
router.post("/", verifyToken, addOption);
router.delete("/:id", verifyToken, deleteOption);

// Get all options grouped by category
router.get("/all", async (req, res) => {
    try {
        const options = await SystemOption.find({});

        // Group by category
        const grouped = {
            department: [],
            designation: [],
            workType: []
        };

        options.forEach(opt => {
            if (grouped[opt.category]) {
                grouped[opt.category].push({ value: opt.value, label: opt.value });
            }
        });

        // Check if core categories are missing
        const hasDepartments = grouped.department.length > 0;
        const hasDesignations = grouped.designation.length > 0;
        const hasWorkTypes = grouped.workType.length > 0;

        if (!hasDepartments || !hasDesignations || !hasWorkTypes) {
            const defaults = [
                // Departments
                { category: "department", value: "SM Developer" },
                { category: "department", value: "SM SEO Specialist" },
                { category: "department", value: "SM Designer" },
                { category: "department", value: "Website Developer" },
                { category: "department", value: "Full Stack Developer" },
                { category: "department", value: "Sales Team" },

                // Designations
                { category: "designation", value: "Junior" },
                { category: "designation", value: "Senior" },
                { category: "designation", value: "Tech Lead" },
                { category: "designation", value: "Intern" },

                // Work Types
                { category: "workType", value: "Full Time" },
                { category: "workType", value: "Hybrid" },
                { category: "workType", value: "Remote" },
            ];

            // Filter out existing ones to avoid duplicates
            // We use a Set for O(1) lookup: "category:value"
            const existingSet = new Set(options.map(o => `${o.category}:${o.value}`));
            const toInsert = defaults.filter(d => !existingSet.has(`${d.category}:${d.value}`));

            if (toInsert.length > 0) {
                await SystemOption.insertMany(toInsert);

                // Add newly inserted to grouped response immediately
                toInsert.forEach(opt => {
                    if (grouped[opt.category]) {
                        grouped[opt.category].push({ value: opt.value, label: opt.value });
                    }
                });
            }
        }

        res.json(grouped);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Add a new option
router.post("/add", async (req, res) => {
    try {
        const { category, value } = req.body;

        if (!category || !value) {
            return res.status(400).json({ message: "Category and Value are required" });
        }

        const existing = await SystemOption.findOne({ category, value });
        if (existing) {
            return res.status(400).json({ message: "Option already exists" });
        }

        const newOption = await SystemOption.create({ category, value });

        res.status(201).json({
            message: "Option added successfully",
            option: { value: newOption.value, label: newOption.value, category: newOption.category }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

export default router;
