'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip, Mic, Bot, User, DollarSign, BarChart, BrainCircuit, ChevronDown, Settings, Key, Save, CheckCircle, RefreshCw, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { smartAssistantPrompting, SmartAssistantPromptingInput, SmartAssistantPromptingOutput } from '@/ai/flows/smart-assistant-prompting';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn, isPersian } from '@/lib/utils'; // Import isPersian utility
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input"; // Import Input component
import { Label } from "@/components/ui/label"; // Import Label component
import { Checkbox } from "@/components/ui/checkbox"; // Import Checkbox component
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
import { useToast } from "@/hooks/use-toast"; // Import useToast


// --- Default Models ---
// Always include these Google models
const DEFAULT_GOOGLE_MODELS = [
  { id: 'googleai/gemini-2.0-flash', name: 'Google Gemini 2.0 Flash', provider: 'google' as const },
  // Add other default Google models here if needed
];

interface Message {
  id: number;
  sender: 'user' | 'ai';
  text: string;
  file?: { name: string; dataUri: string };
  cost?: number; // Add cost field to store simulated cost
  timestamp: number; // Add timestamp for analysis tab
  modelId?: string; // Track which model was used for the response
  isError?: boolean; // Flag for error messages
}

interface AIModelInfo {
    id: string;
    name: string;
    provider: 'google' | 'openrouter';
    // Add other relevant fields from OpenRouter response if needed, e.g., context_length
    context_length?: number;
}

// OpenRouter model data structure from API
interface OpenRouterApiModel {
    id: string;
    name: string;
    description: string;
    pricing: {
        prompt: string;
        completion: string;
        request: string;
        image: string;
    };
    context_length: number;
    architecture: {
        modality: string;
        tokenizer: string;
        instruct_type: string | null;
    };
    top_provider: {
        max_completion_tokens: number | null;
        is_moderated: boolean;
    };
    per_request_limits: {
        prompt_tokens: string;
        completion_tokens: string;
    } | null;
}


// --- Pricing Simulation ---
// These are VERY ROUGH ESTIMATES and placeholders.
// Actual costs depend heavily on the specific model (OpenRouter has varied pricing).
// These need to be replaced with a more sophisticated pricing lookup based on the selected model.
const COST_PER_INPUT_CHAR_DEFAULT = 0.000005; // Example cost for a default/cheap model
const COST_PER_OUTPUT_CHAR_DEFAULT = 0.000015; // Example cost for a default/cheap model
const COST_PER_FILE_ANALYSIS_GOOGLE = 0.01; // Example flat cost for Google AI file analysis

// Helper function to format currency
const formatCurrency = (amount: number | undefined): string => {
  if (amount === undefined || amount === null) return 'N/A';
   // Adjust precision based on magnitude
   if (amount < 0.0001 && amount > 0) return `$${amount.toExponential(2)}`;
   if (amount < 0.01 && amount > 0) return `$${amount.toFixed(6)}`;
  return `$${amount.toFixed(4)}`;
};

