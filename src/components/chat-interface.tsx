
'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip, Mic, Bot, User, DollarSign, BarChart, BrainCircuit, ChevronDown, Settings, Key, Save, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { smartAssistantPrompting, SmartAssistantPromptingInput, SmartAssistantPromptingOutput } from '@/ai/flows/smart-assistant-prompting';
// Removed: import { fileBasedContentUnderstanding, FileBasedContentUnderstandingInput, FileBasedContentUnderstandingOutput } from '@/ai/flows/file-based-content-understanding';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input"; // Import Input component
import { Label } from "@/components/ui/label"; // Import Label component
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"


// --- Pricing Simulation ---
// These are VERY ROUGH ESTIMATES and placeholders.
// Actual costs depend heavily on the specific model (OpenRouter has varied pricing).
// These need to be replaced with a more sophisticated pricing lookup based on the selected model.
const COST_PER_INPUT_CHAR_DEFAULT = 0.000005; // Example cost for a default/cheap model
const COST_PER_OUTPUT_CHAR_DEFAULT = 0.000015; // Example cost for a default/cheap model
const COST_PER_FILE_ANALYSIS_GOOGLE = 0.01; // Example flat cost for Google AI file analysis

// --- Available Models ---
// Add more models as needed. Ensure the ID matches the expected format.
const AVAILABLE_MODELS = [
  { id: 'googleai/gemini-2.0-flash', name: 'Google Gemini 2.0 Flash', provider: 'google' },
  { id: 'openrouter/mistralai/mistral-7b-instruct', name: 'Mistral 7B Instruct (OpenRouter)', provider: 'openrouter'},
  { id: 'openrouter/google/gemini-flash-1.5', name: 'Gemini Flash 1.5 (OpenRouter)', provider: 'openrouter'},
  { id: 'openrouter/anthropic/claude-3-haiku', name: 'Claude 3 Haiku (OpenRouter)', provider: 'openrouter'},
  { id: 'openrouter/openai/gpt-4o-mini', name: 'GPT-4o Mini (OpenRouter)', provider: 'openrouter'},
  // Add other Google AI models if configured in ai-instance.ts
  // Add other OpenRouter models: https://openrouter.ai/docs#models
];

interface Message {
  id: number;
  sender: 'user' | 'ai';
  text: string;
  file?: { name: string; dataUri: string };
  cost?: number; // Add cost field to store simulated cost
  timestamp: number; // Add timestamp for analysis tab
  modelId?: string; // Track which model was used for the response
}

// Helper function to format currency
const formatCurrency = (amount: number | undefined): string => {
  if (amount === undefined || amount === null) return 'N/A';
   // Adjust precision based on magnitude
   if (amount < 0.0001 && amount > 0) return `$${amount.toExponential(2)}`;
   if (amount < 0.01 && amount > 0) return `$${amount.toFixed(6)}`;
  return `$${amount.toFixed(4)}`;
};

// Placeholder function for more accurate cost calculation based on model
const calculateCost = (modelId: string, inputLength: number, outputLength: number, hasFile: boolean): number => {
  // TODO: Implement actual cost lookup based on modelId
  console.log(`Calculating cost for model: ${modelId}, input: ${inputLength}, output: ${outputLength}, file: ${hasFile}`);

  let inputCostPerChar = COST_PER_INPUT_CHAR_DEFAULT;
  let outputCostPerChar = COST_PER_OUTPUT_CHAR_DEFAULT;
  let fileCost = 0;

  const modelInfo = AVAILABLE_MODELS.find(m => m.id === modelId);

  // Example: Assign different placeholder costs based on provider/model name substring
  if (modelId.includes('gpt-4') || modelId.includes('claude')) { // More expensive models
      inputCostPerChar = 0.000010;
      outputCostPerChar = 0.000030;
  } else if (modelId.startsWith('googleai/')) {
      inputCostPerChar = 0.000003;
      outputCostPerChar = 0.000008;
  } // Keep default for others like Mistral 7B for now


  if (hasFile && modelInfo?.provider === 'google') {
      fileCost = COST_PER_FILE_ANALYSIS_GOOGLE;
  } else if (hasFile && modelInfo?.provider === 'openrouter') {
      // OpenRouter multimodal cost varies; add a placeholder or look up specific model
      fileCost = 0.005; // Placeholder cost for file processing via OpenRouter (if supported by model)
      console.warn(`File cost calculation for OpenRouter model ${modelId} is a placeholder.`);
  }


  return (inputLength * inputCostPerChar) + (outputLength * outputCostPerChar) + fileCost;
};


