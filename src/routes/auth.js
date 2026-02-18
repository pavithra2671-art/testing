import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import User from "../models/User.js";

const router = express.Router();
import { generateChatToken, getAllUsers } from "../controllers/authController.js";
import { verifyToken } from "../middleware/authMiddleware.js";


// SIGNUP
router.post("/signup", async (req, res) => {
  try {
    const { role, email, password, name, employeeId } = req.body;

    if (role === "Super Admin" || role === "Employee") {
      return res.status(403).json({ message: "Signup restricted for this role" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      role,
      email,
      password: hashedPassword,
      name: name || "Unknown", // Fallback if missing
      employeeId: employeeId || `EMP_${Date.now()}` // Fallback if missing
    });

    res.status(201).json({
      message: "Signup successful",
      user: {
        id: user._id,
        _id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.designation ? [user.designation, ...(Array.isArray(user.role) ? user.role : [user.role])] : user.role,
        name: user.name,
        email: user.email
      },
      process.env.JWT_SECRET || "secret_key_123",
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        _id: user._id,
        email: user.email,
        role: user.designation ? [user.designation, ...(Array.isArray(user.role) ? user.role : [user.role])] : user.role,
        name: user.name,
        designation: user.designation,
        employeeId: user.employeeId
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GENERATE CHAT TOKEN (Cross-App Auth)
router.get("/chat-token", verifyToken, generateChatToken);

// GET ALL USERS (For Global Directory)
router.get("/users", verifyToken, getAllUsers);

export default router;