// Placeholder function for more accurate cost calculation based on model
// TODO: Enhance this to use actual pricing data if fetched from OpenRouter
const calculateCost = (modelId: string, inputLength: number, outputLength: number, hasFile: boolean): number => {
  console.log(`Calculating cost for model: ${modelId}, input: ${inputLength}, output: ${outputLength}, file: ${hasFile}`);

  let inputCostPerChar = COST_PER_INPUT_CHAR_DEFAULT;
  let outputCostPerChar = COST_PER_OUTPUT_CHAR_DEFAULT;
  let fileCost = 0;

  // Example: Assign different placeholder costs based on provider/model name substring
   if (modelId.includes('gpt-4') || modelId.includes('claude-3-opus') || modelId.includes('gemini-1.5-pro')) { // More expensive models
       inputCostPerChar = 0.000015; // ~ $15 / 1M input chars
       outputCostPerChar = 0.000045; // ~ $45 / 1M output chars
   } else if (modelId.includes('claude-3-sonnet') || modelId.includes('gpt-4o') || modelId.includes('gemini-1.5-flash')) { // Mid-tier
      inputCostPerChar = 0.000005; // ~ $5 / 1M input chars
      outputCostPerChar = 0.000015; // ~ $15 / 1M output chars
   } else if (modelId.startsWith('googleai/gemini-2.0-flash')) { // Google default cheap
      inputCostPerChar = 0.000001; // Very cheap placeholders
      outputCostPerChar = 0.000002;
  } else if (modelId.startsWith('openrouter/')) { // General OpenRouter (like Mistral, Haiku, etc.) - Default cheap
      inputCostPerChar = 0.000002; // ~ $2 / 1M input chars
      outputCostPerChar = 0.000006; // ~ $6 / 1M output chars
  }


  if (hasFile && modelId.startsWith('googleai/')) {
      fileCost = COST_PER_FILE_ANALYSIS_GOOGLE;
  } else if (hasFile && modelId.startsWith('openrouter/')) {
      // File cost for OpenRouter depends heavily on the underlying model & provider
      fileCost = 0.005; // Placeholder cost
      console.warn(`File cost calculation for OpenRouter model ${modelId} is a placeholder.`);
  }


  return (inputLength * inputCostPerChar) + (outputLength * outputCostPerChar) + fileCost;
};


// --- Settings State ---
const OPENROUTER_API_KEY_STORAGE_KEY = 'openrouter_api_key';
const SELECTED_OPENROUTER_MODELS_KEY = 'selected_openrouter_models';

