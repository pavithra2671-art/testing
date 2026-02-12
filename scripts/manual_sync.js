import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { syncDepartmentChannels } from '../src/controllers/channelController.js';
import fs from 'fs';

dotenv.config({ path: './.env' }); // try root
console.log("MONGO_URI:", process.env.MONGO_URI);

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/taskmanager');
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const log = (msg) => {
    console.log(msg);
    fs.appendFileSync('verification_output.txt', msg + '\n');
};

const run = async () => {
    // fs.writeFileSync('verification_output.txt', ''); // Clear file
    await connectDB();

    const User = mongoose.model('User');
    const allUsers = await User.find({});
    log(`--- DEBUG: Found ${allUsers.length} Users ---`);
    // allUsers.forEach(u => console.log(`${u.name}: [${u.role}] (Designation: ${u.designation})`));
    log("----------------------------");

    log("Starting Manual Sync...");
    await syncDepartmentChannels();
    log("Sync Finished.");

    // Verify
    const Channel = mongoose.model('Channel');
    const channels = await Channel.find({ isDepartment: true }); // or name starts with Dept-
    log("--- Verified Department Channels ---");
    if (channels.length === 0) {
        // Fallback check by name if isDepartment flag wasn't saved (schema might be strict)
        const allChannels = await Channel.find({ name: /^Dept-/ });
        allChannels.forEach(c => log(`- ${c.name} (Members: ${c.allowedUsers.length})`));
    } else {
        channels.forEach(c => log(`- ${c.name} (Members: ${c.allowedUsers.length})`));
    }
    log("----------------------------------");

    process.exit(0);
};

run();
