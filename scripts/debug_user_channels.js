import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../src/models/User.js';
import Channel from '../src/models/Channel.js';
import fs from 'fs';

dotenv.config({ path: './.env' });

const log = (msg) => {
    console.log(msg);
    fs.appendFileSync('debug_output.txt', msg + '\n');
};

const run = async () => {
    try {
        fs.writeFileSync('debug_output.txt', '');
        await mongoose.connect(process.env.MONGO_URI);
        log("DB Connected");

        // 1. Find the User
        const user = await User.findOne({ name: { $regex: /Gokul/i } });
        if (!user) {
            log("User 'Gokul' not found");
            process.exit(0);
        }
        log("--- User Details ---");
        log(`ID: ${user._id}`);
        log(`Name: ${user.name}`);
        log(`Role (Array?): ${JSON.stringify(user.role)}`);
        log(`Designation: ${user.designation}`);
        log(`Email: ${user.email}`);

        // 2. Find the Channel
        // We guess the department based on the user's role or just look for the FD channel
        const channelName = "Dept-Full Stack Developer";
        const channel = await Channel.findOne({ name: channelName });

        if (!channel) {
            log(`\nChannel '${channelName}' NOT FOUND.`);
        } else {
            log(`\n--- Channel '${channelName}' ---`);
            log(`ID: ${channel._id}`);
            log(`Type: ${channel.type}`);
            log(`AllowedUsers Count: ${channel.allowedUsers.length}`);

            // Check membership
            const isMember = channel.allowedUsers.some(id => id.toString() === user._id.toString());
            log(`\n*** Is User Member? ${isMember} ***`);
        }

        // 3. Test the exact query used in getChannels
        log("\n--- Testing getChannels Query ---");
        const query = {
            $or: [
                { allowedUsers: user._id },
                { type: 'Global', allowedUsers: { $size: 0 } }
            ]
        };
        const visibleChannels = await Channel.find(query).select('name type');
        log("Visible Channels:");
        visibleChannels.forEach(c => log(`- ${c.name} (${c.type})`));

    } catch (error) {
        console.error(error);
        log(error.message);
    } finally {
        process.exit(0);
    }
};

run();
