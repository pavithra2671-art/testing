import "dotenv/config";
import express from "express";
import cors from "cors";
import connectDB from "./config/db.js";
import authRoutes from "./routes/auth.js";
import taskRoutes from "./routes/tasks.js";
import employeeRoutes from "./routes/employee.js";
import workLogRoutes from "./routes/workLogs.js";
import attendanceRoutes from "./routes/attendance.js";
import leaveRoutes from "./routes/leave.js";
import optionRoutes from "./routes/options.js";
import seedSuperAdmin from "./seedSuperAdmin.js";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { syncDepartmentChannels, ensureFoxDigitalOneTeamChannel } from "./controllers/channelController.js";
import { Server } from "socket.io";
import os from "os";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

connectDB().then(async () => {
  await seedSuperAdmin();
  await syncDepartmentChannels();
  // Pass io (which will be initialized by the time this runs due to async DB connection)
  // Ensure io is available. Since connectDB is async, io variable from below line 44 should be initialized? 
  // Wait, const io is block scoped. It IS available in this module scope, but TDZ applies if accessed before declaration.
  // Since this `.then` runs later, it *should* be fine. But to be safe, let's defer it or move io init up.
  // Actually, moving io init up is safer.

  // Or just rely on the fact that DB connection takes time.
  // Let's assume io is ready.
  if (typeof io !== 'undefined') {
    await ensureFoxDigitalOneTeamChannel(io);
  } else {
    console.log("Socket.io not ready yet for One Team channel creation, skipping startup check (will be checked on department add)");
  }

  httpServer.listen(5001, () =>
    console.log("🚀 Server running on port 5001")
  );
});

// we’ll whitelist known origins plus any Netlify preview URL
// since the preview hostname changes per build we accept *.netlify.app
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://testing-7i84.onrender.com",              // deployed backend (for sanity checks)
  "https://foxtaskmanager.netlify.app",
  // other fixed production hosts…
];

// helper used by both Express and Socket.io
function originValidator(origin, callback) {
  if (!origin) return callback(null, true); // allow non-browser clients (curl, Postman)
  const netlifyPattern = /https:\/\/.*\.netlify\.app$/;
  if (
    allowedOrigins.includes(origin) ||
    netlifyPattern.test(origin)
  ) {
    callback(null, true);
  } else {
    callback(new Error("Not allowed by CORS"));
  }
}

const io = new Server(httpServer, {
  cors: {
    origin: originValidator,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  }
});

app.use(cors({
  origin: originValidator,
  credentials: true
}));

// Add Private Network Access header for Chrome
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Private-Network", "true");
  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(200).json({});
  }
  next();
});
app.use(express.json());

// Request Logger
app.use((req, res, next) => {
  next();
});

// Store io instance in app
app.set("io", io);

// Middleware (optional, if we want req.io, but app.get is safer)
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes


// Import Chat Routes
import channelRoutes from "./routes/channel.routes.js";
import messageRoutes from "./routes/message.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import SystemLog from "./models/SystemLog.js";
import systemLogRoutes from "./routes/systemLog.js";

