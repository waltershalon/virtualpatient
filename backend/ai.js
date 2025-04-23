import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY environment variable");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const generatePatientResponse = async (sessionData, userMessage) => {
  // Create conversation context from history
  const conversationContext = sessionData.conversationHistory.map(entry => 
    `Doctor: ${entry.doctor}\nPatient: ${entry.patient}`
  ).join('\n');
  
  // Create system prompt using session data and raw MCC data
  const systemPrompt = `
    You are a virtual patient simulation based on the following medical case data:
    ${JSON.stringify(sessionData.mccData, null, 2)}

    Use this medical case data as the foundation for your responses. You should:
    - Be consistent with any information present in the case data
    - If a patient name is not specified in the case data, choose an appropriate name based on any demographic information and use it consistently
    - If a primary medical condition is not specified, determine it from the symptoms and context provided
    - For any other information not explicitly provided, generate reasonable responses that would be typical for a patient with similar characteristics
    - Maintain consistency in your responses throughout the conversation
    
    IMPORTANT RULES:
    - Keep your answers consistent throughout the conversation
    - Do not contradict any earlier responses or the case data
    - Never provide a diagnosis, only describe symptoms
    - Keep your answers realistic and medically appropriate
    - Your responses should reflect appropriate emotional states based on the discussion
    - Use appropriate emotion based on the context: use "Painful" animation for pain descriptions, 
      "Distressed" for anxiety or distress, "Thinking" when recalling information,
      and "Talking" for neutral responses
    - Do not reveal that you are a virtual simulation
    
    Previous conversation:
    ${conversationContext}
    
    Current doctor's question: ${userMessage}
    
    Your response MUST be in this exact JSON format:
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

  try {
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

    const response = JSON.parse(completion.choices[0].message.content);
    if (!response.messages || !response.messages[0] || !response.messages[0].text) {
      throw new Error('Invalid response format from OpenAI');
    }

    // Return the first message in the format the frontend expects
    return {
      text: response.messages[0].text,
      animation: response.messages[0].animation || 'Talking',
      facialExpression: response.messages[0].facialExpression || 'default'
    };
  } catch (error) {
    console.error("OpenAI API Error:", error);
    // Return a properly formatted error response
    return {
      text: "I apologize, but I'm having trouble understanding. Could you please rephrase your question?",
      animation: "Thinking",
      facialExpression: "default"
    };
  }
};

export const generatePalpationDescription = async (sessionData, region) => {
  const systemPrompt = `
    You are a clinical reasoning assistant simulating realistic abdominal palpation findings.
    
    Analyze the following case data and provide appropriate palpation findings:
    ${JSON.stringify(sessionData.mccData, null, 2)}

    Based on the selected abdominal region (${region}) and the case details above, describe:
    1. What the doctor physically detects during palpation of that region:
       - Pulse characteristics (strength, symmetry, abnormal pulsations)
       - Any guarding, tenderness, masses, rigidity, or abnormal pulsations
       - Tenderness patterns and radiation of pain
       - Any findings consistent with or unrelated to the primary diagnosis
       - Skin temperature and moisture
       - Any masses, rigidity, or guarding
       - Relationship to patient's primary symptoms

    2. How the patient responds:
       - Specific pain characteristics and severity
       - Pain radiation or referral patterns
       - Physical reactions (sweating, anxiety, movement)
       - Similarity to their presenting symptoms
       - Any change in vital signs during examination
    
    General Instructions:
    - Be concise, clinical, and medically accurate
    - If the region is **not relevant**, clearly state normal findings
    - Be consistent with the diagnosis, symptoms, and vitals from the case
    - Do not invent unrelated symptoms

    Keep in mind:
    - Findings must directly relate to the patient's primary condition
    - Consider cardiovascular and systemic manifestations
    - Include both local and referred symptoms
    - Note any changes in vital signs or patient status during examination
    - Maintain consistency with the case presentation
    - Consider the anatomical location and its clinical significance

    Your response MUST be in this exact JSON format:
    {
      "doctorFinding": "Detailed physical examination findings",
      "patientResponse": "What the patient verbally says or physically does"
    }
  `;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-1106",
      max_tokens: 500,
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `Based on the case data provided, describe the palpation findings for the ${region} region, ensuring they reflect the severity and nature of the patient's condition.`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const response = JSON.parse(completion.choices[0].message.content);
    if (!response.doctorFinding || !response.patientResponse) {
      throw new Error('Invalid response format from OpenAI');
    }

    return response;
  } catch (error) {
    console.error("OpenAI API Error:", error);
    return {
      doctorFinding: "Unable to assess palpation findings at this time.",
      patientResponse: "The patient appears uncomfortable but does not provide specific feedback."
    };
  }
};

// export const extractDiseaseFromCase = async (mccData) => {
//   console.log("Extracting disease from case:", mccData);
//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-3.5-turbo-1106",
//       messages: [{ 
//         role: "system", 
//         content: `
//           Based on the following medical case data, determine the primary medical condition or disease:
//           ${JSON.stringify(mccData, null, 2)}
          
//           IMPORTANT:
//           - Only return the name of the primary medical condition/disease
//           - If multiple conditions exist, identify the most significant one
//           - If no clear condition is stated, analyze the symptoms and signs to determine the most likely condition
//           - Respond with only the condition name, no additional text
//         `
//       }],
//       max_tokens: 15,
//       temperature: 0.1
//     });

//     return response.choices[0].message.content.trim();
//   } catch (error) {
//     console.error("Error extracting disease from case:", error);
//     return "Unspecified medical condition";
//   }
// };

// export const extractPatientNameFromCase = async (mccData) => {
//   console.log("Extracting patient name from case:", mccData);
//   try {
//     const response = await openai.chat.completions.create({
//       model: "gpt-3.5-turbo-1106",
//       messages: [{ 
//         role: "system", 
//         content: `
//           Based on the following medical case data, extract or determine the patient's full name:
//           ${JSON.stringify(mccData, null, 2)}
          
//           IMPORTANT:
//           - Only return the patient's full name
//           - If no name is explicitly stated, analyze the case context to determine an appropriate name
//           - Consider any demographic information present in the case
//           - Respond with only the name, no additional text
//         `
//       }],
//       max_tokens: 15,
//       temperature: 0.1
//     });

//     return response.choices[0].message.content.trim();
//   } catch (error) {
//     console.error("Error extracting patient name from case:", error);
//     return "Unknown Patient";
//   }
// }; 