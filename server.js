const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const pdfParse = require('pdf-parse');
const path = require('path');
const app = express();
const port = 3030;


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage: storage });

app.use(express.static('public'));
app.use(express.json());


const extractTextFromPDF = async (inputPath) => {
  const dataBuffer = await fs.promises.readFile(inputPath);
  const data = await pdfParse(dataBuffer);
  return data.text;
};


const redactPDF = async (inputPath, outputPath, password) => {
    const fullText = await extractTextFromPDF(inputPath);
  
    const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g; 
    const phoneRegex = /\b\d{10}\b/g; 
  
    
    const redactedText = fullText
      .replace(ssnRegex, '[REDACTED]')
      .replace(emailRegex, '[REDACTED]')
      .replace(phoneRegex, '[REDACTED]');
  
    
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
  
    
    page.drawText(redactedText, {
      x: 50,
      y: height - 50, 
      size: 12,
    });
  
    
    const pdfBytes = await pdfDoc.save({
      useObjectStreams: false,
      password: {
        ownerPassword: password, 
        userPassword: password,  
        permissions: {
          printing: 'highResolution', 
          modifying: false, 
        },
      },
    });
  
    await fs.promises.writeFile(outputPath, pdfBytes);
  };
  


let lastOutputPath = '';


app.post('/upload', upload.single('file'), async (req, res) => {
  const inputPath = req.file.path;
  const outputPath = path.join('uploads', `redacted-${req.file.filename}`);
  const password = req.body.password; 

  try {
    await redactPDF(inputPath, outputPath, password);
    

    lastOutputPath = outputPath;

  
    res.status(200).send('Upload successful');
  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).send('Error processing PDF');
  }
});


app.post('/rename', async (req, res) => {
  const { newFileName, newPassword } = req.body;

  if (!lastOutputPath) {
    return res.status(400).send('No file to rename');
  }

  const newOutputPath = path.join('uploads', `${newFileName}.pdf`);

  try {
    
    await fs.promises.copyFile(lastOutputPath, newOutputPath);
    await redactPDF(newOutputPath, newOutputPath, newPassword);

    fs.unlinkSync(lastOutputPath);
    lastOutputPath = ''; 

  
    res.download(newOutputPath, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
   
      fs.unlinkSync(newOutputPath);
    });
  } catch (error) {
    console.error('Error renaming file:', error);
    res.status(500).send('Error renaming PDF');
  }
});


app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
