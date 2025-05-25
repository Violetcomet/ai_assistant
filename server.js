const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Client } = require('@notionhq/client');
require('dotenv').config();

const app = express();
// Render sets the PORT environment variable. Use 10000 as a fallback for local testing.
const port = process.env.PORT || 10000;

// Middleware setup
app.use(cors()); // Enables Cross-Origin Resource Sharing
app.use(express.json()); // Parses incoming JSON request bodies

// Debugging for environment variables
console.log(`DEBUG: NOTION_API_KEY loaded: ${process.env.NOTION_API_KEY ? 'Yes' : 'No'} (starts with ${process.env.NOTION_API_KEY ? process.env.NOTION_API_KEY.substring(0, 10) + '...' : 'N/A'})`);
console.log(`DEBUG: GEMINI_API_KEY loaded: ${process.env.GEMINI_API_KEY ? 'Yes' : 'No'} (starts with ${process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) + '...' : 'N/A'})`);

// Initialize Notion Client
let notion;
if (process.env.NOTION_API_KEY) {
    notion = new Client({ auth: process.env.NOTION_API_KEY });
} else {
    console.error('NOTION_API_KEY is not set. Notion client will not be initialized.');
    // Consider throwing an error or handling this case gracefully,
    // e.g., by disabling Notion-related features.
}

// Initialize Gemini API
let model;
if (process.env.GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-1.0-pro" });
} else {
    console.error('GEMINI_API_KEY is not set. Gemini model will not be initialized.');
    // Consider throwing an error or handling this case gracefully.
}

/**
 * Fetches content from a Notion page.
 * @param {string} pageId - The ID of the Notion page.
 * @returns {Promise<string>} - A promise that resolves to the page content as a string.
 */
async function fetchNotionPageContent(pageId) {
    if (!notion) {
        throw new Error("Notion client is not initialized. Check NOTION_API_KEY.");
    }
    try {
        const blocks = [];
        let cursor;
        do {
            const { results, next_cursor } = await notion.blocks.children.list({
                block_id: pageId,
                start_cursor: cursor,
                page_size: 100,
            });
            blocks.push(...results);
            cursor = next_cursor;
        } while (cursor);

        let content = '';
        blocks.forEach(block => {
            if (block.type === 'paragraph' && block.paragraph.rich_text) {
                block.paragraph.rich_text.forEach(text => {
                    if (text.plain_text) {
                        content += text.plain_text + '\n';
                    }
                });
            } else if (block.type === 'heading_1' && block.heading_1.rich_text) {
                block.heading_1.rich_text.forEach(text => content += text.plain_text + '\n');
            } else if (block.type === 'heading_2' && block.heading_2.rich_text) {
                block.heading_2.rich_text.forEach(text => content += text.plain_text + '\n');
            } else if (block.type === 'heading_3' && block.heading_3.rich_text) {
                block.heading_3.rich_text.forEach(text => content += text.plain_text + '\n');
            }
            // Add more block types as needed (e.g., to_do, bulleted_list_item, numbered_list_item)
        });
        return content;
    } catch (error) {
        console.error('Error fetching Notion page content:', error);
        throw new Error(`Failed to fetch content from Notion page: ${error.message}`);
    }
}

/**
 * Appends content as a paragraph block to a Notion page.
 * @param {string} pageId - The ID of the Notion page.
 * @param {string} content - The content to append.
 */
async function appendContentToNotion(pageId, content) {
    if (!notion) {
        throw new Error("Notion client is not initialized. Check NOTION_API_KEY.");
    }
    try {
        await notion.blocks.children.append({
            block_id: pageId,
            children: [
                {
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                        rich_text: [
                            {
                                type: 'text',
                                text: {
                                    content: content,
                                },
                            },
                        ],
                    },
                },
            ],
        });
        console.log('Content successfully appended to Notion page.');
    } catch (error) {
        console.error('Error appending content to Notion page:', error);
        throw new Error(`Failed to append content to Notion: ${error.message}`);
    }
}

// Main API route for processing Notion content
app.post('/process-notion-content', async (req, res) => {
    console.log('Received request. req.body is:', req.body);
    const { content, action, notionPageId } = req.body;

    if (!notionPageId) {
        return res.status(400).json({ error: "Notion Page ID is required." });
    }

    if (!model) {
        return res.status(500).json({ error: "Gemini model not initialized. Check GEMINI_API_KEY." });
    }
    if (!notion) {
        return res.status(500).json({ error: "Notion client not initialized. Check NOTION_API_KEY." });
    }

    try {
        let contentToProcess = content;

        // If content is empty, fetch from Notion page
        if (!contentToProcess || contentToProcess.trim() === '') {
            console.log(`Workspaceing content from Notion page: ${notionPageId}`);
            contentToProcess = await fetchNotionPageContent(notionPageId);
            if (!contentToProcess || contentToProcess.trim() === '') {
                console.log(`No readable content found on Notion page: ${notionPageId}`);
                return res.status(400).json({ error: "No readable content found on the specified Notion page to process." });
            }
        }

        console.log(`Received request to process content for action: "${action}"`);
        console.log(`Target Notion Page ID: ${notionPageId}`);
        console.log(`Content (first 200 chars): ${contentToProcess.substring(0, 200)}...`);


        let prompt;
        switch (action) {
            case 'summarize':
                prompt = `Summarize the following content concisely:\n\n${contentToProcess}`;
                break;
            case 'brainstorm':
                prompt = `Brainstorm ideas related to the following content:\n\n${contentToProcess}`;
                break;
            case 'action_items':
                prompt = `Extract key action items from the following content:\n\n${contentToProcess}`;
                break;
            case 'expand':
                prompt = `Expand on the following content in detail:\n\n${contentToProcess}`;
                break;
            case 'rewrite':
                prompt = `Rewrite the following content to be clearer and more engaging:\n\n${contentToProcess}`;
                break;
            default:
                return res.status(400).json({ error: 'Invalid AI action specified.' });
        }

        console.log('Sending prompt to Gemini...');
        const result = await model.generateContent(prompt);
        const geminiResponse = result.response.text();
        console.log('Gemini response received.');

        // Append Gemini's response back to the Notion page
        console.log(`Attempting to append content to Notion page: ${notionPageId}`);
        await appendContentToNotion(notionPageId, geminiResponse);

        res.json({ message: 'Content processed and appended to Notion.', geminiResponse });

    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ error: `Failed to process request: ${error.message}` });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Notion AI Backend listening at http://localhost:${port}`);
});