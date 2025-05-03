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
});
export type SmartAssistantPromptingOutput = z.infer<typeof SmartAssistantPromptingOutputSchema>;

// Wrapper function remains the same
export async function smartAssistantPrompting(
  input: SmartAssistantPromptingInput
): Promise<SmartAssistantPromptingOutput> {
  return smartAssistantPromptingFlow(input);
}

// Define the Genkit prompt specifically for Google AI models that support it
// Note: This prompt is now used within ai.generate for Google models, not directly called.
const googleAIPromptTemplate = `{{#if fileDataUri}}Analyze the provided file and answer the prompt based on it.
Prompt: {{{prompt}}}
File: {{media url=fileDataUri}}
{{else}}Answer the following prompt:
{{{prompt}}}
{{/if}}`;


// Define the flow that handles routing
const smartAssistantPromptingFlow = ai.defineFlow<
  typeof SmartAssistantPromptingInputSchema,
  typeof SmartAssistantPromptingOutputSchema
>({
  name: 'smartAssistantPromptingFlow',
  inputSchema: SmartAssistantPromptingInputSchema,
  outputSchema: SmartAssistantPromptingOutputSchema,
},
async (input) => {
  if (input.modelId.startsWith('openrouter/')) {
    // --- Handle OpenRouter Models ---
    if (input.fileDataUri) {
        console.warn("File input is not currently supported for OpenRouter models in this flow.");
        // Optionally throw an error or proceed without the file
         throw new Error("File input is not supported for OpenRouter models.");
      }

    // Extract the actual model ID expected by the OpenRouter API
    // Example: "openrouter/mistralai/mistral-7b-instruct" -> "mistralai/mistral-7b-instruct"
    const openRouterModelId = input.modelId.replace(/^openrouter\//, '');
    console.log(`Routing to OpenRouter model: ${openRouterModelId} (Original Input ID: ${input.modelId})`); // Log the correct ID being sent

    // Prioritize API key from input, fall back to environment variable
    const apiKey = input.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OpenRouter API key is missing. Please set it in the Settings tab or configure the OPENROUTER_API_KEY environment variable.");
    }

    try {
      console.log(`Sending request to OpenRouter with model: ${openRouterModelId}`); // Explicit log before fetch
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`, // Use the determined API key
          "Content-Type": "application/json",
          // Optional headers recommended by OpenRouter:
          // "HTTP-Referer": $YOUR_SITE_URL, // Replace with your site URL
          // "X-Title": $YOUR_SITE_NAME // Replace with your site name
        },
        body: JSON.stringify({
          model: openRouterModelId, // *** Use the corrected OpenRouter model ID (without prefix) ***
          messages: [
            // Structure according to OpenRouter /chat/completions docs
            // TODO: Consider adding system prompts or conversation history if needed
            { role: "user", content: input.prompt }
          ]
          // Add other parameters like temperature, max_tokens if desired
          // "temperature": 0.7,
          // "max_tokens": 1024,
        })
      });

      // Check if the request was successful
      if (!response.ok) {
        // Attempt to read the error response body for more details
        let errorBody = await response.text(); // Read as text first
        let errorMessage = `OpenRouter API request failed with status ${response.status}`;
        console.error("OpenRouter API Error Status:", response.status);
        console.error("OpenRouter API Error Response Body:", errorBody);

        // Try parsing as JSON, as OpenRouter often returns JSON errors
        try {
            const errorJson = JSON.parse(errorBody);
            // Extract message from common error structures
            errorMessage = errorJson?.error?.message || errorJson?.detail || JSON.stringify(errorJson) || errorBody;
        } catch (parseError) {
            // If parsing fails, use the raw text body
            errorMessage = errorBody || errorMessage; // Fallback to status code message if body is empty
        }

        console.error("Detailed OpenRouter Error:", errorMessage);
        // Throw a more informative error including the problematic model ID
        throw new Error(`OpenRouter API Error for model ${openRouterModelId}: ${response.status} - ${errorMessage}`);
      }

      // Parse the successful JSON response
      const data = await response.json();
      console.log("OpenRouter Raw Success Response:", data);

      // Extract the response content according to OpenRouter documentation
      // It follows the OpenAI standard: choices[0].message.content
      const responseContent = data.choices?.[0]?.message?.content;

      if (typeof responseContent !== 'string') {
        console.error("Unexpected OpenRouter response structure or missing content:", data);
        throw new Error("Failed to parse response content from OpenRouter model. The response structure might be unexpected.");
      }

      // Return the valid response
      return { response: responseContent };

    } catch (error) {
        // Log the error caught during fetch or processing
        console.error("Error during OpenRouter API call or processing:", error);
        // Re-throw the error to be caught by the caller (e.g., the UI)
        // Ensure the error message is informative
        if (error instanceof Error) {
             throw error; // Re-throw the original error if it's already an Error instance
        } else {
            throw new Error(`An unexpected issue occurred while communicating with OpenRouter: ${String(error)}`);
        }
    }

  } else if (input.modelId.startsWith('googleai/')) {
    // --- Handle Google AI Models via Genkit ---
    console.log(`Routing to Google AI model: ${input.modelId}`);

    // Prepare prompt parts based on input
    const promptParts: any[] = [];
    if (input.fileDataUri) {
        promptParts.push({ text: `Analyze the provided file and answer the prompt based on it.\nPrompt: ${input.prompt}` });
        promptParts.push({ media: { url: input.fileDataUri } });
    } else {
        promptParts.push({ text: `Answer the following prompt:\n${input.prompt}` });
    }

     try {
        // Use the full Genkit model ID (e.g., googleai/gemini-...)
        const googleAiModelId = input.modelId;
        console.log(`Using Genkit with Google AI model: ${googleAiModelId}`);

        const { output } = await ai.generate({
            model: googleAiModelId,
            prompt: promptParts, // Pass the structured prompt parts
            output: { schema: SmartAssistantPromptingOutputSchema }, // Define expected output schema
            // config: { temperature: 0.7 } // Add config if needed
        });

       if (!output || typeof output.response !== 'string') {
         console.error("Google AI model via Genkit did not return a valid output or response string:", output);
         throw new Error('Google AI model did not return a valid response.');
       }
        // The output should directly match SmartAssistantPromptingOutputSchema
        return output;

      } catch (error) {
        console.error("Error calling Google AI model via Genkit:", error);
         if (error instanceof Error) {
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
});
