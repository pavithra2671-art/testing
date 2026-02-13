
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SystemOption from './src/models/SystemOption.js';
import User from './src/models/User.js';

dotenv.config();

const checkOptions = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB");

        console.log("--- Checking System Options ---");
        const options = await SystemOption.find({});

        console.log(`Total Options: ${options.length}`);

        // Group by createdBy
        const globalOptions = options.filter(o => !o.createdBy);
        const userOptions = options.filter(o => o.createdBy);

        console.log(`Global Options (should be hidden): ${globalOptions.length}`);
        if (globalOptions.length > 0) {
            console.log("Sample Global:", globalOptions.slice(0, 3).map(o => `${o.category}: ${o.value}`));
        }

        console.log(`User Specific Options: ${userOptions.length}`);

        // Check for specific user's options if we can identify them (e.g. by value 'Airwill' which user says is showing)
        const airwill = options.find(o => o.value === 'Airwill');
        if (airwill) {
            console.log("Found 'Airwill':");
            console.log(airwill);
            if (airwill.createdBy) {
                const user = await User.findById(airwill.createdBy);
                console.log("Created By User:", user ? user.name : "Unknown User ID");
            } else {
                console.log("Created By: NULL (Global)");
            }
        } else {
            console.log("'Airwill' not found in SystemOptions DB.");
        }

        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
};

checkOptions();
