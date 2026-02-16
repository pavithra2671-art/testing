import User from "../models/User.js";
import jwt from "jsonwebtoken";

export const generateChatToken = async (req, res) => {
    try {
        // Assume request comes authenticated via existing authMiddleware

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const payload = {
            id: user._id,
            email: user.email,
            name: user.name,
            role: user.designation ? [user.designation, ...(Array.isArray(user.role) ? user.role : [user.role])] : user.role,
            employeeId: user.employeeId
        };

        // Sign with the SHARED secret
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "5m" }); // Short lived token for handoff

        res.json({ token });
    } catch (error) {
        console.error("Chat Token Generation Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

export const getAllUsers = async (req, res) => {
    try {
        const users = await User.find({}, 'name email role designation employeeId');
        res.json(users);
    } catch (error) {
        console.error("Get All Users Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
