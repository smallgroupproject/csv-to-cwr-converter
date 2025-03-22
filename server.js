const express = require('express');
const multer = require('multer');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

const app = express();
const port = 3000;

const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));

const padField = (value, length) => {
    return String(value).padEnd(length, ' ').slice(0, length);
};

app.post('/convert', upload.single('csv-file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const results = [];
    const csvFilePath = req.file.path;
    const cwrFileName = `${path.parse(req.file.originalname).name}.cwr`;
    const outputFilePath = path.join(__dirname, 'converted', cwrFileName);

    if (!fs.existsSync('converted')) {
        fs.mkdirSync('converted');
    }

    fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
            let cwrContent = '';
            
            const currentDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            cwrContent += `HDR${padField('SENDER_ID', 9)}${padField('RECEIVER_ID', 9)}${currentDate}CWR2.1\n`;

            results.forEach((row, index) => {
                const workNumber = String(index + 1).padStart(5, '0');
                
                const title = row.title || 'UNKNOWN_TITLE';
                const iswc = row.iswc || '';
                const duration = row.duration || '00:00';
                cwrContent += `NWR${workNumber}${padField(title, 60)}${padField(iswc, 11)}${padField(duration, 6)}\n`;

                const songwriter = row.songwriter || 'UNKNOWN_WRITER';
                cwrContent += `SWR${workNumber}${padField(songwriter, 60)}\n`;

                const publisher = row.publisher || 'UNKNOWN_PUBLISHER';
                cwrContent += `PUB${workNumber}${padField(publisher, 60)}\n`;
            });

            const totalRecords = results.length * 3 + 2;
            cwrContent += `TRL${String(totalRecords).padStart(9, '0')}\n`;

            fs.writeFile(outputFilePath, cwrContent, (err) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('Error converting file.');
                }
                fs.unlinkSync(csvFilePath);
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