// --- Settings State ---
const OPENROUTER_API_KEY_STORAGE_KEY = 'openrouter_api_key';

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDataUri, setFileDataUri] = useState<string | undefined>(undefined);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [selectedModel, setSelectedModel] = useState<typeof AVAILABLE_MODELS[0]>(AVAILABLE_MODELS[0]); // Default model
  const [openRouterApiKey, setOpenRouterApiKey] = useState<string>('');
  const [apiKeySaved, setApiKeySaved] = useState<boolean>(false); // State for save confirmation


  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const analyseScrollAreaRef = useRef<HTMLDivElement>(null);
  const settingsScrollAreaRef = useRef<HTMLDivElement>(null); // Ref for settings scroll

  // Load API key from local storage on mount
  useEffect(() => {
    const storedApiKey = localStorage.getItem(OPENROUTER_API_KEY_STORAGE_KEY);
    if (storedApiKey) {
      setOpenRouterApiKey(storedApiKey);
      console.log("Loaded OpenRouter API Key from localStorage.");
    }
  }, []);


  // Save API key to local storage
  const handleSaveApiKey = () => {
    localStorage.setItem(OPENROUTER_API_KEY_STORAGE_KEY, openRouterApiKey);
    setApiKeySaved(true); // Show confirmation
    console.log("Saved OpenRouter API Key to localStorage.");
    setTimeout(() => setApiKeySaved(false), 2000); // Hide confirmation after 2 seconds
  };

  // Scroll chat to bottom
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Basic check for potentially large files (e.g., > 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError("File size exceeds 10MB limit. Please select a smaller file.");
         if (fileInputRef.current) {
            fileInputRef.current.value = ''; // Reset file input
         }
        return;
      }

      // Check if the selected model supports file input
      // Note: This is a simplification. Actual support depends on the specific model's capabilities.
      // Currently, we assume only Google AI models *might* support files via the flows.
      if (selectedModel.provider === 'openrouter') {
         setError(`File input is not currently supported with the selected OpenRouter model (${selectedModel.name}). Please select a Google AI model or send text only.`);
         if (fileInputRef.current) {
            fileInputRef.current.value = ''; // Reset file input
         }
         return; // Prevent setting the file
      }


      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFileDataUri(reader.result as string);
        setError(null); // Clear previous errors on successful load
      };
      reader.onerror = (err) => {
        console.error("Error reading file:", err);
        setError("Failed to read the selected file.");
        setSelectedFile(null);
        setFileDataUri(undefined);
      }
      reader.readAsDataURL(file);
    }
     if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
  };

  const handleSend = useCallback(async () => {
    if (!input.trim() && !selectedFile) return;
     if (selectedFile && selectedModel.provider === 'openrouter') {
        setError(`File input is not currently supported with the selected OpenRouter model (${selectedModel.name}). Remove the file or choose a Google AI model.`);
        return;
     }

     // Check if API key is needed and present for OpenRouter models
     if (selectedModel.provider === 'openrouter' && !openRouterApiKey && !process.env.NEXT_PUBLIC_OPENROUTER_API_KEY) { // Also check env var if needed
        setError(`OpenRouter API key is required for model ${selectedModel.name}. Please set it in the Settings tab.`);
        return;
     }


    setError(null);
    const timestamp = Date.now();
    const userMessageText = input; // Store input before clearing
    const userMessageFile = selectedFile ? { name: selectedFile.name, dataUri: fileDataUri! } : undefined;

    const userMessage: Message = {
      id: timestamp,
      sender: 'user',
      text: userMessageText,
      timestamp: timestamp,
      ...(userMessageFile && { file: userMessageFile }),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Clear inputs *after* capturing their state
    setInput('');
    setSelectedFile(null);
    setFileDataUri(undefined);
    setIsSending(true);

    try {
      let response: SmartAssistantPromptingOutput;
      let calculatedCost = 0;

      // Use smartAssistantPrompting for both Google and OpenRouter
      const assistantInput: SmartAssistantPromptingInput = {
        modelId: selectedModel.id,
        prompt: userMessageText,
        ...(userMessageFile && { fileDataUri: userMessageFile.dataUri }), // Pass file URI if present
        ...(selectedModel.provider === 'openrouter' && { apiKey: openRouterApiKey }), // Pass API key if OpenRouter model
      };

      console.log("Sending to smartAssistantPrompting with input:", assistantInput);
      response = await smartAssistantPrompting(assistantInput);
      console.log("Received response from smartAssistantPrompting:", response);


      // Calculate cost after getting response length
       calculatedCost = calculateCost(
        selectedModel.id,
        userMessageText.length,
        response.response.length,
        !!userMessageFile
      );


      const aiMessage: Message = {
        id: Date.now() + 1, // Ensure unique ID
        sender: 'ai',
        text: response.response,
        cost: calculatedCost,
        timestamp: Date.now(),
        modelId: selectedModel.id, // Store the model used
      };
      setMessages((prev) => [...prev, aiMessage]);
      setTotalCost((prevTotal) => prevTotal + calculatedCost);

    } catch (err) {
      console.error("Error calling AI:", err);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      setError(`Failed to get response from AI: ${errorMessage}`);
      const errorTimestamp = Date.now();
       setMessages((prev) => [...prev, {id: errorTimestamp + 1, sender: 'ai', text: `Error: Could not process the request. ${errorMessage}`, cost: 0, timestamp: errorTimestamp, modelId: selectedModel.id}]);
    } finally {
      setIsSending(false);
    }
  }, [input, selectedFile, fileDataUri, selectedModel, openRouterApiKey]); // Add selectedModel and openRouterApiKey dependency

  const handleKeyPress = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleMicClick = () => {
    setIsRecording(!isRecording);
    setError("Voice input is not yet implemented.");
    setTimeout(() => setError(null), 3000);
  };

  const aiMessages = messages.filter(m => m.sender === 'ai');
  const getModelName = (modelId: string | undefined) => {
      if (!modelId) return 'Unknown Model';
      return AVAILABLE_MODELS.find(m => m.id === modelId)?.name || modelId;
  }


  return (
    <Card className="w-full max-w-4xl h-[80vh] flex flex-col shadow-lg rounded-lg">
      <Tabs defaultValue="chat" className="flex flex-col h-full">
        <CardHeader className="border-b flex flex-row justify-between items-center p-4 gap-4 flex-wrap">
          <CardTitle className="text-lg font-semibold text-primary whitespace-nowrap">AI Assistant</CardTitle>

             {/* Model Selector Dropdown */}
             <DropdownMenu>
                 <DropdownMenuTrigger asChild>
                   <Button variant="outline" className="w-full md:w-auto justify-between min-w-[200px]">
                     <BrainCircuit className="mr-2 h-4 w-4" />
                     <span className="truncate flex-1 text-left">{selectedModel.name}</span>
                     <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                   </Button>
                 </DropdownMenuTrigger>
                 <DropdownMenuContent align="end" className="w-[--radix-dropdown-menu-trigger-width]">
                   <DropdownMenuLabel>Select AI Model</DropdownMenuLabel>
                   <DropdownMenuSeparator />
                   {AVAILABLE_MODELS.map((model) => (
                     <DropdownMenuItem
                       key={model.id}
                       onSelect={() => setSelectedModel(model)}
                       disabled={isSending}
                     >
                       {model.name}
                     </DropdownMenuItem>
                   ))}
                 </DropdownMenuContent>
               </DropdownMenu>


           <TabsList className="grid grid-cols-3 w-full md:w-[300px] shrink-0">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="analyse">Analyse</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        </CardHeader>

        <TabsContent value="chat" className="flex-1 overflow-hidden p-0 m-0 data-[state=inactive]:hidden">
           <ScrollArea className="h-full p-4" ref={scrollAreaRef}>
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex items-start gap-3',
                    message.sender === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {message.sender === 'ai' && (
                    <Avatar className="h-8 w-8 border">
                      <AvatarFallback><Bot size={16} /></AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={cn(
                      'max-w-[75%] rounded-lg p-3 shadow-sm relative group', // Added relative and group
                      message.sender === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground'
                    )}
                  >
                    {message.file && (
                      <div className="mb-2 p-2 border rounded-md bg-muted/50 flex items-center gap-2 text-sm">
                        <Paperclip size={14} />
                        <span>{message.file.name}</span>
                      </div>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                     {/* Show cost tooltip on hover for AI messages */}
                    {message.sender === 'ai' && message.cost !== undefined && (
                       <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                               <Badge
                                variant="secondary"
                                className="absolute -bottom-2 -right-2 opacity-70 group-hover:opacity-100 transition-opacity text-xs px-1.5 py-0.5 cursor-help"
                              >
                                ~{formatCurrency(message.cost)}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" align="end">
                              <p>Model: {getModelName(message.modelId)}</p>
                              <p>Est. Cost: {formatCurrency(message.cost)}</p>
                           </TooltipContent>
                          </Tooltip>
                       </TooltipProvider>
                    )}
                  </div>
                   {message.sender === 'user' && (
                    <Avatar className="h-8 w-8 border">
                       <AvatarFallback><User size={16} /></AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
               {isSending && (
                   <div className="flex items-start gap-3 justify-start">
                      <Avatar className="h-8 w-8 border">
                        <AvatarFallback><Bot size={16} /></AvatarFallback>
                      </Avatar>
                      <div className="max-w-[75%] rounded-lg p-3 shadow-sm bg-secondary text-secondary-foreground space-y-2">
                          <Skeleton className="h-4 w-[250px]" />
                          <Skeleton className="h-4 w-[200px]" />
                      </div>
                  </div>
               )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="analyse" className="flex-1 overflow-hidden p-0 m-0 data-[state=inactive]:hidden">
          <ScrollArea className="h-full p-4" ref={analyseScrollAreaRef}>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold mb-2 text-primary">API Usage Analysis</h3>
               {aiMessages.length > 0 ? (
                 <Table>
                   <TableCaption>Estimated cost per AI response. Total estimated cost: {formatCurrency(totalCost)}</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Model Used</TableHead>
                        <TableHead>Response Snippet</TableHead>
                        <TableHead className="text-right">Est. Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {aiMessages.map((msg) => (
                        <TableRow key={msg.id}>
                          <TableCell className="text-xs">{new Date(msg.timestamp).toLocaleString()}</TableCell>
                          <TableCell className="text-xs">{getModelName(msg.modelId)}</TableCell>
                          <TableCell className="max-w-[250px] truncate text-xs">{msg.text}</TableCell>
                          <TableCell className="text-right text-xs">{formatCurrency(msg.cost)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold bg-muted/50">
                          <TableCell colSpan={3}>Total Estimated Cost</TableCell>
                          <TableCell className="text-right">{formatCurrency(totalCost)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
               ) : (
                 <div className="text-center text-muted-foreground py-8">
                   <BarChart className="mx-auto h-12 w-12 mb-2 opacity-50" />
                   <p>No AI interactions yet. Send some messages to see the cost analysis.</p>
                 </div>
               )}

            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="settings" className="flex-1 overflow-hidden p-0 m-0 data-[state=inactive]:hidden">
           <ScrollArea className="h-full p-4" ref={settingsScrollAreaRef}>
             <div className="space-y-6 max-w-md mx-auto">
               <h3 className="text-lg font-semibold mb-4 text-primary flex items-center"><Settings className="mr-2 h-5 w-5" /> Settings</h3>

               <div className="space-y-2">
                 <Label htmlFor="openrouter-api-key" className="flex items-center">
                    <Key className="mr-2 h-4 w-4" /> OpenRouter API Key
                 </Label>
                 <p className="text-sm text-muted-foreground">
                   Enter your OpenRouter API key to use models like Mistral, Claude, GPT-4o Mini, etc.
                   Get your key from <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline text-accent hover:text-accent/80">OpenRouter Keys</a>.
                   The key will be stored securely in your browser's local storage.
                 </p>
                 <div className="flex items-center gap-2">
                   <Input
                     id="openrouter-api-key"
                     type="password" // Use password type to obscure key
                     placeholder="sk-or-v1-..."
                     value={openRouterApiKey}
                     onChange={(e) => setOpenRouterApiKey(e.target.value)}
                     className="flex-1"
                   />
                   <Button onClick={handleSaveApiKey} disabled={!openRouterApiKey.trim()}>
                      {apiKeySaved ? <CheckCircle className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
                      {apiKeySaved ? 'Saved!' : 'Save Key'}
                   </Button>
                 </div>
                 {apiKeySaved && <p className="text-sm text-green-600">API Key saved successfully!</p>}
               </div>

               <Alert>
                  <AlertTitle>Security Note</AlertTitle>
                  <AlertDescription>
                    Your API key is stored only in your browser's local storage and is not sent to our servers (except when making direct calls to OpenRouter on your behalf). Be cautious about sharing your keys.
                  </AlertDescription>
               </Alert>

               {/* Placeholder for future settings */}
               {/*
               <Separator />
               <div>
                 <h4 className="text-md font-semibold mb-2">Other Settings</h4>
                 <p className="text-sm text-muted-foreground">More settings will be available here in the future.</p>
               </div>
               */}
             </div>
           </ScrollArea>
         </TabsContent>


        <CardFooter className="border-t p-4 flex-col items-start gap-2">
           {error && (
            <Alert variant="destructive" className="mb-2 w-full">
               <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex items-center gap-2 w-full">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-accent shrink-0"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach file"
              disabled={isSending || selectedModel.provider === 'openrouter'} // Disable if OpenRouter model selected
              title={selectedModel.provider === 'openrouter' ? "File attachment not supported for selected OpenRouter model" : "Attach file"}
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              // Accept common text/image/pdf types, adjust as needed
              accept=".txt,.pdf,.jpg,.jpeg,.png,.webp,.md"
              disabled={selectedModel.provider === 'openrouter'} // Also disable the input itself
            />
             <Textarea
              placeholder="Type your message or drop a file (if supported by model)..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1 resize-none min-h-[40px] max-h-[150px] text-sm"
              rows={1}
              disabled={isSending}
            />
            <Button
              variant="ghost"
              size="icon"
               className={cn(
                  "text-muted-foreground hover:text-accent shrink-0",
                  isRecording && "text-destructive hover:text-destructive/80"
                )}
              onClick={handleMicClick}
              aria-label="Use microphone"
              disabled={isSending}
            >
              <Mic className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              onClick={handleSend}
              disabled={isSending || (!input.trim() && !selectedFile) || (selectedFile && selectedModel.provider === 'openrouter') || (selectedModel.provider === 'openrouter' && !openRouterApiKey && !process.env.NEXT_PUBLIC_OPENROUTER_API_KEY)} // Disable send if OpenRouter key missing
               aria-label="Send message"
               className="bg-accent hover:bg-accent/90 text-accent-foreground shrink-0"
               title={
                 selectedFile && selectedModel.provider === 'openrouter' ? `Cannot send file with ${selectedModel.name}`
                 : (selectedModel.provider === 'openrouter' && !openRouterApiKey && !process.env.NEXT_PUBLIC_OPENROUTER_API_KEY) ? 'OpenRouter API key required (Set in Settings)'
                 : "Send message"
                }
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
           {selectedFile && (
              <div className="mt-2 text-sm text-muted-foreground flex items-center gap-2 w-full">
                <Paperclip size={14} />
                <span className="truncate max-w-[calc(100%-80px)]">{selectedFile.name}</span>
                <Button variant="ghost" size="sm" onClick={() => {setSelectedFile(null); setFileDataUri(undefined); setError(null);}} className="p-1 h-auto text-destructive hover:text-destructive/80 ml-auto">
                  Remove
                </Button>
              </div>
            )}
        </CardFooter>
      </Tabs>
    </Card>
  );
}
