
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Channel from './models/Channel.js';

dotenv.config();

const fixFoxIntern = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB");

        const channelName = "fox-intern-"; // Based on user screenshot, it might be lowercase/hyphenated
        // Let's find it loosely
        const channel = await Channel.findOne({ name: { $regex: /fox-intern/i } });

        if (!channel) {
            console.log("Channel 'fox-intern' not found.");
            // Try "Fox-Intern" explicitly just in case
        } else {
            console.log(`Found channel: ${channel.name} (${channel._id})`);
            console.log(`Current isManual: ${channel.isManual}`);

            channel.isManual = true;
            await channel.save();
            console.log(`UPDATED: ${channel.name} is now isManual: true`);
        }

        mongoose.disconnect();
    } catch (error) {
        console.error("Error:", error);
    }
};

fixFoxIntern();
