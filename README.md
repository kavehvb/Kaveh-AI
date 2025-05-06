# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Environment Variables

Create a `.env` file in the root of the project and add the following environment variables:

```bash
# Required for Google AI integration (Genkit)
GOOGLE_GENAI_API_KEY=your_google_genai_api_key_here

# Required for OpenRouter integration
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

Replace the placeholder values with your actual API keys.

**Important:** Your `.env` file contains sensitive API keys. It should NOT be committed to GitHub. The `.gitignore` file in this project is configured to prevent this.

# Kaveh-AI

## Adding All Project Files to GitHub

You've already initialized a Git repository, added this `README.md`, and pushed it to GitHub. To add the rest of your project files (like the `src` folder, `package.json`, etc.) to your GitHub repository, run the following commands in your project terminal:

1.  **Stage all new and modified files:**
    This command prepares all current files in your project directory (except those listed in `.gitignore`, like `node_modules` and your `.env` file) to be committed.

    ```bash
    git add .
    ```

2.  **Commit the staged files:**
    This saves a snapshot of your project with a descriptive message.

    ```bash
    git commit -m "Add all project files"
    ```

3.  **Push your commit to GitHub:**
    This uploads your committed changes to the `main` branch on your remote GitHub repository.

    ```bash
    git push origin main
    ```

After running these commands, all your project files (except ignored ones) will be in your GitHub repository. Any future changes you make can be added by repeating these `git add .`, `git commit -m "Your message"`, and `git push origin main` steps.
