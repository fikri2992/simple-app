// server.js (Node.js Express app)
const express = require('express');
const puppeteer = require('puppeteer');
const {
    Storage
} = require('@google-cloud/storage');
const ffmpeg = require('fluent-ffmpeg'); // For video rendering

const app = express();
const port = process.env.PORT || 8080;

// Initialize Google Cloud Storage
const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME; // Set your bucket name
const bucket = storage.bucket(bucketName);

// Helper function to upload to GCS
async function uploadToGCS(filename, filepath) {
    try {
        await bucket.upload(filepath, {
            destination: filename,
            public: true, // Make the file publicly accessible (optional)
        });
        console.log(`File ${filename} uploaded to gs://${bucketName}.`);
        return `https://storage.googleapis.com/${bucketName}/${filename}`; // Return public URL
    } catch (error) {
        console.error('Error uploading to GCS:', error);
        throw error;
    }
}

app.use(express.json()); // Enable parsing JSON request bodies

app.post('/screenshot', async (req, res) => {
    const {
        url
    } = req.body;
    if (!url) {
        return res.status(400).send('URL is required');
    }

    try {
        const browser = await puppeteer.launch({
            headless: 'new'
        }); // Use headless: 'new'
        const page = await browser.newPage();
        await page.goto(url, {
            waitUntil: 'networkidle2'
        }); // Wait until the network is idle

        const filename = `screenshot-${Date.now()}.png`;
        const filepath = `/tmp/${filename}`; // Use /tmp for Cloud Run
        await page.screenshot({
            path: filepath
        });

        await browser.close();

        const gcsUrl = await uploadToGCS(filename, filepath);
        res.json({
            url: gcsUrl
        });

    } catch (error) {
        console.error('Screenshot error:', error);
        res.status(500).send('Error taking screenshot');
    }
});


app.post('/record', async (req, res) => {
    const {
        url
    } = req.body;
    if (!url) {
        return res.status(400).send('URL is required');
    }

    try {
        const browser = await puppeteer.launch({
            headless: 'new'
        });
        const page = await browser.newPage();
        await page.goto(url, {
            waitUntil: 'networkidle2'
        });

        const filename = `record-${Date.now()}.mp4`;
        const filepath = `/tmp/${filename}`;

        // Get page dimensions
        const {
            width,
            height
        } = await page.evaluate(() => {
            return {
                width: window.innerWidth,
                height: window.innerHeight
            };
        });

        const recording = ffmpeg()
            .input(page.createCDPSession().send('Page.startScreencast', {
                format: 'mp4',
                quality: 100,
                maxWidth: width,
                maxHeight: height,
                everyNthFrame: 1,
            }))
            .videoCodec('libx264') // You might need to install this codec
            .output(filepath);


        let scrollHeight = 0;
        const maxScroll = 5 * 1000; // 5 seconds in milliseconds
        const startTime = Date.now();

        recording.run();

        while (Date.now() - startTime < maxScroll) {
            await page.evaluate(`window.scrollBy(0, ${height / 10});`); // Scroll down
            scrollHeight += height / 10;
            await new Promise(resolve => setTimeout(resolve, 200)); // Adjust scroll speed
        }

        await page.createCDPSession().send('Page.stopScreencast');
        await browser.close();

        const gcsUrl = await uploadToGCS(filename, filepath);
        res.json({
            url: gcsUrl
        });

    } catch (error) {
        console.error('Recording error:', error);
        res.status(500).send('Error recording video');
    }
});


app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});