app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/employee", employeeRoutes);
app.use("/api/work-logs", workLogRoutes);
app.use("/api/leave", leaveRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/options", optionRoutes);
app.use("/api/system-logs", systemLogRoutes);

// Chat Routes
app.use("/api/channels", channelRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/upload", uploadRoutes);

// Socket.IO Connection Handler
io.on("connection", (socket) => {

  socket.on("join_channel", (channelId) => {
    socket.join(channelId);
  });

  socket.on("setup", (userData) => {
    socket.join(userData._id);
    socket.join("global");
    socket.emit("connected");
  });

  socket.on("disconnect", () => {
  });
});

// Serve uploads folder
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Server started inside connectDB to ensure DB is ready

app.get("/test", (req, res) => {
  res.send("Server is working!");
});

// Inline Route for System Stats (Fixing 404 issue)
app.get("/api/system-logs/latest", async (req, res) => {
  try {
    // Try to fetch from DB
    const latestLog = await SystemLog.findOne().sort({ timestamp: -1 });
    if (latestLog) {
      return res.json(latestLog);
    }

    // Fallback: Return current stats if no logs in DB
    const memory = process.memoryUsage();
    const localIPs = getIPAddress(); // server.js has this helper

    const fallbackStats = {
      hostname: os.hostname(),
      publicIP: publicIP || "Unavailable", // server.js has this variable
      localIPs: localIPs,
      ramUsage: {
        rss: (memory.rss / 1024 / 1024).toFixed(2) + " MB",
        heapTotal: (memory.heapTotal / 1024 / 1024).toFixed(2) + " MB",
        heapUsed: (memory.heapUsed / 1024 / 1024).toFixed(2) + " MB",
      },
      timestamp: new Date()
    };

    res.json(fallbackStats);
  } catch (error) {
    console.error("Error fetching latest system log (inline):", error);
    res.status(500).json({ message: "Server Error" });
  }
});

app.get("/api/system-logs/history", async (req, res) => {
  try {
    const logs = await SystemLog.find().sort({ timestamp: -1 }).limit(50);
    res.json(logs);
  } catch (error) {
    console.error("Error fetching system log history:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

// Cleanup old logs on startup (optional)
const cleanupOldLogs = async () => {
  try {
    // Keep only the last 1000 logs or logs from the last 24 hours
    // For now, let's just rely on the TTL index in the model, but we can also do a manual cleanup if needed
    console.log("System Log cleanup initialized (handled by MongoDB TTL)");
  } catch (error) {
    console.error("Error cleaning up old logs:", error);
  }
};
cleanupOldLogs();

// Helper function to get IP address
const getIPAddress = () => {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (i.e. 127.0.0.1) and non-ipv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ name, address: iface.address, mac: iface.mac });
      }
    }
  }
  return addresses;
};

let publicIP = null;

const getPublicIP = async () => {
  try {
    const response = await axios.get('https://api.ipify.org?format=json');
    publicIP = response.data.ip;
  } catch (error) {
    console.error("Error fetching public IP:", error.message);
    publicIP = "Unavailable";
  }
};

// Fetch Public IP once on startup
getPublicIP();

// Re-fetch Public IP every hour (optional, in case it changes)
setInterval(getPublicIP, 3600000);

setInterval(async () => {
  const memory = process.memoryUsage();
  const localIPs = getIPAddress();
  console.log(`[${new Date().toISOString()}] System Stats:`);
  console.log(`Hostname: ${os.hostname()}`);
  console.log(`Public IP: ${publicIP || "Fetching..."}`);
  if (localIPs.length > 0) {
    console.log("Local IPs:");
    localIPs.forEach(ip => console.log(`  - ${ip.name}: ${ip.address} (MAC: ${ip.mac})`));
  } else {
    console.log("Local IPs: 127.0.0.1 (Internal Only)");
  }

  console.log("RAM Usage:", {
    rss: (memory.rss / 1024 / 1024).toFixed(2) + " MB",
    heapTotal: (memory.heapTotal / 1024 / 1024).toFixed(2) + " MB",
    heapUsed: (memory.heapUsed / 1024 / 1024).toFixed(2) + " MB",
  });
  console.log("----------------------------------------");

  // Save to Database
  try {
    const newLog = new SystemLog({
      hostname: os.hostname(),
      publicIP: publicIP || "Unavailable",
      localIPs: localIPs,
      ramUsage: {
        rss: (memory.rss / 1024 / 1024).toFixed(2) + " MB",
        heapTotal: (memory.heapTotal / 1024 / 1024).toFixed(2) + " MB",
        heapUsed: (memory.heapUsed / 1024 / 1024).toFixed(2) + " MB",
      },
    });
    await newLog.save();
  } catch (error) {
    console.error("Error saving system log to DB:", error.message);
  }

}, 1000);



























