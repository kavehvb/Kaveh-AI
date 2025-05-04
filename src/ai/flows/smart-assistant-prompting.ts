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

// Type for the thinking steps callback
export type ThinkingStepsCallback = (steps: string[]) => void;

// Wrapper function now directly contains the logic, accepting the optional callback
export async function smartAssistantPrompting(
  input: SmartAssistantPromptingInput,
  thinkingStepsCallback?: ThinkingStepsCallback // Optional callback
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
        thinkingStepsCallback?.(["Preparing request for OpenRouter..."]); // Report initial step

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
            // Add stream: true if you want to handle streaming responses for thinking steps
            // stream: true, // Example: Enable streaming if needed
            // Add other parameters like temperature, max_tokens if desired
            })
        });

        thinkingStepsCallback?.(["Request sent, awaiting response..."]); // Report next step

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
       thinkingStepsCallback?.(["Received response, processing..."]);
       const data = await response.json();
       console.log("OpenRouter Raw Success Response:", data);

       const responseContent = data.choices?.[0]?.message?.content;

       if (typeof responseContent !== 'string') {
         console.error("Unexpected OpenRouter response structure or missing content:", data);
         throw new Error("Failed to parse response content from OpenRouter model. The response structure might be unexpected.");
       }

       thinkingStepsCallback?.(["Response processed."]); // Final step before returning
       return { response: responseContent };

     // --- TODO: Implement Streaming Response Handling for OpenRouter if needed ---
     /*
     if (response.body) {
         // ... streaming logic ...
         // Call thinkingStepsCallback inside the stream processing loop
     } else {
         throw new Error("Response body is null");
     }
     */

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

        thinkingStepsCallback?.(["Preparing request for Google AI..."]);

        // Use ai.generateStream for potential thinking steps (tool use)
        const { stream, responsePromise } = ai.generateStream({
            model: googleAiModelId,
            prompt: promptParts,
            // No output schema here, we process the stream manually
            // output: { schema: SmartAssistantPromptingOutputSchema },
        });

        thinkingStepsCallback?.(["Request sent, awaiting stream..."]);

        let finalResponseText = "";
        let thinkingSteps: string[] = ["Processing stream..."]; // Initial thinking step

        for await (const chunk of stream) {
             if (chunk.text) { // Check if text content exists in the chunk
                finalResponseText += chunk.text; // Accumulate text content
            }
            // Check for tool calls/requests as thinking steps
             if (chunk.isToolRequest) {
                 const toolName = chunk.toolRequest?.name;
                 if (toolName) {
                     thinkingSteps.push(`Using tool: ${toolName}`);
                     thinkingStepsCallback?.([...thinkingSteps]); // Update UI with new step
                 }
             }
             // Check for tool call responses as thinking steps
             if (chunk.isToolResponse) {
                  const toolName = chunk.toolResponse?.ref; // Or access name differently if needed
                  if (toolName) {
                     thinkingSteps.push(`Received response from tool: ${toolName}`);
                      thinkingStepsCallback?.([...thinkingSteps]); // Update UI
                 }
             }
             // Add other chunk types to check if needed (e.g., specific metadata)
        }

        // Wait for the final response object to ensure completion, though we constructed the text from the stream
        const finalResponseObject = await responsePromise;
        thinkingStepsCallback?.(["Stream finished, processing final response."]);

        // We use the text accumulated from the stream, but log the final object for debugging
        console.log("Genkit final response object:", finalResponseObject);

        if (typeof finalResponseText !== 'string') {
         console.error("Google AI model via Genkit did not yield a valid response string from stream:", finalResponseText);
         throw new Error('Google AI model did not produce a valid response string.');
       }

        thinkingStepsCallback?.(["Response processed."]); // Final step
        return { response: finalResponseText };

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


// ---- Removed ai.defineFlow wrapper ----
/*
const smartAssistantPromptingFlow = ai.defineFlow<
  typeof SmartAssistantPromptingInputSchema,
  typeof SmartAssistantPromptingOutputSchema
>({
  name: 'smartAssistantPromptingFlow',
  inputSchema: SmartAssistantPromptingInputSchema,
  outputSchema: SmartAssistantPromptingOutputSchema,
},
async (input, flowState) => {
  // The logic previously here is now in the exported `smartAssistantPrompting` function
  // This avoids passing the callback function through Genkit's flow state,
  // which seems to cause issues with client/server context.
  // The `smartAssistantPrompting` function now directly handles the logic.
  throw new Error("Flow should not be called directly. Use the exported smartAssistantPrompting function.");

});
*/
