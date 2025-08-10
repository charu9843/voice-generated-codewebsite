const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { OpenAI } = require('openai');
const archiver = require('archiver');

require('dotenv').config();

const app = express();
const port = 3000;

// OpenAI API setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 120000
});

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'frontend')));
app.use('/preview', express.static(path.join(__dirname, 'generated-site')));


// Route 1: Understand intent from Tamil speech using GPT
app.post('/intent', async (req, res) => {
  const { tamilText } = req.body;

  if (!tamilText || tamilText.trim() === '') {
    return res.status(400).json({ success: false, error: 'Tamil text is required' });
  }

  try {
    const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: 'You are an assistant that understands Tamil and converts spoken Tamil into a clear website intent in English.' },
    { role: 'user', content: `Tamil Input: "${tamilText}". What kind of website does the user want? Respond in one short sentence.` }
  ],
});


    const intent = completion.choices[0].message.content.trim();
    console.log("📝 Tamil Text:", tamilText);
    console.log("🎯 Intent:", intent);

    res.json({ success: true, intent });

  } catch (error) {
    console.error('❌ GPT intent error:', error);
    res.status(500).json({ success: false, error: 'Failed to detect intent' });
  }
});

// Route 2: Generate website project code and save to /generated-site
app.post('/generate-code', async (req, res) => {
  const { intent } = req.body;

  if (!intent || intent.trim() === '') {
    return res.status(400).json({ success: false, error: 'Intent is required to generate code.' });
  }

  try {
    const completion = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [
    {
      role: 'system',
      content: `
You are a coding assistant that generates complete, production-ready multi-file websites based on user intent.

Always:
- Produce professional, responsive HTML using Tailwind CSS via CDN (never use PostCSS or @import).
- Include:
  - index.html with multiple sections (hero, about, products/services, contact form that posts to the backend, footer)
  - style.css for extra custom styles
  - script.js for interactivity (animations, smooth scroll, etc.)
  - server.js using Express that serves static files and contains a POST /contact route that saves submissions to contacts.txt
  - package.json with correct dependencies and a start script
- Use realistic placeholder images from Unsplash (e.g., https://source.unsplash.com/) that match the site topic.
- Fill sections with relevant sample content so the site feels complete.
- Keep filenames consistent with references in the code.
- Avoid React or build tools unless the user explicitly requests them.
- Include a fixed navbar at the top with links: Home, About, Products/Services, Contact.
- Each navbar link must be an anchor tag linking to a matching section ID on the page (e.g., href="#about").
- Add smooth scrolling for anchor navigation using CSS (scroll-behavior: smooth) or JavaScript.
- Each section on the page must have an ID attribute corresponding to the navbar links.


Format the output exactly as:
--- index.html ---
<code>
--- style.css ---
<code>
--- script.js ---
<code>
--- server.js ---
<code>
--- package.json ---
<code>
`.trim(),

      
    },
    {
      role: 'user',
      content: `Intent: ${intent}\n\nGenerate the full code as files:\n- index.html with Tailwind via CDN (not @import)\n- style.css (only if extra styles needed)\n- server.js using Express\n- package.json\n- script.js for interactivity (animations, smooth scroll, etc.)n\n Use consistent filenames and avoid errors.`,
    },
  ],
});


    const gptOutput = completion.choices[0].message.content;
    console.log("📦 GPT Code Output:\n", gptOutput);

    // Parse files from GPT output
    const files = {};
    //const regex = /---\s*(.*?)\s*---\n([\s\S]*?)(?=(---|$))/g;
    const regex = /---\s*([\w.\-]+)\s*---\s*\n([\s\S]*?)(?=(---\s*[\w.\-]+\s*---|$))/g;

let match;
while ((match = regex.exec(gptOutput)) !== null) {
  const filename = match[1].trim();
  let content = match[2].trim();

  // ✅ Clean code block formatting if present
  if (content.startsWith("```")) {
    content = content.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
  }

  files[filename] = content;
}


    // Save files to /generated-site
    const folderPath = path.join(__dirname, 'generated-site');
    await fsp.rm(folderPath, { recursive: true, force: true });
    await fsp.mkdir(folderPath);

    for (const [filename, content] of Object.entries(files)) {
      const filePath = path.join(folderPath, filename);
      await fsp.writeFile(filePath, content, 'utf-8');
    }

    res.json({ success: true, message: 'Code generated and saved', files: Object.keys(files) });

  } catch (error) {
    console.error('❌ Code generation error:',error);
    res.status(500).json({ success: false, error: 'Failed to generate project code' });
  }
});
app.get('/download', async (req, res) => {
  const folderPath = path.join(__dirname, 'generated-site');

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename=generated-site.zip');

  const archive = archiver('zip', {
    zlib: { level: 9 } // Maximum compression
  });

  archive.on('error', err => {
    console.error('❌ Archive error:', err);
    res.status(500).send({ error: 'Could not create archive' });
  });

  archive.pipe(res);
  archive.directory(folderPath, false);

  await archive.finalize();
});


  


// Start server
app.listen(port, () => {
  console.log(`🚀 Server running at: http://localhost:${port}`);
});

