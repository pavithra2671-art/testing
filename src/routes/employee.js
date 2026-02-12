import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { syncDepartmentChannels } from "../controllers/channelController.js";

const router = express.Router();

// GET ALL EMPLOYEES
router.get("/all", async (req, res) => {
    try {
        const users = await User.find({ role: { $ne: "Super Admin" } }).select("employeeId name email role designation joiningDate");
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET NEXT EMPLOYEE ID
router.get("/nextid", async (req, res) => {
    try {
        let nextId = "FOXIAN001";
        const lastEmployee = await User.findOne({ employeeId: { $regex: /^FOXIAN\d+$/ } })
            .sort({ createdAt: -1 })
            .collation({ locale: "en_US", numericOrdering: true });

        if (lastEmployee && lastEmployee.employeeId) {
            const lastIdNum = parseInt(lastEmployee.employeeId.replace("FOXIAN", ""), 10);
            if (!isNaN(lastIdNum)) {
                nextId = `FOXIAN${String(lastIdNum + 1).padStart(3, "0")}`;
            }
        }
        res.json({ nextId });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ADD EMPLOYEE
router.post("/add", async (req, res) => {
    try {
        const { name, email, role, designation, workType, joiningDate, password } = req.body;

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({ message: "Email already registered" });
        }

        // Auto-generate Employee ID
        let newEmployeeId = "FOXIAN001";
        const lastEmployee = await User.findOne({ employeeId: { $regex: /^FOXIAN\d+$/ } })
            .sort({ createdAt: -1 })
            .collation({ locale: "en_US", numericOrdering: true });

        if (lastEmployee && lastEmployee.employeeId) {
            const lastIdNum = parseInt(lastEmployee.employeeId.replace("FOXIAN", ""), 10);
            if (!isNaN(lastIdNum)) {
                newEmployeeId = `FOXIAN${String(lastIdNum + 1).padStart(3, "0")}`;
            }
        }

        // Use provided password or fallback to default
        const passwordToUse = password || "password123";
        const hashedPassword = await bcrypt.hash(passwordToUse, 10);

        const user = await User.create({
            name,
            email,
            employeeId: newEmployeeId,
            role, // Expecting array
            designation,
            workType,
            joiningDate,
            password: hashedPassword,
        });

        // Trigger Channel Sync
        await syncDepartmentChannels();

        res.status(210).json({ // Changed to 210 to indicate resource created
            message: `Employee added successfully. Generated ID: ${newEmployeeId}`,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                employeeId: user.employeeId,
                role: user.role,
                designation: user.designation,
                workType: user.workType,
            },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET EMPLOYEE BY ID
router.get("/:employeeId", async (req, res) => {
    try {
        const { employeeId } = req.params;
        const user = await User.findOne({ employeeId }).select("-password");

        if (!user) {
            return res.status(404).json({ message: "Employee not found" });
        }

        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// UPDATE EMPLOYEE DETAILS
router.patch("/update", async (req, res) => {
    try {
        const { employeeId, name, email, role, designation, workType, password } = req.body;

        const updateData = { name, email, role, designation, workType };

        if (password) {
            console.log("Updating password for user:", employeeId);
            updateData.password = await bcrypt.hash(password, 10);
        } else {
            console.log("No password provided for update");
        }

        const user = await User.findOneAndUpdate(
            { employeeId },
            updateData,
            { new: true }
        ).select("-password");

        if (!user) {
            return res.status(404).json({ message: "Employee not found" });
        }

        // Trigger Channel Sync
        await syncDepartmentChannels();

        res.json({
            message: "Role/Designation updated successfully",
            user,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

export default router;
