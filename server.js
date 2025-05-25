// Load environment variables from .env file
require('dotenv').config();

console.log('DEBUG: NOTION_API_KEY loaded:', process.env.NOTION_API_KEY ? 'Yes (starts with ' + process.env.NOTION_API_KEY.substring(0, 7) + '...)': 'No'); // ADD THIS LINE
console.log('DEBUG: GEMINI_API_KEY loaded:', process.env.GEMINI_API_KEY ? 'Yes (starts with ' + process.env.GEMINI_API_KEY.substring(0, 7) + '...)': 'No'); // ADD THIS LINE

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // Import cors

const { Client } = require('@notionhq/client'); // Import Notion client
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Import Gemini client

const app = express();
const port = process.env.PORT || 3000; // Use port from environment or default to 3000

// Middleware
app.use(bodyParser.json()); // To parse JSON request bodies
app.use(cors()); // Enable CORS for all routes (important for front-end integration later)

// --- Basic Test Endpoint ---
app.get('/', async (req, res) => {
    res.send('Notion AI Backend is running!');

// --- Core AI Processing Endpoint ---
// This is where the magic will happen!
app.post('/process-notion-content', async (req, res) => {
    // Change: 'content' is now fetched from Notion, not from the request body
    const { action, notionPageId } = req.body; // Only extract action and notionPageId

    if (!notionPageId || !action) {
        return res.status(400).json({ success: false, message: 'Notion Page ID and action are required.' });
    }

    let contentToProcess;
    try {
        // NEW: Fetch content directly from Notion
        contentToProcess = await fetchNotionPageContent(notionPageId);
        if (!contentToProcess || contentToProcess.trim() === '') {
            return res.status(400).json({ success: false, message: 'No textual content found in the Notion page to process.' });
        }
    } catch (error) {
        console.error('Error in fetching Notion content:', error);
        return res.status(500).json({ success: false, message: `Failed to fetch content from Notion: ${error.message}` });
    }

    let prompt;
    // The rest of your existing logic for 'prompt' generation remains the same,
    // but it will now use 'contentToProcess' instead of 'content'
    switch (action) {
        case 'summarize':
            prompt = `Summarize the following text:\n\n${contentToProcess}`;
            break;
        case 'brainstorm':
            prompt = `Brainstorm creative ideas/applications/related concepts based on the following: ${contentToProcess}`;
            break;
        case 'improve_writing':
            prompt = `Improve the following writing, focusing on clarity, conciseness, and impact, while retaining the original meaning:\n\n${contentToProcess}`;
            break;
        default:
            return res.status(400).json({ success: false, message: 'Invalid action specified.' });
    }
    // ... (rest of your existing code for calling Gemini and updating Notion)
    // Ensure you use 'contentToProcess' in the prompt, not 'content'
    // Example: const result = await model.generateContent(prompt);
    // And ensure 'notionPageId' is used for the append block.
});
    console.log('Received request. req.body is:', req.body);
    // We expect to receive 'content' (text or URL), 'action' (e.g., "summarize"),
    // and optionally 'notionPageId' where the output should go.
    const { content, action, notionPageId } = req.body;

    console.log(`Received request to process content for action: "${action}"`);
    console.log(`Target Notion Page ID: ${notionPageId || 'Not provided'}`);
    console.log(`Content (first 200 chars): ${content ? content.substring(0, 200) + '...' : 'No content provided.'}`);


    // --- Initialize API Clients ---
    const NOTION_API_KEY = process.env.NOTION_API_KEY;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!NOTION_API_KEY || !GEMINI_API_KEY) {
        console.error('Error: NOTION_API_KEY or GEMINI_API_KEY not set in .env file.');
        return res.status(500).json({ error: 'Server API keys are not configured properly.' });
    }

    const notion = new Client({ auth: NOTION_API_KEY });
    // Function to extract text from Notion blocks
function extractTextFromBlocks(blocks) {
    let text = '';
    blocks.forEach(block => {
        if (block.type === 'paragraph' && block.paragraph.rich_text.length > 0) {
            text += block.paragraph.rich_text.map(rt => rt.plain_text).join('') + '\n';
        }
        // Add more block types if you want to extract text from headings, etc.
        // else if (block.type === 'heading_1' && block.heading_1.rich_text.length > 0) {
        //     text += '# ' + block.heading_1.rich_text.map(rt => rt.plain_text).join('') + '\n';
        // }
        // else if (block.type === 'heading_2' && block.heading_2.rich_text.length > 0) {
        //     text += '## ' + block.heading_2.rich_text.map(rt => rt.plain_text).join('') + '\n';
        // }
        // ... and so on for other block types
    });
    return text;
}

// Function to fetch content from a Notion page
async function fetchNotionPageContent(pageId) {
    try {
        let allBlocks = [];
        let cursor = undefined; // For pagination

        do {
            const response = await notion.blocks.children.list({
                block_id: pageId,
                start_cursor: cursor,
                page_size: 100, // Fetch up to 100 blocks at a time
            });

            allBlocks = allBlocks.concat(response.results);
            cursor = response.next_cursor; // Check for more blocks

        } while (cursor); // Continue if there are more blocks

        return extractTextFromBlocks(allBlocks);

    } catch (error) {
        console.error("Error fetching Notion page content:", error);
        throw new Error(`Failed to fetch content from Notion page: ${error.message}`);
    }
}
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Or "gemini-pro" for more power

    let sourceContent = content; // This will hold the content to send to Gemini

    try {
        // --- Step 1: If content is a URL, fetch it ---
        if (content && (content.startsWith('http://') || content.startsWith('https://'))) {
            console.log(`Workspaceing content from URL: ${content}`);
            try {
                // Using a CORS proxy to fetch external web content from the backend
                // Note: allorigins.win is a public proxy, suitable for development.
                // For production, you might want to run your own proxy or use a more robust solution.
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(content)}`;
                const response = await fetch(proxyUrl);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                sourceContent = await response.text();
                console.log('Content fetched successfully from URL.');
            } catch (fetchError) {
                console.error('Error fetching URL content:', fetchError);
                return res.status(400).json({ error: `Could not fetch content from URL: ${content}.`, details: fetchError.message });
            }
        }

        if (!sourceContent || sourceContent.trim() === '') {
            return res.status(400).json({ error: 'No content provided for AI processing.' });
        }

        // --- Step 2: Prepare prompt for Gemini based on action ---
        let prompt = "";
        let generatedContent = "";
        const contentForLLM = sourceContent.substring(0, 15000); // Truncate for LLM, adjust as needed

        switch (action) {
            case 'summarize':
                prompt = `Provide a concise, high-level summary of the main points and key takeaways from the following text. Keep it to 3-5 bullet points or a short paragraph. Format using Notion-compatible markdown.
                ---
                ${contentForLLM}`;
                break;
            case 'notes':
                prompt = `Extract the most important facts, key concepts, and structured notes from the following text. Present them clearly using Notion-compatible markdown-formatted bulleted or numbered lists.
                ---
                ${contentForLLM}`;
                break;
            case 'quiz':
                prompt = `Generate one challenging multiple-choice question with 4 options (A, B, C, D) and clearly indicate the correct answer at the end (e.g., "Correct Answer: B") based on the following text. Format using Notion-compatible markdown.
                ---
                ${contentForLLM}`;
                break;
            case 'ask_question':
                // This action requires an additional question from the user
                // We'll pass it in the 'content' field for now, or refine later.
                // For a full app, you might pass `userQuestion` separately.
                prompt = `Based on the following text, answer the question: "${content}". If the answer is not in the provided content, state that. Format using Notion-compatible markdown.
                ---
                ${contentForLLM}`;
                break;
            case 'brainstorm':
                prompt = `Based on the following text, brainstorm 3-5 creative ideas, applications, or related concepts. Present them as a Notion-compatible markdown bulleted list.
                ---
                ${contentForLLM}`;
                break;
            case 'rephrase':
                prompt = `Rephrase the following text in a clear, concise, and slightly more formal tone, preserving its meaning. Format using Notion-compatible markdown.
                ---
                ${contentForLLLLM}`;
                break;
            default:
                prompt = `Analyze the following text and provide a general overview. Format using Notion-compatible markdown: ${contentForLLM}`;
        }

        console.log('Sending prompt to Gemini...');
        const result = await model.generateContent(prompt);
        const response = await result.response;
        generatedContent = response.text();
        console.log('Gemini response received.');

        // --- Step 3: Write generated content back to Notion ---
        if (notionPageId) {
            console.log(`Attempting to append content to Notion page: ${notionPageId}`);
            // Notion API can add blocks as children
            // We need to convert markdown to Notion block format.
            // This is a simplified example; a full markdown-to-blocks parser is complex.
            // For now, let's just add it as a paragraph or code block.
            const notionBlocks = [
                {
                    object: 'block',
                    type: 'paragraph', // Start with a paragraph block
                    paragraph: {
                        rich_text: [
                            {
                                text: {
                                    content: `**AI Output (${action.replace(/_/g, ' ')}):**\n\n`
                                },
                                annotations: {
                                    bold: true
                                }
                            }
                        ]
                    }
                },
                {
                    object: 'block',
                    type: 'code', // Using a code block for markdown output for simplicity
                    code: {
                        rich_text: [
                            {
                                text: {
                                    content: generatedContent
                                }
                            }
                        ],
                        language: 'markdown'
                    }
                }
            ];

            await notion.blocks.children.append({
                block_id: notionPageId, // block_id for appending means a page ID
                children: notionBlocks,
            });
            console.log('Content successfully appended to Notion page.');
            res.json({ success: true, message: 'Content processed and added to Notion!', output: generatedContent });

        } else {
            // If no page ID, just return the content
            console.log('No Notion Page ID provided. Returning AI output directly.');
            res.json({ success: true, message: 'Content processed!', output: generatedContent });
        }

    } catch (error) {
        console.error('An error occurred during processing:', error);
        res.status(500).json({ error: 'An unexpected error occurred during AI processing or Notion interaction.', details: error.message });
    }
});


// Start the server
app.listen(port, () => {
    console.log(`Notion AI Backend listening at http://localhost:${port}`);
});