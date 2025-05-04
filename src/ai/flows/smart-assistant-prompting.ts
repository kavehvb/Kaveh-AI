
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


// Wrapper function now directly contains the logic
export async function smartAssistantPrompting(
  input: SmartAssistantPromptingInput
): Promise<SmartAssistantPromptingOutput> {
   console.log("Smart Assistant Prompting: Received input", { modelId: input.modelId, hasFile: !!input.fileDataUri, hasApiKey: !!input.apiKey });

  try {
    // Validate input using Zod schema
    try {
      SmartAssistantPromptingInputSchema.parse(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Invalid input:", error.errors);
        throw new Error(`Invalid input: ${error.errors.map(e => `${e.path.join('.')} - ${e.message}`).join(', ')}`);
      }
      // Re-throw unexpected validation errors
      console.error("Unexpected validation error:", error);
      throw new Error(`Unexpected validation error: ${String(error)}`);
    }


    if (input.modelId.startsWith('openrouter/')) {
      // --- Handle OpenRouter Models ---
       console.log("Handling OpenRouter model...");
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
        console.error("OpenRouter API key is missing.");
        throw new Error("OpenRouter API key is missing. Please set it in the Settings tab or configure the OPENROUTER_API_KEY environment variable.");
      }

      try {
          console.log(`Sending request to OpenRouter with model: ${openRouterModelId}`);
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              // Optional: Add 'HTTP-Referer' and 'X-Title' headers per OpenRouter recommendation
              // "HTTP-Referer": YOUR_SITE_URL, // Replace with actual site URL if available
              // "X-Title": YOUR_SITE_NAME, // Replace with actual site name if available
              },
              body: JSON.stringify({
              model: openRouterModelId,
              messages: [{ role: "user", content: input.prompt }],
              // Ensure non-streaming for this simple implementation
              // stream: false, // OpenRouter defaults to non-streaming if not specified
              // Consider adding 'max_tokens' or other parameters if needed
              // max_tokens: 1024,
              })
          });

        let responseBodyText = await response.text(); // Read body once as text
        console.log("OpenRouter Raw Response Status:", response.status);
        console.log("OpenRouter Raw Response Body:", responseBodyText);


        if (!response.ok) {
          let errorMessage = `OpenRouter API request failed with status ${response.status}`;
          try {
              // Try parsing as JSON, which is common for errors
              const errorJson = JSON.parse(responseBodyText);
              // Extract message using optional chaining and fallbacks
              errorMessage = errorJson?.error?.message ?? errorJson?.detail ?? JSON.stringify(errorJson) ?? responseBodyText;
          } catch (parseError) {
               errorMessage = responseBodyText || errorMessage; // Use raw text if JSON parsing fails
          }
          console.error("Detailed OpenRouter Error:", errorMessage);
          // Throw a specific error message including the model ID
          throw new Error(`OpenRouter API Error for model ${openRouterModelId}: ${response.status} - ${errorMessage}`);
        }

        // --- Handling Non-Streaming Success Response ---
         let data;
         try {
            data = JSON.parse(responseBodyText); // Parse the successful response body
            console.log("OpenRouter Parsed Success Response:", data);
         } catch (parseError) {
             console.error("Failed to parse successful OpenRouter response JSON:", parseError);
             console.error("Raw successful response body was:", responseBodyText);
             throw new Error(`Failed to parse successful response from OpenRouter model ${openRouterModelId}. Raw response: ${responseBodyText.substring(0, 100)}...`);
         }


         // Extract the response content - anticipating potential variations
         const choice = data?.choices?.[0];
         let responseContent = choice?.message?.content; // Standard location

         // Fallback: Check if the response itself is directly the content (less common but possible)
         if (typeof responseContent !== 'string' && typeof choice?.text === 'string') {
             console.warn("OpenRouter response content found in choices[0].text instead of choices[0].message.content");
             responseContent = choice.text;
         }

         // Fallback: Check if the entire response data might be the string (highly unlikely for chat completions)
         if (typeof responseContent !== 'string' && typeof data === 'string') {
            console.warn("OpenRouter response content appears to be the entire data payload string.");
            responseContent = data;
         }

         // Final check if we have a valid string
         if (typeof responseContent !== 'string') {
           console.error("Unexpected OpenRouter response structure or missing text content:", data);
           throw new Error(`Failed to extract valid text response content from OpenRouter model ${openRouterModelId}. Check the console logs for the raw response structure.`);
         }

         console.log("OpenRouter final response content:", responseContent);
         return { response: responseContent };

      } catch (error) {
          // Catch errors specifically from the fetch/processing block
          console.error(`Error during OpenRouter API call or processing for model ${openRouterModelId}:`, error);
          if (error instanceof Error) {
               // Rethrow the caught error, possibly adding more context if needed
               throw new Error(`Failed during OpenRouter interaction for model ${openRouterModelId}: ${error.message}`);
          } else {
              // Handle non-Error objects thrown
              throw new Error(`An unexpected issue occurred while communicating with OpenRouter: ${String(error)}`);
          }
      }

    } else if (input.modelId.startsWith('googleai/')) {
      // --- Handle Google AI Models via Genkit ---
      console.log(`Handling Google AI model: ${input.modelId}`);

      const promptParts: any[] = [];
      if (input.fileDataUri) {
          console.log("Adding file to Google AI prompt parts.");
          promptParts.push({ text: `Analyze the provided file and answer the prompt based on it.\nPrompt: ${input.prompt}` });
          promptParts.push({ media: { url: input.fileDataUri } });
      } else {
           console.log("Adding text-only prompt to Google AI prompt parts.");
          promptParts.push({ text: input.prompt }); // Simplified text prompt
      }

       try {
          const googleAiModelId = input.modelId;
          console.log(`Using Genkit with Google AI model: ${googleAiModelId}`);
           console.log("Prompt Parts:", JSON.stringify(promptParts, null, 2)); // Log the parts being sent

          // Call ai.generate directly for a simple response
          const genkitResponse = await ai.generate({
              model: googleAiModelId,
              prompt: promptParts,
              // No explicit tools defined here, model decides based on prompt
              // tools: []
          });

           console.log("Genkit Raw Response Object:", JSON.stringify(genkitResponse, null, 2)); // Log the full Genkit response

          const responseText = genkitResponse.text; // Access text directly in Genkit v1.x

          if (typeof responseText !== 'string') {
              console.error("Google AI model via Genkit did not yield a valid response string:", genkitResponse);
              throw new Error('Google AI model did not produce a valid response string.');
          }

          console.log("Google AI final response text:", responseText);
          return { response: responseText };

        } catch (error) {
           // Catch errors specifically from the Genkit block
           console.error(`Error calling Google AI model ${input.modelId} via Genkit:`, error);
           if (error instanceof Error) {
               // Rethrow the caught error, possibly adding more context
               throw new Error(`Failed during Google AI interaction for model ${input.modelId}: ${error.message}`);
          } else {
              // Handle non-Error objects thrown
              throw new Error(`An unexpected issue occurred while communicating with Google AI via Genkit: ${String(error)}`);
          }
        }

    } else {
      // --- Handle Unknown/Unsupported Model IDs ---
      console.error(`Unsupported model ID format: ${input.modelId}`);
      throw new Error(`Unsupported model provider for ID: ${input.modelId}. Must start with "googleai/" or "openrouter/".`);
    }
  } catch (error) {
     // Top-level catch for any unexpected errors during the flow execution
     console.error("!!! Unhandled Exception in smartAssistantPrompting flow:", error);
     if (error instanceof Error) {
        // Re-throw the original error or a new one with context
        throw new Error(`Server-side error in smart assistant: ${error.message}`);
     } else {
        // Handle non-Error objects thrown
        throw new Error(`An unknown server-side error occurred in smart assistant: ${String(error)}`);
     }
  }
}
