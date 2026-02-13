import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        token = req.headers['x-auth-token'];
    }

    if (!token) {
        return res.status(401).json({ message: "Access Denied: No Token Provided" });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET || "secret_key_123");

        // Fetch fresh user from DB to ensure roles are up-to-date
        // verified.id is standard, but some legacy tokens might have _id or userId. 
        // Let's handle common cases or stick to what authController signs.
        const userId = verified.id || verified._id || verified.userId;
        const user = await User.findById(userId).select('-password');

        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }

        req.user = user; // Now req.user is the full Mongoose document
        next();
    } catch (error) {
        console.error("Token Verification Error:", error.message);
        res.status(403).json({ message: "Invalid Token" });
    }
};

const authorizeRole = (...allowedRoles) => {
    return (req, res, next) => {
        // Check if user has ANY of the allowed roles
        const hasRole = req.user && req.user.role.some(r => allowedRoles.includes(r));
        if (!hasRole) {
            return res.status(403).json({ message: `Access Denied: Requires one of ${allowedRoles.join(', ')} role` });
        }
        next();
    };
};

export { verifyToken, authorizeRole };
