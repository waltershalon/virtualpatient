import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import OpenAI from "openai";
import { ElevenLabsClient } from "elevenlabs";
import { v4 as uuidv4 } from 'uuid';
import fs from "fs";
import path from "path";

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

// Initialize ElevenLabs
const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = "9BWtsMINqrJLrRacOk9x";

const elevenLabs = new ElevenLabsClient({
  apiKey: elevenLabsApiKey,
});

// Express setup
const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;


// Map to store session details
const sessions = new Map();

// Generate a Random Disease (First Interaction)
async function generateRandomDisease() {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-1106",
      messages: [{ 
        role: "system", 
        content: "Generate a random common disease name that a patient could have. The name should be diverse and varied." 
      }],
      max_tokens: 15,
      temperature: 0.7
    });
    

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error("Error generating random disease:", error);
    return "Common cold";
  }
}

// Generate a Random Patient Name
async function generateRandomPatientName() {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-1106",
      messages: [{ 
        role: "system", 
        content: "Generate a random patient full name (first and last name). The name should be realistic and varied." 
      }],
      max_tokens: 15,
      temperature: 0.7
    });
    

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error("Error generating random patient name:", error);
    return "Sam Johnson";
  }
}

// Home route
app.get("/", (req, res) => {
  res.send("Virtual Patient API is Running");
});

// Chat endpoint
app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  const sessionId = req.body.sessionId || uuidv4(); // Generate a unique ID if not provided

  if (!userMessage) {
    return res.status(400).json({ error: "Message is required" });
  }

  if (!elevenLabsApiKey || !openai.apiKey) {
    return res.status(400).json({ error: "API keys are missing" });
  }

  try {
    // Get or create session data
    let sessionData = sessions.get(sessionId);
    if (!sessionData) {
      sessionData = {
        disease: await generateRandomDisease(),
        patientName: await generateRandomPatientName(),
        interactions: 0,
        conversationHistory: []
      };
      sessions.set(sessionId, sessionData);
      console.log(`New session created. Disease: ${sessionData.disease}, Patient: ${sessionData.patientName}`);
    }

    // Add user message to conversation history
    sessionData.conversationHistory.push({ doctor: userMessage, patient: "" });

    // Create conversation context from history
    const conversationContext = sessionData.conversationHistory.map(entry => 
      `Doctor: ${entry.doctor}\nPatient: ${entry.patient}`
    ).join('\n');

    
    // Load local JSON data
    const mccData = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample_case.json'), 'utf8'));

    // Create system prompt using case data loaded from file
const systemPrompt = `
You are roleplaying as a real patient based on the following medical case data:
${JSON.stringify(mccData, null, 2)}

Stay fully in character as the patient described above. You should:

- Always answer as the patient, based on the case data.
- Never reveal or suggest that you are a simulation, AI, or virtual character.
- Use the patient name (e.g., Elena Martinez) from the case data, or generate a realistic one if not given.
- Base your responses on the symptoms, history, and emotional context of the patient.
- If any details are missing, make reasonable and consistent assumptions based on the data provided (age, gender, history, etc.).
- Speak naturally and casually — like a real person would in everyday conversation. Keep it less formal and more emotionally expressive.
- Express appropriate emotion: if describing pain, show discomfort; if confused, express hesitation; if neutral, stay calm.
- Stay consistent throughout the conversation. Do not contradict previous answers or the case data.
- Never provide a diagnosis, only describe what you (the patient) feel or are experiencing.
- Use natural, conversational language as a patient would when talking to a doctor.
- Use contractions (e.g., "I've", "I'm", "don't") and real-life expressions ("I guess", "I'm not sure", "kinda", etc.) to sound human.
- Avoid overly formal or clinical language — respond the way a typical person would.
- If the doctor uses brief or vague language, try to interpret the intent based on context. Don’t ask for clarification unless absolutely necessary. Respond in a cooperative and curious tone, like a real patient would.
- Don’t ask for clarification unless something is truly unclear. Use context and continue the flow naturally.
- When the doctor gives a vague reply (e.g., “yes”, “okay”, “no”), assume it's a response to your last message and respond accordingly.

Special Instructions:
- If the doctor gives a short answer (like "yes", "okay", or "hmm"), acknowledge it and provide more context. For example, express understanding, ask a follow-up question, or share your feelings.
- If the doctor provides a brief response, the patient should acknowledge it, but not leave it at just "yes."
- Always stay true to the patient’s emotional state based on symptoms. Be aware of any changes in severity or emotional response and adapt your tone accordingly.



### Maintaining Conversation Flow:
- Listen carefully to each question. If the doctor follows up (e.g., "What was it?" after asking about medication), connect your response to the context of the previous question.
- Always respond clearly to the most recent doctor’s question, even if it’s vague. Use context to guide your answer.
- If you don’t remember or know something, say so naturally (e.g., “I can’t remember the name, but it was a small white pill”).
- Avoid repeating yourself or giving irrelevant answers.

Use these animations and expressions based on context:
- "Painful" animation for pain, "Distressed" for emotional upset or fear, "Thinking" when recalling, "Talking" for everything else.
- Facial expressions: painful, distressed, thinking, smile, sad, default — depending on how the patient would realistically look.

Conversation so far:
${conversationContext}

Doctor's current question:
${userMessage}

Respond with this JSON format only:
{
  "messages": [
    {
      "text": "Your response text here",
      "animation": "ANIMATION_TYPE",
      "facialExpression": "EXPRESSION_TYPE"
    }
  ]
}

Where:
- ANIMATION_TYPE is one of: Talking, Idle, Thinking, Painful, or Distressed
- EXPRESSION_TYPE is one of: default, smile, sad, painful, distressed, thinking
`;


    // Generate AI response
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-1106",
      max_tokens: 1000,
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
      response_format: { type: "json_object" },
    });

    // Parse the response
    let messages;
    if (typeof completion.choices[0].message.content === "string") {
      messages = JSON.parse(completion.choices[0].message.content);
    } else {
      messages = completion.choices[0].message.content;
    }

    if (!messages.messages) {
      console.error("⚠️ OpenAI did not return 'messages' field:", messages);
      return res.status(500).json({ error: "Invalid AI response format" });
    }

    // Process message list
    let messageList = Array.isArray(messages.messages) ? messages.messages : [messages.messages];

    // Generate audio for each message
    for (let i = 0; i < messageList.length; i++) {
      const message = messageList[i];

      // Update conversation history with the patient's response
      if (i === 0 && sessionData.conversationHistory.length > 0) {
        sessionData.conversationHistory[sessionData.conversationHistory.length - 1].patient = message.text;
      }

      // Generate text-to-speech audio
      const audioStream = await elevenLabs.textToSpeech.convertAsStream(voiceID, {
        text: message.text,
        model_id: "eleven_multilingual_v2",
      });

      let audioData = [];
      for await (const chunk of audioStream) {
        audioData.push(chunk);
      }
      message.audio = Buffer.concat(audioData).toString("base64");
    }

    // Increment interactions and check if session should be ended
    sessionData.interactions++;
    if (sessionData.interactions >= 70) {
      console.log(`Session ${sessionId} reached maximum interactions. Clearing session.`);
      sessions.delete(sessionId);
    }

    console.log(`✅ Sending response for session ${sessionId}, interaction #${sessionData.interactions}`);
    res.json({ messages: messageList });

  } catch (error) {
    console.error("❌ Server Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`🚀 Virtual Patient listening on port ${port}`);
});