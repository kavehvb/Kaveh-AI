'use server';

/**
 * @fileOverview A smart assistant that can route prompts to different AI models,
 * supporting both Google AI models via Genkit and OpenRouter models via direct API calls.
 *
 * - smartAssistantPrompting - A function that handles the smart assistant prompting process.
 * - SmartAssistantPromptingInput - The input type for the smartAssistantPrompting function.
 * - SmartAssistantPromptingOutput - The return type for the smartAssistantPrompting function.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';

// Input schema updated to include optional apiKey
const SmartAssistantPromptingInputSchema = z.object({
  modelId: z.string().describe('The ID of the AI model to use (e.g., "googleai/gemini-2.0-flash" or "openrouter/mistralai/mistral-7b-instruct").'),
  prompt: z.string().describe('The prompt to send to the AI model.'),
  fileDataUri: z
    .string()
    .optional()
    .describe(
      "An optional file to send to the AI model, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'. Note: Files are currently only supported for Google AI models."
    ),
  apiKey: z.string().optional().describe('Optional API key for the provider (e.g., OpenRouter). If not provided, will try environment variables.')
});
export type SmartAssistantPromptingInput = z.infer<typeof SmartAssistantPromptingInputSchema>;

// Output schema remains the same
const SmartAssistantPromptingOutputSchema = z.object({
  response: z.string().describe('The response from the AI model.'),
  // Add stream information if needed in the future
});
export type SmartAssistantPromptingOutput = z.infer<typeof SmartAssistantPromptingOutputSchema>;

// Removed ThinkingStepsCallback type as it's a client-side concept

// Wrapper function now directly contains the logic, no longer accepts callback
export async function smartAssistantPrompting(
  input: SmartAssistantPromptingInput
): Promise<SmartAssistantPromptingOutput> {

  // Validate input using Zod schema
  try {
    SmartAssistantPromptingInputSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Invalid input:", error.errors);
      throw new Error(`Invalid input: ${error.errors.map(e => `${e.path.join('.')} - ${e.message}`).join(', ')}`);
    }
    throw error; // Re-throw unexpected errors
  }


  if (input.modelId.startsWith('openrouter/')) {
    // --- Handle OpenRouter Models ---
    if (input.fileDataUri) {
        console.warn("File input is not currently supported for OpenRouter models in this flow.");
        // Optionally throw an error or proceed without the file
         throw new Error("File input is not supported for OpenRouter models.");
      }

    // Extract the actual model ID expected by the OpenRouter API
    const openRouterModelId = input.modelId.replace(/^openrouter\//, '');
    console.log(`Routing to OpenRouter model: ${openRouterModelId} (Original Input ID: ${input.modelId})`);

    const apiKey = input.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OpenRouter API key is missing. Please set it in the Settings tab or configure the OPENROUTER_API_KEY environment variable.");
    }

    try {
        // Removed thinkingStepsCallback call
        console.log(`Sending request to OpenRouter with model: ${openRouterModelId}`);
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            // Optional: Add 'HTTP-Referer' and 'X-Title' headers
            // "HTTP-Referer": YOUR_SITE_URL,
            // "X-Title": YOUR_SITE_NAME,
            },
            body: JSON.stringify({
            model: openRouterModelId,
            messages: [{ role: "user", content: input.prompt }],
            // OpenRouter non-streaming for now
            // stream: false, // Ensure streaming is off unless handled
            })
        });

        // Removed thinkingStepsCallback call

      if (!response.ok) {
        let errorBody = await response.text();
        let errorMessage = `OpenRouter API request failed with status ${response.status}`;
        console.error("OpenRouter API Error Status:", response.status);
        console.error("OpenRouter API Error Response Body:", errorBody);
        try {
            const errorJson = JSON.parse(errorBody);
            errorMessage = errorJson?.error?.message || errorJson?.detail || JSON.stringify(errorJson) || errorBody;
        } catch (parseError) {
             errorMessage = errorBody || errorMessage;
        }
        console.error("Detailed OpenRouter Error:", errorMessage);
        throw new Error(`OpenRouter API Error for model ${openRouterModelId}: ${response.status} - ${errorMessage}`);
      }

      // --- Handling Non-Streaming Response ---
       // Removed thinkingStepsCallback call
       const data = await response.json();
       console.log("OpenRouter Raw Success Response:", data);

       const responseContent = data.choices?.[0]?.message?.content;

       if (typeof responseContent !== 'string') {
         console.error("Unexpected OpenRouter response structure or missing content:", data);
         throw new Error("Failed to parse response content from OpenRouter model. The response structure might be unexpected.");
       }

       // Removed thinkingStepsCallback call
       return { response: responseContent };

    } catch (error) {
        console.error("Error during OpenRouter API call or processing:", error);
        if (error instanceof Error) {
             throw error;
        } else {
            throw new Error(`An unexpected issue occurred while communicating with OpenRouter: ${String(error)}`);
        }
    }

  } else if (input.modelId.startsWith('googleai/')) {
    // --- Handle Google AI Models via Genkit ---
    console.log(`Routing to Google AI model: ${input.modelId}`);

    const promptParts: any[] = [];
    if (input.fileDataUri) {
        promptParts.push({ text: `Analyze the provided file and answer the prompt based on it.\nPrompt: ${input.prompt}` });
        promptParts.push({ media: { url: input.fileDataUri } });
    } else {
        promptParts.push({ text: `Answer the following prompt:\n${input.prompt}` });
    }

     try {
        const googleAiModelId = input.modelId;
        console.log(`Using Genkit with Google AI model: ${googleAiModelId}`);

        // Removed thinkingStepsCallback call

        // Call ai.generate directly for a simple response
        // If streaming is needed for Google AI to show tool use *during* generation,
        // the client needs to handle the ai.generateStream response.
        // For now, simplify to ai.generate for consistency with OpenRouter non-streaming.

        const response = await ai.generate({
            model: googleAiModelId,
            prompt: promptParts,
            // tools: [] // Add tools here if needed
        });

        // Removed thinkingStepsCallback call

        const responseText = response.text;

        if (typeof responseText !== 'string') {
            console.error("Google AI model via Genkit did not yield a valid response string:", response);
            throw new Error('Google AI model did not produce a valid response string.');
        }

        console.log("Genkit final response object:", response);
        // Removed thinkingStepsCallback call
        return { response: responseText };

      } catch (error) {
        console.error("Error calling Google AI model via Genkit:", error);
         if (error instanceof Error) {
             // Check for specific Genkit/API errors if needed
             throw error;
        } else {
            throw new Error(`An unexpected issue occurred while communicating with Google AI via Genkit: ${String(error)}`);
        }
      }

  } else {
    // --- Handle Unknown/Unsupported Model IDs ---
    console.error(`Unsupported model ID format: ${input.modelId}`);
    throw new Error(`Unsupported model provider for ID: ${input.modelId}. Must start with "googleai/" or "openrouter/".`);
  }
}

// ---- Removed problematic commented-out Genkit flow definition ----
/*

// .... (removed the entire commented block that started with "Define the Genkit flow...")

*/
