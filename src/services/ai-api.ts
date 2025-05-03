/**
 * Represents an AI model.
 */
export interface AIModel {
  /**
   * The id of the AI model.
   */
  id: string;
  /**
   * The name of the AI model.
   */
  name: string;
}

/**
 * Represents the options when calling a specific AI model.
 */
export interface AIModelOptions {
  /**
   * The maximum number of tokens to generate.
   */
  maxTokens: number;
  /**
   * The temperature to use for sampling.
   */
  temperature: number;
}

/**
 * Asynchronously retrieves a list of available AI models.
 *
 * @returns A promise that resolves to an array of AIModel objects.
 */
export async function getAIModels(): Promise<AIModel[]> {
  // TODO: Implement this by calling an API.
  return [
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT 3.5 Turbo',
    },
    {
      id: 'gpt-4',
      name: 'GPT 4',
    },
  ];
}

/**
 * Asynchronously sends a request to a specific AI model and returns the response.
 *
 * @param modelId The ID of the AI model to call.
 * @param prompt The prompt to send to the AI model.
 * @param options The options to use when calling the AI model.
 * @returns A promise that resolves to the response from the AI model.
 */
export async function callAIModel(
  modelId: string,
  prompt: string,
  options: AIModelOptions
): Promise<string> {
  // TODO: Implement this by calling an API.
  return `This is a response from model ${modelId} for prompt ${prompt} with options ${JSON.stringify(options)}`;
}
