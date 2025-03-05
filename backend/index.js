import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { ElevenLabsClient } from "elevenlabs";
import OpenAI from "openai";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "", // Ensure this is set in .env
});

const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = "9BWtsMINqrJLrRacOk9x";

const elevenLabs = new ElevenLabsClient({
  apiKey: elevenLabsApiKey,
});

const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;

app.get("/", (req, res) => {
  res.send("Virtual Patient API is Running");
});

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  if (!userMessage) {
    return res.status(400).json({ error: "Message is required" });
  }

  if (!elevenLabsApiKey || !openai.apiKey) {
    return res.status(400).json({ error: "API keys are missing" });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-1106",
      max_tokens: 1000,
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content: `
          You are a virtual patient simulator.
          Respond with structured medical responses.
          Always return JSON with text and animation properties.
          The animations include: Talking, Idle, Thinking, Painful, and Distressed.
          `,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    // Ensure response is valid JSON
    let messages;
    try {
      messages = JSON.parse(completion.choices[0].message.content);
    } catch (error) {
      console.error("Invalid JSON response from OpenAI:", completion.choices[0].message.content);
      return res.status(500).json({ error: "Invalid AI response format" });
    }

    if (messages.messages) {
      messages = messages.messages;
    }

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];

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

    res.json({ messages });
  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`Virtual Patient listening on port ${port}`);
});
