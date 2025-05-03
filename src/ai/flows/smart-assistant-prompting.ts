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
const googleAIPrompt = ai.definePrompt({
  name: 'googleAISmartAssistantPrompt',
  input: {
    schema: z.object({
      // modelId is used for routing, not directly in this specific prompt template
      // modelId: z.string(),
      prompt: z.string().describe('The prompt to send to the AI model.'),
      fileDataUri: z
        .string()
        .optional()
        .describe(
          "An optional file to send to the AI model, as a data URI. Only used if the model supports multimodal input."
        ),
      // apiKey is not relevant for the Google AI prompt template itself
    }),
  },
  output: {
    schema: z.object({
      response: z.string().describe('The response from the AI model.'),
    }),
  },
  // Construct prompt based on whether fileDataUri exists
  prompt: `{{#if fileDataUri}}Analyze the provided file and answer the prompt based on it.
Prompt: {{{prompt}}}
File: {{media url=fileDataUri}}
{{else}}Answer the following prompt:
{{{prompt}}}
{{/if}}`,
});


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

    console.log(`Routing to OpenRouter model: ${input.modelId}`);
    // Prioritize API key from input, fall back to environment variable
    const apiKey = input.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OpenRouter API key is missing. Please set it in the Settings tab or configure the OPENROUTER_API_KEY environment variable.");
    }

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`, // Use the determined API key
          "Content-Type": "application/json",
          // Optional: Set HTTP Referer or X-Title for analytics
          // "HTTP-Referer": $YOUR_SITE_URL, // Replace with your site URL
          // "X-Title": $YOUR_SITE_NAME // Replace with your site name
        },
        body: JSON.stringify({
          model: input.modelId, // Use the full OpenRouter model ID
          messages: [
            { role: "user", content: input.prompt }
            // TODO: Add support for multimodal input if needed and supported by the model
          ]
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("OpenRouter API Error:", response.status, errorBody);
        throw new Error(`OpenRouter API request failed with status ${response.status}: ${errorBody}`);
      }

      const data = await response.json();

      // Extract the response content - structure might vary slightly
      const responseContent = data.choices?.[0]?.message?.content;
      if (typeof responseContent !== 'string') {
        console.error("Unexpected OpenRouter response structure:", data);
        throw new Error("Failed to parse response from OpenRouter model.");
      }

      return { response: responseContent };

    } catch (error) {
      console.error("Error calling OpenRouter API:", error);
      throw error; // Re-throw the error to be caught by the caller
    }

  } else if (input.modelId.startsWith('googleai/')) {
    // --- Handle Google AI Models via Genkit ---
    console.log(`Routing to Google AI model: ${input.modelId}`);

    // Use the specific Google AI prompt defined above
    // Pass only the relevant fields to the googleAIPrompt
    // Exclude apiKey as it's not needed for the Google prompt template
    const promptInput = {
        prompt: input.prompt,
        ...(input.fileDataUri && { fileDataUri: input.fileDataUri }),
    };


    // Call the specific model using ai.generate if needed, or rely on the prompt's default/ai instance default
    // It's often better to specify the model explicitly in ai.generate if routing is needed.
    // However, googleAIPrompt doesn't *define* a model, it relies on the ai instance default or an outer call.
    // Let's explicitly call ai.generate to ensure the correct model is used.
     try {
        const { output } = await ai.generate({
            model: input.modelId, // Specify the Google AI model
            prompt: promptInput,  // Use the simplified input for the prompt template
            output: { schema: googleAIPrompt.outputSchema }, // Ensure output schema matches
             // Pass config if needed, e.g., for temperature (though prompt templates are preferred)
            // config: { temperature: 0.7 }
        });

       if (!output) {
         throw new Error('Google AI model did not return a valid output.');
       }
        // Assuming the generate call respects the output schema which has a 'response' field
        return { response: (output as any).response };


      } catch (error) {
        console.error("Error calling Google AI model via Genkit:", error);
        throw error; // Re-throw the error
      }


  } else {
    // --- Handle Unknown/Unsupported Model IDs ---
    console.error(`Unsupported model ID format: ${input.modelId}`);
    throw new Error(`Unsupported model provider for ID: ${input.modelId}. Must start with "googleai/" or "openrouter/".`);
  }
});
