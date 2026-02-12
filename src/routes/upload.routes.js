import express from 'express';
import multer from 'multer';
// import { GridFsStorage } from 'multer-gridfs-storage';
import mongoose from 'mongoose';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { Readable } from 'stream';

dotenv.config();

const router = express.Router();

// Create storage engine (Memory for manual GridFS streaming)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Init GridFS Bucket
let gfsBucket;
const conn = mongoose.connection;
conn.once('open', () => {
    gfsBucket = new mongoose.mongo.GridFSBucket(conn.db, {
        bucketName: 'uploads'
    });
    console.log("GridFS Bucket Initialized");
});



// Route: POST /api/upload
router.post('/', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    if (!gfsBucket) {
        return res.status(500).json({ message: "Database not ready" });
    }

    // Generate filename
    crypto.randomBytes(16, (err, buf) => {
        if (err) {
            return res.status(500).json({ message: 'Could not generate filename' });
        }
        const filename = buf.toString('hex') + path.extname(req.file.originalname);

        // Create upload stream
        const writestream = gfsBucket.openUploadStream(filename, {
            contentType: req.file.mimetype
        });

        // Use a readable stream to pipe buffer to GridFS
        const readableStream = new Readable();
        readableStream.push(req.file.buffer);
        readableStream.push(null); // End of data

        readableStream.pipe(writestream)
            .on('error', (error) => {
                console.error("GridFS Upload Error:", error);
                return res.status(500).json({ message: "Error uploading file" });
            })
            .on('finish', () => {
                // Generate Absolute URL
                const protocol = req.protocol;
                const host = req.get('host');
                const fileUrl = `${protocol}://${host}/api/upload/files/${filename}`;

                res.json({
                    fileUrl: fileUrl,
                    fileName: req.file.originalname,
                    fileType: req.file.mimetype,
                    size: req.file.size,
                    id: writestream.id
                });
            });
    });
});

// Route: GET /api/upload/files/:filename
router.get('/files/:filename', async (req, res) => {
    try {
        if (!gfsBucket) {
            return res.status(500).json({ message: "Database not ready" });
        }

        const file = await conn.db.collection('uploads.files').findOne({ filename: req.params.filename });

        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        // Check if image or other type to set headers
        if (file.contentType) {
            res.set('Content-Type', file.contentType);
        }

        const readStream = gfsBucket.openDownloadStreamByName(req.params.filename);
        readStream.pipe(res);

    } catch (err) {
        console.error("File Retreival Error:", err);
        res.status(500).json({ message: 'Server Error' });
    }
});

export default router;
