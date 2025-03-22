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
    return String(value || '').padEnd(length, ' ').slice(0, length);
};

const formatDuration = (duration) => {
    if (!duration) return '0000';
    const [minutes, seconds] = duration.split(':').map(Number);
    return `${String(minutes).padStart(2, '0')}${String(seconds).padStart(2, '0')}`;
};

const parseInterestedParties = (partiesString) => {
    if (!partiesString) return [];

    const parties = [];
    const partyEntries = partiesString.split(/(?=\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+\d+\s+\([A-Z\/]+\))/);

    for (let entry of partyEntries) {
        entry = entry.trim();
        if (!entry) continue;

        const match = entry.match(/(.+?)\s+(\d+)\s+\(([A-Z\/]+)\)\s*(\d*\.?\d*)/);
        if (match) {
            const [, name, ipi, role, share] = match;
            parties.push({
                name: name.trim(),
                ipi: ipi.trim(),
                role: role.trim(),
                share: parseFloat(share) || 0
            });
        }
    }
    return parties;
};

const parseAffiliatedSocieties = (societiesString) => {
    if (!societiesString) return {};

    const societies = {};
    const entries = societiesString.split(/(?=\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+[A-Z]{2,3}\b)/);

    for (let entry of entries) {
        entry = entry.trim();
        if (!entry) continue;

        const match = entry.match(/(.+?)\s+([A-Z]{2,3})$/);
        if (match) {
            const [, name, society] = match;
            societies[name.trim()] = society.trim();
        }
    }
    return societies;
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
            let recordCount = 0;

            const currentDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            cwrContent += `HDR${padField('SENDER_ID', 9)}${padField('RECEIVER_ID', 9)}${currentDate}CWR2.1\n`;
            recordCount++;

            results.forEach((row, index) => {
                const workNumber = String(index + 1).padStart(5, '0');

                const title = row['TITLE'] || 'UNKNOWN_TITLE';
                const iswc = row['WORK CODE (ISWC)'] || '';
                const duration = formatDuration(row['DURATION (The length of the work.)']);
                const language = row['LANGUAGE (The language of the work\'s lyrics.)\n'] || 'ENG';
                const genre = row['GENRE (The musical genre of the work.)'] || '';
                cwrContent += `NWR${workNumber}${padField(title, 60)}${padField(iswc, 11)}${padField(duration, 6)}${padField(language, 3)}${padField(genre, 10)}\n`;
                recordCount++;

                const interestedPartiesColumn = 'INTERESTED PARTIES (Interested Party Identifier: A unique identifier assigned by the submitter to each interested party. This identifier should remain consistent across all CWR submissions for that party. HOME IPI Name Number: The Interested Party Information (IPI) name number is a unique international identifier assigned to each interested party. Including this number is strongly encouraged to ensure precise identification. HOME Role Code: A code indicating the specific role of the interested party in the creation or management of the work, such as composer, author, or publisher. Ownership Share: The percentage of ownership or entitlement the interested party has in the work, which is crucial for accurate royalty allocation. Territorial Rights: Information specifying the geographical regions where the interested party holds rights to the work.)';
                const interestedParties = parseInterestedParties(row[interestedPartiesColumn]);
                const societies = parseAffiliatedSocieties(row['AFFILIATED SOCIETES (Information on the societies with which the contributors are affiliated.)']);

                interestedParties.forEach((party, partyIndex) => {
                    const partyNumber = String(partyIndex + 1).padStart(3, '0');
                    const role = party.role === 'C/A' ? 'CA' : (party.role === 'C' ? 'C' : 'A');
                    const society = societies[party.name] || '';

                    if (party.role === 'P') {
                        cwrContent += `PUB${workNumber}${padField(party.name, 60)}${padField(party.ipi, 11)}${padField(society, 3)}\n`;
                    } else {
                        cwrContent += `SWR${workNumber}${padField(party.name, 60)}${padField(party.ipi, 11)}${padField(role, 2)}${padField(society, 3)}\n`;
                    }
                    recordCount++;

                    const share = String(party.share).padStart(5, '0').replace('.', '');
                    cwrContent += `SPT${workNumber}${partyNumber}${padField(share, 5)} \n`;
                    recordCount++;

                    const territory = row['TERRITORIAL RIGHTS (Details on the geographical areas where the rights apply. Eg World, UK, Europe)'] || 'World';
                    const territoryCode = territory === 'World' ? '001' : territory;
                    cwrContent += `TER${workNumber}${partyNumber}${padField(territoryCode, 3)}\n`;
                    recordCount++;
                });
            });

            cwrContent += `TRL${String(recordCount + 1).padStart(9, '0')}\n`;

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