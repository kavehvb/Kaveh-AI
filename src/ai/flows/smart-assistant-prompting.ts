'use server';

/**
 * @fileOverview A smart assistant that can route prompts to different AI models.
 *
 * - smartAssistantPrompting - A function that handles the smart assistant prompting process.
 * - SmartAssistantPromptingInput - The input type for the smartAssistantPrompting function.
 * - SmartAssistantPromptingOutput - The return type for the smartAssistantPrompting function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const SmartAssistantPromptingInputSchema = z.object({
  modelId: z.string().describe('The ID of the AI model to use.'),
  prompt: z.string().describe('The prompt to send to the AI model.'),
  fileDataUri: z
    .string()
    .optional()
    .describe(
      "An optional file to send to the AI model, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type SmartAssistantPromptingInput = z.infer<typeof SmartAssistantPromptingInputSchema>;

const SmartAssistantPromptingOutputSchema = z.object({
  response: z.string().describe('The response from the AI model.'),
});
export type SmartAssistantPromptingOutput = z.infer<typeof SmartAssistantPromptingOutputSchema>;

export async function smartAssistantPrompting(
  input: SmartAssistantPromptingInput
): Promise<SmartAssistantPromptingOutput> {
  return smartAssistantPromptingFlow(input);
}

const prompt = ai.definePrompt({
  name: 'smartAssistantPromptingPrompt',
  input: {
    schema: z.object({
      modelId: z.string().describe('The ID of the AI model to use.'),
      prompt: z.string().describe('The prompt to send to the AI model.'),
      fileDataUri: z
        .string()
        .optional()
        .describe(
          "An optional file to send to the AI model, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
        ),
    }),
  },
  output: {
    schema: z.object({
      response: z.string().describe('The response from the AI model.'),
    }),
  },
  prompt: `You are a smart assistant that can route prompts to different AI models.

You will use the following information to generate a response from the specified AI model.

Model ID: {{{modelId}}}
Prompt: {{{prompt}}}
{{#if fileDataUri}}
File: {{media url=fileDataUri}}
{{/if}}`,
});

const smartAssistantPromptingFlow = ai.defineFlow<
  typeof SmartAssistantPromptingInputSchema,
  typeof SmartAssistantPromptingOutputSchema
>({
  name: 'smartAssistantPromptingFlow',
  inputSchema: SmartAssistantPromptingInputSchema,
  outputSchema: SmartAssistantPromptingOutputSchema,
},
async input => {
  const {output} = await prompt(input);
  return output!;
});
