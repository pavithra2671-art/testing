import "dotenv/config";
import connectDB from "./config/db.js";
import SystemOption from "./models/SystemOption.js";

const cleanup = async () => {
    try {
        await connectDB();
        console.log("Cleaning up System Options...");
        await SystemOption.deleteMany({});
        console.log("All System Options deleted.");
        process.exit();
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
};

cleanup();
