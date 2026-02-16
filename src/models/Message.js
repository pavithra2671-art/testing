import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    content: { type: String }, // Text content
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    channel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true },
    type: {
        type: String,
        default: 'text'
    },
    fileUrl: { type: String }, // For images/voice notes
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

export default mongoose.model('Message', messageSchema);
