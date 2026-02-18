import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SystemOption from './src/models/SystemOption.js';

dotenv.config();

const fixIndexes = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        // List existing indexes
        const existing = await SystemOption.collection.indexes();
        console.log("Existing Indexes:", existing.map(i => i.name));

        // Drop all indexes (except _id)
        console.log("Dropping all indexes...");
        await SystemOption.collection.dropIndexes();
        console.log("Indexes dropped.");

        // Rebuild indexes
        console.log("Rebuilding indexes...");
        await SystemOption.ensureIndexes();
        console.log("Indexes rebuilt.");

        // Verify
        const newIndexes = await SystemOption.collection.indexes();
        console.log("New Indexes:", newIndexes.map(i => i.name));

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

fixIndexes();
