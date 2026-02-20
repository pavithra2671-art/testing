import mongoose from "mongoose";
import "dotenv/config";
import SystemLog from "./src/models/SystemLog.js";

const verifyLogGeneration = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB");

        const initialCount = await SystemLog.countDocuments();
        console.log(`Initial Log Count: ${initialCount}`);

        console.log("Waiting 5 seconds...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        const finalCount = await SystemLog.countDocuments();
        console.log(`Final Log Count: ${finalCount}`);

        if (finalCount > initialCount) {
            console.log(`✅ Logs are increasing! (+${finalCount - initialCount} logs)`);
        } else {
            console.log("❌ Logs are NOT increasing. Check server.js loop.");
        }

        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
};

verifyLogGeneration();
