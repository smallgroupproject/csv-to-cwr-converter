const express = require('express');
const multer = require('multer');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

const app = express();
const port = 3000;

// Set up multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Serve static files (HTML, CSS)
app.use(express.static('public'));

// Helper function to pad fields for fixed-width format
const padField = (value, length) => {
    return String(value).padEnd(length, ' ').slice(0, length);
};

// Handle file upload and conversion
app.post('/convert', upload.single('csv-file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const results = [];
    const csvFilePath = req.file.path;
    const cwrFileName = `${path.parse(req.file.originalname).name}.cwr`;
    const outputFilePath = path.join(__dirname, 'converted', cwrFileName);

    // Ensure converted directory exists
    if (!fs.existsSync('converted')) {
        fs.mkdirSync('converted');
    }

    // Parse CSV file
    fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
            // Generate CWR content
            let cwrContent = '';
            
            // HDR (Header Record)
            const currentDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            cwrContent += `HDR${padField('SENDER_ID', 9)}${padField('RECEIVER_ID', 9)}${currentDate}CWR2.1\n`;

            // Process each CSV row as a new work (NWR) and songwriter (SWR)
            results.forEach((row, index) => {
                const workNumber = String(index + 1).padStart(5, '0');
                
                // NWR (New Work Registration)
                const title = row.title || 'UNKNOWN_TITLE';
                const iswc = row.iswc || '';
                const duration = row.duration || '00:00';
                cwrContent += `NWR${workNumber}${padField(title, 60)}${padField(iswc, 11)}${padField(duration, 6)}\n`;

                // SWR (Songwriter)
                const songwriter = row.songwriter || 'UNKNOWN_WRITER';
                cwrContent += `SWR${workNumber}${padField(songwriter, 60)}\n`;

                // PUB (Publisher)
                const publisher = row.publisher || 'UNKNOWN_PUBLISHER';
                cwrContent += `PUB${workNumber}${padField(publisher, 60)}\n`;
            });

            // TRL (Trailer Record)
            const totalRecords = results.length * 3 + 2; // NWR + SWR + PUB per work, plus HDR and TRL
            cwrContent += `TRL${String(totalRecords).padStart(9, '0')}\n`;

            // Write to CWR file
            fs.writeFile(outputFilePath, cwrContent, (err) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('Error converting file.');
                }

                // Clean up uploaded file
                fs.unlinkSync(csvFilePath);

                // Send response with download link
                res.send(`
                    <div style="text-align:center; color: #5789bb;">
                        File converted successfully! 
                        <a href="/converted/${cwrFileName}" download>Download CWR file</a>
                    </div>
                `);
            });
        })
        .on('error', (err) => {
            console.error(err);
            res.status(500).send('Error parsing CSV file.');
        });
});

app.use('/converted', express.static('converted'));

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});