export default function ChatInterface() {
  const { toast } = useToast(); // Initialize toast hook
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDataUri, setFileDataUri] = useState<string | undefined>(undefined);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [openRouterApiKey, setOpenRouterApiKey] = useState<string>('');
  const [apiKeySaved, setApiKeySaved] = useState<boolean>(false);

  // --- New State for Dynamic Models ---
  const [allOpenRouterModels, setAllOpenRouterModels] = useState<OpenRouterApiModel[]>([]); // All models fetched from OpenRouter
  const [selectedOpenRouterModelIds, setSelectedOpenRouterModelIds] = useState<Set<string>>(new Set()); // IDs of models selected by user in settings
  const [activeModels, setActiveModels] = useState<AIModelInfo[]>(DEFAULT_GOOGLE_MODELS); // Models available in the chat dropdown
  const [selectedModel, setSelectedModel] = useState<AIModelInfo>(DEFAULT_GOOGLE_MODELS[0]); // The currently selected model in chat
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);
  const [fetchModelsError, setFetchModelsError] = useState<string | null>(null);
  const [filterTerm, setFilterTerm] = useState<string>(""); // For filtering models in settings


  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const analyseScrollAreaRef = useRef<HTMLDivElement>(null);
  const settingsScrollAreaRef = useRef<HTMLDivElement>(null);

  // --- Utility Functions ---
  const getModelName = (modelId: string | undefined): string => {
      if (!modelId) return 'Unknown Model';
      // Find in activeModels first, then fallback to allOpenRouterModels (less efficient but a fallback)
      const model = activeModels.find(m => m.id === modelId) || allOpenRouterModels.find(m => m.id === modelId);
      return model?.name || modelId; // Return name or ID if not found
  }

  // --- Memoized Callback for updating Active Models list ---
  // This function calculates the list of models available in the dropdown
  const calculateActiveModels = useCallback((selectedIds: Set<string>, allFetchedModels: OpenRouterApiModel[]): AIModelInfo[] => {
      const selectedOpenRouterModels = allFetchedModels
        .filter(model => selectedIds.has(model.id))
        .map(model => ({
          id: `openrouter/${model.id}`, // Prefix with 'openrouter/' for flow routing
          name: model.name,
          provider: 'openrouter' as const,
          context_length: model.context_length,
        }));

      const newActiveModels = [...DEFAULT_GOOGLE_MODELS, ...selectedOpenRouterModels];
      console.log("Calculated active models:", newActiveModels);
      return newActiveModels;
  }, []); // No dependencies, it's a pure calculation function


    // --- Fetch OpenRouter Models ---
    const fetchOpenRouterModels = useCallback(async (apiKey: string) => {
        if (!apiKey) {
            setAllOpenRouterModels([]); // Clear existing models if key is removed/empty
            setFetchModelsError("API Key is required to fetch models.");
            // Active models will be updated via the effect below
            return;
        }
        setIsFetchingModels(true);
        setFetchModelsError(null);
        console.log("Fetching OpenRouter models...");
        try {
            const response = await fetch("https://openrouter.ai/api/v1/models", {
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                }
            });
            if (!response.ok) {
                let errorBody = await response.text();
                let errorMessage = `Failed to fetch models: ${response.status}`;
                 try {
                    const errorJson = JSON.parse(errorBody);
                    errorMessage = errorJson?.error?.message || JSON.stringify(errorJson) || errorBody;
                 } catch (e) { /* Ignore parse error, use text */ }
                throw new Error(errorMessage);
            }
            const data = await response.json();
            // OpenRouter API nests models under a 'data' key
            if (!data || !Array.isArray(data.data)) {
                 console.error("Unexpected OpenRouter models response structure:", data);
                 throw new Error("Invalid data structure received for models.");
             }
            const fetchedModels: OpenRouterApiModel[] = data.data;
            console.log(`Fetched ${fetchedModels.length} OpenRouter models.`);
            setAllOpenRouterModels(fetchedModels); // This will trigger Effect 2 below
            // No need to call setActiveModels here anymore

        } catch (error) {
            console.error("Error fetching OpenRouter models:", error);
            const message = error instanceof Error ? error.message : "An unknown error occurred";
            setFetchModelsError(`Error fetching models: ${message}. Check your API key and network connection.`);
            setAllOpenRouterModels([]); // Clear models on error
            // Active models will be cleared by Effect 2
        } finally {
            setIsFetchingModels(false);
        }
    // Only depends on the API key itself, not other state that might change frequently.
    }, []);


  // --- Effects ---

  // Effect 1: Load API key and selected models from local storage on initial mount
  useEffect(() => {
    const storedApiKey = localStorage.getItem(OPENROUTER_API_KEY_STORAGE_KEY);
    const storedSelectedModelIdsJson = localStorage.getItem(SELECTED_OPENROUTER_MODELS_KEY);
    let initialSelectedIds = new Set<string>();

    if (storedApiKey) {
      setOpenRouterApiKey(storedApiKey);
      console.log("Loaded OpenRouter API Key from localStorage.");
      fetchOpenRouterModels(storedApiKey); // Fetch models using the loaded key
    }

    if (storedSelectedModelIdsJson) {
      try {
        const parsedIds = JSON.parse(storedSelectedModelIdsJson);
        if (Array.isArray(parsedIds)) {
          initialSelectedIds = new Set<string>(parsedIds);
          setSelectedOpenRouterModelIds(initialSelectedIds); // Set the state for selected IDs
          console.log("Loaded selected OpenRouter Model IDs from localStorage:", initialSelectedIds);
        } else {
          console.warn("Invalid format for stored selected model IDs in localStorage.");
          localStorage.removeItem(SELECTED_OPENROUTER_MODELS_KEY);
        }
      } catch (e) {
        console.error("Error parsing selected model IDs from localStorage:", e);
        localStorage.removeItem(SELECTED_OPENROUTER_MODELS_KEY);
      }
    }
    // Initial calculation of active models happens in Effect 2 after state is set
  }, [fetchOpenRouterModels]); // Only run once on mount, depends on fetch function


  // Effect 2: Update `activeModels` whenever the selected IDs or the list of all fetched models changes.
  useEffect(() => {
      console.log("Effect 2: Recalculating active models due to change in selected IDs or fetched models.");
      setActiveModels(calculateActiveModels(selectedOpenRouterModelIds, allOpenRouterModels));
  }, [selectedOpenRouterModelIds, allOpenRouterModels, calculateActiveModels]);

  // Effect 3: Reset `selectedModel` to default if it's no longer in `activeModels`
  useEffect(() => {
      // Check if the current selectedModel exists in the updated activeModels list
      if (!activeModels.some(m => m.id === selectedModel.id)) {
          console.log("Effect 3: Selected model no longer active, resetting to default.");
          // Only reset if the default model itself exists (edge case: Google models failed?)
          if (activeModels.some(m => m.id === DEFAULT_GOOGLE_MODELS[0].id)) {
              setSelectedModel(DEFAULT_GOOGLE_MODELS[0]); // Reset to the first default Google model
          } else if (activeModels.length > 0) {
              setSelectedModel(activeModels[0]); // Reset to the first available model
          } else {
              // No models available at all? Handle appropriately, maybe show a message
              console.warn("No active models available to select.");
              // setSelectedModel(null); // Or some placeholder state
          }
      }
  }, [activeModels, selectedModel.id]); // Re-run when activeModels changes or selectedModel.id changes


  // Scroll chat to bottom
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  // --- Event Handlers ---

  const handleSaveApiKey = () => {
    localStorage.setItem(OPENROUTER_API_KEY_STORAGE_KEY, openRouterApiKey);
    setApiKeySaved(true);
    console.log("Saved OpenRouter API Key to localStorage.");
    toast({ title: "API Key Saved", description: "OpenRouter API key has been saved." });
    // Trigger model fetch immediately after saving a new key
     fetchOpenRouterModels(openRouterApiKey);
    setTimeout(() => setApiKeySaved(false), 2000);
  };

  const handleRefreshModels = () => {
      if (!openRouterApiKey) {
         toast({ variant: "destructive", title: "API Key Missing", description: "Please enter and save your OpenRouter API key first." });
         return;
      }
      fetchOpenRouterModels(openRouterApiKey);
   };

  const handleModelSelectionChange = (modelId: string, checked: boolean | 'indeterminate') => {
       // Ensure checked is boolean
      if (typeof checked === 'boolean') {
         setSelectedOpenRouterModelIds(prev => {
             const newSet = new Set(prev);
             // Use the ID *without* the 'openrouter/' prefix as stored in allOpenRouterModels
             if (checked) {
                 newSet.add(modelId);
             } else {
                 newSet.delete(modelId);
             }
             console.log("Updated selected model IDs (in Settings):", newSet);
             return newSet;
         });
      }
   };

   const handleSelectAllFilteredModels = () => {
     setSelectedOpenRouterModelIds(prev => {
       const newSet = new Set(prev);
       // Add the IDs *without* the 'openrouter/' prefix
       filteredModels.forEach(model => newSet.add(model.id));
        console.log("Selected all filtered models (in Settings):", newSet);
       return newSet;
     });
   };

   const handleDeselectAllFilteredModels = () => {
      setSelectedOpenRouterModelIds(prev => {
          const newSet = new Set(prev);
          // Delete the IDs *without* the 'openrouter/' prefix
          filteredModels.forEach(model => newSet.delete(model.id));
           console.log("Deselected all filtered models (in Settings):", newSet);
          return newSet;
      });
    };

  const handleImportSelectedModels = () => {
      const selectedIdsArray = Array.from(selectedOpenRouterModelIds);
      localStorage.setItem(SELECTED_OPENROUTER_MODELS_KEY, JSON.stringify(selectedIdsArray));
      // The change to selectedOpenRouterModelIds via the checkbox handlers already
      // triggers Effect 2, which updates activeModels. No need to explicitly update state here.
      console.log("Saved selected model IDs to localStorage:", selectedIdsArray);
      toast({ title: "Models Selection Saved", description: `${selectedOpenRouterModelIds.size} OpenRouter models selection saved. They are now available in the chat list.` });
   };


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError("File size exceeds 10MB limit. Please select a smaller file.");
         if (fileInputRef.current) {
            fileInputRef.current.value = '';
         }
        return;
      }

      if (selectedModel.provider === 'openrouter') {
         setError(`File input is not currently supported with the selected OpenRouter model (${selectedModel.name}). Please select a Google AI model or send text only.`);
         if (fileInputRef.current) {
            fileInputRef.current.value = '';
         }
         return;
      }

      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFileDataUri(reader.result as string);
        setError(null);
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

     if (selectedModel.provider === 'openrouter' && !openRouterApiKey && !process.env.NEXT_PUBLIC_OPENROUTER_API_KEY) {
        setError(`OpenRouter API key is required for model ${selectedModel.name}. Please set it in the Settings tab.`);
        toast({ variant: "destructive", title: "API Key Missing", description: "Set your OpenRouter API key in Settings to use this model." });
        return;
     }


    setError(null);
    const timestamp = Date.now();
    const userMessageText = input;
    const userMessageFile = selectedFile ? { name: selectedFile.name, dataUri: fileDataUri! } : undefined;

    const userMessage: Message = {
      id: timestamp,
      sender: 'user',
      text: userMessageText,
      timestamp: timestamp,
      ...(userMessageFile && { file: userMessageFile }),
    };
    setMessages((prev) => [...prev, userMessage]);

    setInput('');
    setSelectedFile(null);
    setFileDataUri(undefined);
    setIsSending(true);

    try {
      let response: SmartAssistantPromptingOutput;
      let calculatedCost = 0;

      const assistantInput: SmartAssistantPromptingInput = {
        modelId: selectedModel.id, // This will be 'googleai/...' or 'openrouter/...'
        prompt: userMessageText,
        ...(userMessageFile && { fileDataUri: userMessageFile.dataUri }),
        ...(selectedModel.provider === 'openrouter' && { apiKey: openRouterApiKey || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY }), // Pass key from state or env
      };

      console.log("Sending to smartAssistantPrompting with input:", assistantInput);
      response = await smartAssistantPrompting(assistantInput);
      console.log("Received response from smartAssistantPrompting:", response);

       calculatedCost = calculateCost(
        selectedModel.id,
        userMessageText.length,
        response.response.length,
        !!userMessageFile
      );

      const aiMessage: Message = {
        id: Date.now() + 1,
        sender: 'ai',
        text: response.response,
        cost: calculatedCost,
        timestamp: Date.now(),
        modelId: selectedModel.id,
      };
      setMessages((prev) => [...prev, aiMessage]);
      setTotalCost((prevTotal) => prevTotal + calculatedCost);

    } catch (err) {
      console.error("Error calling AI:", err);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred while processing your request.";
      setError(`Failed to get response: ${errorMessage}`);
      const errorTimestamp = Date.now();
       setMessages((prev) => [...prev, {
           id: errorTimestamp + 1,
           sender: 'ai',
           text: `Error: Could not process the request. ${errorMessage}`,
           cost: 0,
           timestamp: errorTimestamp,
           modelId: selectedModel.id,
           isError: true
        }]);
       toast({ variant: "destructive", title: "AI Error", description: errorMessage });
    } finally {
      setIsSending(false);
    }
  }, [input, selectedFile, fileDataUri, selectedModel, openRouterApiKey, toast]); // Added toast dependency

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

  // --- Memoized Values ---
  const aiMessages = messages.filter(m => m.sender === 'ai' && !m.isError);

  // Filter models based on the search term in settings
  // Filters `allOpenRouterModels` which stores models without the 'openrouter/' prefix
  const filteredModels = React.useMemo(() => {
      if (!filterTerm) {
          return allOpenRouterModels;
      }
      const lowerCaseFilter = filterTerm.toLowerCase();
      return allOpenRouterModels.filter(model =>
          model.name.toLowerCase().includes(lowerCaseFilter) ||
          model.id.toLowerCase().includes(lowerCaseFilter) // Check ID without prefix
      );
  }, [allOpenRouterModels, filterTerm]);


  return (
    <Card className="w-full max-w-4xl h-[80vh] flex flex-col shadow-lg rounded-lg">
      <Tabs defaultValue="chat" className="flex flex-col h-full">
        <CardHeader className="border-b flex flex-row justify-between items-center p-4 gap-4 flex-wrap">
          <CardTitle className="text-lg font-semibold text-primary whitespace-nowrap">AI Assistant</CardTitle>

             {/* Model Selector Dropdown - Uses `activeModels` state */}
             <DropdownMenu>
                 <DropdownMenuTrigger asChild>
                   <Button variant="outline" className="w-full md:w-auto justify-between min-w-[200px]">
                     <BrainCircuit className="mr-2 h-4 w-4" />
                     {/* Display selected model name or loading/default text */}
                      <span className="truncate flex-1 text-left">
                        {activeModels.length > 0 ? (selectedModel?.name ?? "Select Model") : "Loading Models..."}
                       </span>
                     <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                   </Button>
                 </DropdownMenuTrigger>
                 <DropdownMenuContent align="end" className="w-[--radix-dropdown-menu-trigger-width] max-h-80 overflow-y-auto">
                   <DropdownMenuLabel>Select AI Model</DropdownMenuLabel>
                   <DropdownMenuSeparator />
                    {activeModels.length > 0 ? (
                     activeModels.map((model) => (
                       <DropdownMenuItem
                         key={model.id} // Use the full ID (e.g., 'openrouter/...') as key
                         onSelect={() => setSelectedModel(model)}
                         disabled={isSending}
                         className={cn(selectedModel?.id === model.id && "bg-accent/50")} // Highlight selected
                       >
                         {model.name} {model.provider === 'openrouter' && <Badge variant="secondary" className="ml-auto text-xs">OpenRouter</Badge>}
                       </DropdownMenuItem>
                     ))
                    ) : (
                      <DropdownMenuItem disabled>
                        {isFetchingModels ? "Loading models..." : "No models available. Check Settings."}
                      </DropdownMenuItem>
                    )}
                 </DropdownMenuContent>
               </DropdownMenu>


           <TabsList className="grid grid-cols-3 w-full md:w-[300px] shrink-0">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="analyse">Analyse</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        </CardHeader>

        {/* Chat Tab */}
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
                    <Avatar className="h-8 w-8 border shrink-0">
                      <AvatarFallback><Bot size={16} /></AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={cn(
                      'max-w-[75%] rounded-lg p-3 shadow-sm relative group',
                      message.sender === 'user'
                        ? 'bg-primary text-primary-foreground ltr-text'
                        : message.isError
                          ? 'bg-destructive/10 border border-destructive/30 text-destructive ltr-text'
                          : 'bg-secondary text-secondary-foreground',
                       message.sender === 'ai' && !message.isError && (isPersian(message.text) ? 'rtl-text' : 'ltr-text')
                    )}
                  >
                    {message.file && (
                      <div className="mb-2 p-2 border rounded-md bg-muted/50 flex items-center gap-2 text-sm ltr-text">
                        <Paperclip size={14} />
                        <span>{message.file.name}</span>
                      </div>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                    {message.sender === 'ai' && !message.isError && message.cost !== undefined && (
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
                    <Avatar className="h-8 w-8 border shrink-0">
                       <AvatarFallback><User size={16} /></AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
               {isSending && (
                   <div className="flex items-start gap-3 justify-start">
                      <Avatar className="h-8 w-8 border shrink-0">
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

        {/* Analyse Tab */}
        <TabsContent value="analyse" className="flex-1 overflow-hidden p-0 m-0 data-[state=inactive]:hidden">
          <ScrollArea className="h-full p-4" ref={analyseScrollAreaRef}>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold mb-2 text-primary">API Usage Analysis</h3>
               {aiMessages.length > 0 ? (
                 <Table>
                   <TableCaption>Estimated cost per successful AI response. Total estimated cost: {formatCurrency(totalCost)}</TableCaption>
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
                   <p>No successful AI interactions yet. Send some messages to see the cost analysis.</p>
                 </div>
               )}

            </div>
          </ScrollArea>
        </TabsContent>

        {/* Settings Tab */}
         <TabsContent value="settings" className="flex-1 overflow-hidden p-0 m-0 data-[state=inactive]:hidden">
            <ScrollArea className="h-full p-6" ref={settingsScrollAreaRef}>
              <div className="space-y-8 max-w-3xl mx-auto">
                <h3 className="text-xl font-semibold mb-4 text-primary flex items-center"><Settings className="mr-2 h-5 w-5" /> Settings</h3>

                {/* API Key Section */}
                <div className="space-y-3 p-4 border rounded-lg shadow-sm">
                  <Label htmlFor="openrouter-api-key" className="flex items-center text-base font-medium">
                     <Key className="mr-2 h-4 w-4" /> OpenRouter API Key
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Enter your OpenRouter API key to fetch and use models like Mistral, Claude, GPT-4o Mini, etc.
                    Get your key from <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline text-accent hover:text-accent/80">OpenRouter Keys</a>.
                    The key is stored in your browser's local storage.
                  </p>
                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <Input
                      id="openrouter-api-key"
                      type="password"
                      placeholder="sk-or-v1-..."
                      value={openRouterApiKey}
                      onChange={(e) => setOpenRouterApiKey(e.target.value)}
                      className="flex-1"
                    />
                    <Button onClick={handleSaveApiKey} disabled={!openRouterApiKey.trim()} className="w-full sm:w-auto">
                       {apiKeySaved ? <CheckCircle className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
                       {apiKeySaved ? 'Saved!' : 'Save Key'}
                    </Button>
                  </div>
                  {apiKeySaved && <p className="text-sm text-green-600 mt-1">API Key saved successfully!</p>}
                  <Alert className="mt-3">
                     <AlertTitle>Security Note</AlertTitle>
                     <AlertDescription>
                       Your API key is stored only in your browser's local storage and is used directly for API calls to OpenRouter.
                     </AlertDescription>
                  </Alert>
                </div>

                {/* Model Selection Section */}
                <div className="space-y-4 p-4 border rounded-lg shadow-sm">
                  <div className="flex justify-between items-center gap-2 flex-wrap">
                    <h4 className="text-base font-medium flex items-center"><BrainCircuit className="mr-2 h-4 w-4" /> Manage OpenRouter Models</h4>
                    <Button onClick={handleRefreshModels} variant="outline" size="sm" disabled={isFetchingModels || !openRouterApiKey}>
                      {isFetchingModels ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      {isFetchingModels ? 'Fetching...' : 'Refresh List'}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                     Select the OpenRouter models you want to make available in the chat interface. Click 'Save Selections' below to update the list.
                   </p>

                  {fetchModelsError && (
                     <Alert variant="destructive">
                       <AlertTitle>Error Fetching Models</AlertTitle>
                       <AlertDescription>{fetchModelsError}</AlertDescription>
                     </Alert>
                   )}

                   {!openRouterApiKey && (
                       <Alert variant="default">
                          <AlertTitle>API Key Required</AlertTitle>
                          <AlertDescription>Please enter and save your OpenRouter API key above to fetch models.</AlertDescription>
                       </Alert>
                   )}

                  {openRouterApiKey && !isFetchingModels && allOpenRouterModels.length > 0 && (
                      <>
                        <div className="flex flex-col sm:flex-row gap-2">
                           <Input
                             type="search"
                             placeholder="Filter models by name or ID..."
                             value={filterTerm}
                             onChange={(e) => setFilterTerm(e.target.value)}
                             className="flex-1"
                           />
                           <div className="flex gap-2">
                             <Button onClick={handleSelectAllFilteredModels} variant="secondary" size="sm" className="flex-1 sm:flex-none">Select Filtered</Button>
                             <Button onClick={handleDeselectAllFilteredModels} variant="secondary" size="sm" className="flex-1 sm:flex-none">Deselect Filtered</Button>
                            </div>
                        </div>

                        <ScrollArea className="h-64 border rounded-md">
                          <div className="p-4 space-y-3">
                            {filteredModels.length > 0 ? (
                              filteredModels.map((model) => (
                                <div key={model.id} className="flex items-center space-x-3 bg-background p-2 rounded hover:bg-muted/50 transition-colors">
                                  <Checkbox
                                    id={`model-${model.id}`}
                                    // Check against the ID *without* prefix
                                    checked={selectedOpenRouterModelIds.has(model.id)}
                                    onCheckedChange={(checked) => handleModelSelectionChange(model.id, checked)}
                                  />
                                  <div className="grid gap-1.5 leading-none flex-1 min-w-0">
                                    <label
                                      htmlFor={`model-${model.id}`}
                                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 truncate cursor-pointer"
                                      title={model.name} // Show full name on hover
                                    >
                                      {model.name || model.id}
                                    </label>
                                    {model.context_length && (
                                        <p className="text-xs text-muted-foreground">
                                            Context: {model.context_length.toLocaleString()} tokens
                                        </p>
                                    )}
                                  </div>
                                  {/* Optional: Display pricing or other info */}
                                  {/* <Badge variant="outline" className="ml-auto text-xs">
                                      ${parseFloat(model.pricing.prompt).toFixed(4)}/${parseFloat(model.pricing.completion).toFixed(4)}
                                  </Badge> */}
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-muted-foreground text-center py-4">No models match your filter.</p>
                            )}
                          </div>
                        </ScrollArea>

                        <div className="flex justify-end pt-2">
                           <Button onClick={handleImportSelectedModels} /* Removed disabled={...} as it's just saving now */ >
                             <Save className="mr-2 h-4 w-4" /> Save {selectedOpenRouterModelIds.size} Selected Model{selectedOpenRouterModelIds.size !== 1 ? 's' : ''}
                           </Button>
                         </div>
                      </>
                    )}
                    {openRouterApiKey && !isFetchingModels && allOpenRouterModels.length === 0 && !fetchModelsError && (
                         <p className="text-sm text-muted-foreground text-center py-4">No models found or fetched yet. Click 'Refresh List'.</p>
                     )}

                </div>


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
              disabled={isSending || selectedModel.provider === 'openrouter'}
              title={selectedModel.provider === 'openrouter' ? "File attachment not supported for selected OpenRouter model" : "Attach file"}
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".txt,.pdf,.jpg,.jpeg,.png,.webp,.md"
              disabled={selectedModel.provider === 'openrouter'}
            />
             <Textarea
              placeholder="Type your message or drop a file (if supported by model)..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1 resize-none min-h-[40px] max-h-[150px] text-sm"
              rows={1}
              disabled={isSending}
              dir={isPersian(input) ? 'rtl' : 'ltr'}
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
              disabled={isSending || (!input.trim() && !selectedFile) || (selectedFile && selectedModel.provider === 'openrouter') || (selectedModel.provider === 'openrouter' && !openRouterApiKey && !process.env.NEXT_PUBLIC_OPENROUTER_API_KEY)}
               aria-label="Send message"
               className="bg-accent hover:bg-accent/90 text-accent-foreground shrink-0"
               title={
                 selectedFile && selectedModel.provider === 'openrouter' ? `Cannot send file with ${selectedModel.name}`
                 : (selectedModel.provider === 'openrouter' && !openRouterApiKey && !process.env.NEXT_PUBLIC_OPENROUTER_API_KEY) ? 'OpenRouter API key required (Set in Settings)'
                 : "Send message"
                }
            >
             {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
          </div>
           {selectedFile && (
              <div className="mt-2 text-sm text-muted-foreground flex items-center gap-2 w-full ltr-text">
                <Paperclip size={14} />
                <span className="truncate max-w-[calc(100%-80px)]">{selectedFile.name}</span>
                <Button variant="ghost" size="sm" onClick={() => {setSelectedFile(null); setFileDataUri(undefined); setError(null); if(fileInputRef.current) fileInputRef.current.value = '';}} className="p-1 h-auto text-destructive hover:text-destructive/80 ml-auto">
                  Remove
                </Button>
              </div>
            )}
        </CardFooter>
      </Tabs>
    </Card>
  );
}
