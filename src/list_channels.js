import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Channel from './models/Channel.js';
import fs from 'fs';

dotenv.config();

const listChannels = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const channels = await Channel.find({}).sort({ name: 1 });

        const output = channels.map(c => `${c.name} (${c.type})`).join('\n');
        fs.writeFileSync('channels_utf8.txt', output, 'utf8');
        console.log("Written to channels_utf8.txt");

        mongoose.disconnect();
    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND') {
            // Fallback to CommonJS if needed, but we know it's ESM
            console.log("Failed with ESM, check modules.");
        } else {
            console.error("Error:", error);
        }
    }
};

listChannels();
