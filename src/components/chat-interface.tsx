

'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip, Mic, Bot, User, DollarSign, BarChart, BrainCircuit, ChevronDown, Settings, Key, Save, CheckCircle, RefreshCw, Loader2, Trash2, FolderPlus, Bookmark, PlusCircle, Edit2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { smartAssistantPrompting, SmartAssistantPromptingInput, SmartAssistantPromptingOutput } from '@/ai/flows/smart-assistant-prompting';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn, isPersian } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

// --- Constants ---
const DEFAULT_SESSION_NAME = "New Chat";
const MAX_SESSION_NAME_LENGTH = 50;
const SESSION_NAME_TRUNCATE_LENGTH = 30;
const MAX_SELECTABLE_OPENROUTER_MODELS = 20; // Maximum number of models user can select

// --- Local Storage Keys ---
const CHAT_SESSIONS_STORAGE_KEY = 'chat_sessions';
const ACTIVE_SESSION_ID_STORAGE_KEY = 'active_chat_session_id';
const OPENROUTER_API_KEY_STORAGE_KEY = 'openrouter_api_key';
const SELECTED_OPENROUTER_MODELS_KEY = 'selected_openrouter_models';
const CHAT_FOLDERS_STORAGE_KEY = 'chat_folders'; // Placeholder for future folder feature

// --- Default Models ---
const DEFAULT_GOOGLE_MODELS = [
  { id: 'googleai/gemini-2.0-flash', name: 'Google Gemini 2.0 Flash', provider: 'google' as const },
];

// --- Interfaces ---
interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  file?: { name: string; dataUri: string };
  cost?: number;
  timestamp: number;
  modelId?: string;
  isError?: boolean;
  thinkingSteps?: string[]; // Added for thinking steps
}

interface AIModelInfo {
    id: string;
    name: string;
    provider: 'google' | 'openrouter';
    context_length?: number;
}

interface OpenRouterApiModel {
    id: string;
    name: string;
    description: string;
    pricing: { prompt: string; completion: string; request: string; image: string; };
    context_length: number;
    architecture: { modality: string; tokenizer: string; instruct_type: string | null; };
    top_provider: { max_completion_tokens: number | null; is_moderated: boolean; };
    per_request_limits: { prompt_tokens: string; completion_tokens: string; } | null;
}

// --- Chat Session Interface ---
interface ChatSession {
  id: string;
  name: string;
  messages: Message[];
  createdAt: number;
  lastModified: number;
  totalCost: number;
  modelId?: string; // Optional: Store the *last used* or *predominant* model for the session
  folderId?: string | null; // For future folder feature
  isBookmarked?: boolean; // For bookmark feature
  tags?: string[]; // Add tags field
}

// --- Folder Interface (Placeholder) ---
interface ChatFolder {
    id: string;
    name: string;
    createdAt: number;
}


// --- Pricing Simulation ---
const COST_PER_INPUT_CHAR_DEFAULT = 0.000005;
const COST_PER_OUTPUT_CHAR_DEFAULT = 0.000015;
const COST_PER_FILE_ANALYSIS_GOOGLE = 0.01;

const formatCurrency = (amount: number | undefined | null): string => {
  if (amount === undefined || amount === null) return '$0.0000';
  if (amount === 0) return '$0.0000';
  if (amount < 0.0001 && amount > 0) return `$${amount.toExponential(2)}`;
  if (amount < 0.01 && amount > 0) return `$${amount.toFixed(6)}`;
  return `$${amount.toFixed(4)}`;
};

const calculateCost = (modelId: string, inputLength: number, outputLength: number, hasFile: boolean): number => {
  let inputCostPerChar = COST_PER_INPUT_CHAR_DEFAULT;
  let outputCostPerChar = COST_PER_OUTPUT_CHAR_DEFAULT;
  let fileCost = 0;

  if (modelId.includes('gpt-4') || modelId.includes('claude-3-opus') || modelId.includes('gemini-1.5-pro')) {
      inputCostPerChar = 0.000015; outputCostPerChar = 0.000045;
  } else if (modelId.includes('claude-3-sonnet') || modelId.includes('gpt-4o') || modelId.includes('gemini-1.5-flash')) {
      inputCostPerChar = 0.000005; outputCostPerChar = 0.000015;
  } else if (modelId.startsWith('googleai/gemini-2.0-flash')) {
      inputCostPerChar = 0.000001; outputCostPerChar = 0.000002;
  } else if (modelId.startsWith('openrouter/')) {
      inputCostPerChar = 0.000002; outputCostPerChar = 0.000006;
  }

  if (hasFile && modelId.startsWith('googleai/')) { fileCost = COST_PER_FILE_ANALYSIS_GOOGLE; }
  else if (hasFile && modelId.startsWith('openrouter/')) { fileCost = 0.005; console.warn(`File cost for ${modelId} is placeholder.`); }

  return (inputLength * inputCostPerChar) + (outputLength * outputCostPerChar) + fileCost;
};


// --- Component ---
export default function ChatInterface() {
  const { toast } = useToast();
  const [input, setInput] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDataUri, setFileDataUri] = useState<string | undefined>(undefined);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isSpeechRecognitionSupported, setIsSpeechRecognitionSupported] = useState<boolean>(false);
  const [thinkingMessageId, setThinkingMessageId] = useState<string | null>(null); // ID of the message currently showing thinking steps
  const [openRouterApiKey, setOpenRouterApiKey] = useState<string>('');
  const [apiKeySaved, setApiKeySaved] = useState<boolean>(false);
  const [allOpenRouterModels, setAllOpenRouterModels] = useState<OpenRouterApiModel[]>([]);
  const [selectedOpenRouterModelIds, setSelectedOpenRouterModelIds] = useState<Set<string>>(new Set());
  const [activeModels, setActiveModels] = useState<AIModelInfo[]>(DEFAULT_GOOGLE_MODELS);
  const [selectedModel, setSelectedModel] = useState<AIModelInfo>(DEFAULT_GOOGLE_MODELS[0]);
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);
  const [fetchModelsError, setFetchModelsError] = useState<string | null>(null);
  const [filterTerm, setFilterTerm] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("chat");

  // --- Session State ---
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState<string>("");
  // --- Folder State ---
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showMoveToFolderModal, setShowMoveToFolderModal] = useState(false);
  const [sessionToMove, setSessionToMove] = useState<string | null>(null);
  // --- Tag State ---
  const [editingTagsSessionId, setEditingTagsSessionId] = useState<string | null>(null);
  const [editingTags, setEditingTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [filterTags, setFilterTags] = useState<Set<string>>(new Set());


  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScrollAreaRef = useRef<HTMLDivElement>(null);
  const analyseScrollAreaRef = useRef<HTMLDivElement>(null);
  const settingsScrollAreaRef = useRef<HTMLDivElement>(null);
  const historyScrollAreaRef = useRef<HTMLDivElement>(null);
  const editNameInputRef = useRef<HTMLInputElement>(null);
  const newTagInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null); // Ref for SpeechRecognition instance

  // --- Derived State ---
  const activeSession = React.useMemo(() => {
      return chatSessions.find(session => session.id === activeSessionId) || null;
  }, [chatSessions, activeSessionId]);

  const messages = React.useMemo(() => {
      return activeSession?.messages ?? [];
  }, [activeSession]);

  const totalCost = React.useMemo(() => {
      return chatSessions.reduce((sum, session) => sum + (session.totalCost ?? 0), 0);
  }, [chatSessions]);

  const allAiMessages = React.useMemo(() => {
      return chatSessions.flatMap(session =>
          session.messages.filter(m => m.sender === 'ai' && !m.isError && m.id !== thinkingMessageId) // Exclude thinking messages
      );
  }, [chatSessions, thinkingMessageId]);

  // --- Utility Functions ---
  const getModelName = useCallback((modelId: string | undefined): string => {
    if (!modelId) return 'Unknown Model';
    const model = activeModels.find(m => m.id === modelId) || allOpenRouterModels.find(m => m.id === modelId.replace(/^openrouter\//, ''));
    return model?.name || modelId;
  }, [activeModels, allOpenRouterModels]);

  const generateSessionName = (firstMessageText: string): string => {
    if (!firstMessageText) return DEFAULT_SESSION_NAME;
    const name = firstMessageText.substring(0, SESSION_NAME_TRUNCATE_LENGTH);
    return name.length === SESSION_NAME_TRUNCATE_LENGTH ? `${name}...` : name;
  };

  const generateMessageId = (): string => {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  };

  // --- Local Storage Interaction ---
  const saveToLocalStorage = useCallback((key: string, data: any) => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      console.log(`Saved ${key} to localStorage.`);
    } catch (error) {
      console.error(`Error saving ${key} to localStorage:`, error);
      toast({ variant: "destructive", title: `Error Saving ${key}`, description: `Could not save ${key}.` });
    }
  }, [toast]);

  const loadFromLocalStorage = useCallback(<T>(key: string, defaultValue: T): T => {
    try {
      const storedData = localStorage.getItem(key);
      if (storedData) {
         // Handle potential non-JSON data for specific keys like API key
        if (key === OPENROUTER_API_KEY_STORAGE_KEY && !storedData.startsWith('{') && !storedData.startsWith('[')) {
             console.log(`Loaded ${key} (non-JSON) from localStorage.`);
             return storedData as T;
        }
        const parsedData = JSON.parse(storedData);
        console.log(`Loaded ${key} from localStorage.`);
        return parsedData as T;
      }
    } catch (error) {
      console.error(`Error loading ${key} from localStorage:`, error);
      if (error instanceof SyntaxError && key === OPENROUTER_API_KEY_STORAGE_KEY) {
          console.warn(`Attempting to load API key ${key} as plain text due to JSON parse error.`);
          const plainTextKey = localStorage.getItem(key);
          if (plainTextKey) return plainTextKey as T;
      } else if (error instanceof SyntaxError) {
           console.error(`Invalid JSON found for key ${key}, using default value. Data: ${localStorage.getItem(key)}`);
      }
      // Do not remove item if it's just a parse error, might be valid non-JSON like API key
      // localStorage.removeItem(key);
    }
    return defaultValue;
  }, []);


  // --- Session Management Functions ---
  const createNewSession = useCallback(() => {
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newSession: ChatSession = {
      id: newSessionId,
      name: DEFAULT_SESSION_NAME,
      messages: [],
      createdAt: Date.now(),
      lastModified: Date.now(),
      totalCost: 0,
      folderId: null,
      isBookmarked: false,
      tags: [], // Initialize tags
    };

    setChatSessions(prevSessions => {
        const updatedSessions = [newSession, ...prevSessions];
        saveToLocalStorage(CHAT_SESSIONS_STORAGE_KEY, updatedSessions);
        return updatedSessions;
    });
    setActiveSessionId(newSessionId);
    localStorage.setItem(ACTIVE_SESSION_ID_STORAGE_KEY, newSessionId);
    setInput('');
    setSelectedFile(null);
    setFileDataUri(undefined);
    setError(null);
    setThinkingMessageId(null); // Clear thinking message on new session
    setActiveTab("chat");
    console.log(`Created new session: ${newSessionId}`);
  }, [saveToLocalStorage]);

  const switchSession = useCallback((sessionId: string) => {
    if (sessionId === activeSessionId) return;
    const sessionExists = chatSessions.some(s => s.id === sessionId);
    if (sessionExists) {
      setActiveSessionId(sessionId);
      localStorage.setItem(ACTIVE_SESSION_ID_STORAGE_KEY, sessionId);
      setInput('');
      setSelectedFile(null);
      setFileDataUri(undefined);
      setError(null);
      setThinkingMessageId(null); // Clear thinking message on session switch
      setActiveTab("chat");
      console.log(`Switched to session: ${sessionId}`);
    } else {
      console.warn(`Attempted to switch to non-existent session: ${sessionId}`);
      const currentActive = localStorage.getItem(ACTIVE_SESSION_ID_STORAGE_KEY);
      if (!currentActive || !chatSessions.some(s => s.id === currentActive)) {
         createNewSession();
      }
    }
  }, [chatSessions, activeSessionId, createNewSession]);

  const deleteSession = useCallback((sessionIdToDelete: string) => {
    setChatSessions(prevSessions => {
      const updatedSessions = prevSessions.filter(session => session.id !== sessionIdToDelete);
      saveToLocalStorage(CHAT_SESSIONS_STORAGE_KEY, updatedSessions);

      if (activeSessionId === sessionIdToDelete) {
        let newActiveSessionId: string | null = null;
        if (updatedSessions.length > 0) {
          newActiveSessionId = updatedSessions[0].id;
        } else {
          setActiveSessionId(null);
          localStorage.removeItem(ACTIVE_SESSION_ID_STORAGE_KEY);
        }

        if (newActiveSessionId) {
           setActiveSessionId(newActiveSessionId);
           localStorage.setItem(ACTIVE_SESSION_ID_STORAGE_KEY, newActiveSessionId);
        } else {
            createNewSession(); // Create a new one if all are deleted
        }
      }
      return updatedSessions;
    });
    toast({ title: "Session Deleted", description: "The chat history has been removed." });
    console.log(`Deleted session: ${sessionIdToDelete}`);
  }, [activeSessionId, saveToLocalStorage, toast, createNewSession]);

  const startEditingSessionName = useCallback((sessionId: string) => {
      const session = chatSessions.find(s => s.id === sessionId);
      if (session) {
          setEditingSessionId(sessionId);
          setEditingSessionName(session.name);
          setTimeout(() => editNameInputRef.current?.focus(), 50);
      }
  }, [chatSessions]);

  const cancelEditingSessionName = useCallback(() => {
      setEditingSessionId(null);
      setEditingSessionName("");
  }, []);

  const saveEditedSessionName = useCallback((sessionId: string) => {
      const trimmedName = editingSessionName.trim();
      if (!trimmedName) {
          toast({ variant: "destructive", title: "Invalid Name", description: "Session name cannot be empty." });
          return;
      }
      if (trimmedName.length > MAX_SESSION_NAME_LENGTH) {
           toast({ variant: "destructive", title: "Name Too Long", description: `Session name cannot exceed ${MAX_SESSION_NAME_LENGTH} characters.` });
           return;
       }

      setChatSessions(prevSessions => {
          const updatedSessions = prevSessions.map(session =>
              session.id === sessionId ? { ...session, name: trimmedName, lastModified: Date.now() } : session
          );
          saveToLocalStorage(CHAT_SESSIONS_STORAGE_KEY, updatedSessions);
          return updatedSessions;
      });
      setEditingSessionId(null);
      setEditingSessionName("");
      toast({ title: "Name Updated", description: "Session name has been saved." });
  }, [editingSessionName, saveToLocalStorage, toast]);

   const toggleBookmark = useCallback((sessionId: string) => {
       setChatSessions(prevSessions => {
           const updatedSessions = prevSessions.map(session =>
               session.id === sessionId ? { ...session, isBookmarked: !session.isBookmarked, lastModified: Date.now() } : session
           );
           saveToLocalStorage(CHAT_SESSIONS_STORAGE_KEY, updatedSessions);
           return updatedSessions;
       });
       const session = chatSessions.find(s => s.id === sessionId);
       if (session) {
           toast({
               title: session.isBookmarked ? "Bookmark Removed" : "Bookmark Added",
               description: `Session "${session.name}" ${session.isBookmarked ? 'removed from' : 'added to'} bookmarks.`
           });
       }
   }, [chatSessions, saveToLocalStorage, toast]);

   // --- Folder Functions ---
   const handleCreateFolder = useCallback(() => {
        const trimmedName = newFolderName.trim();
        if (!trimmedName) {
             toast({ variant: "destructive", title: "Invalid Name", description: "Folder name cannot be empty." });
             return;
        }
        const newFolder: ChatFolder = {
           id: `folder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
           name: trimmedName,
           createdAt: Date.now(),
        };
        setFolders(prev => {
           const updated = [...prev, newFolder];
           saveToLocalStorage(CHAT_FOLDERS_STORAGE_KEY, updated);
           return updated;
        });
        toast({ title: "Folder Created", description: `Folder "${trimmedName}" created.`});
        setNewFolderName("");
        setShowCreateFolderModal(false);
   }, [newFolderName, toast, saveToLocalStorage]);

   const openMoveToFolderModal = useCallback((sessionId: string) => {
        setSessionToMove(sessionId);
        setShowMoveToFolderModal(true);
   }, []);

   const handleMoveSessionToFolder = useCallback((folderId: string | null) => {
        if (!sessionToMove) return;

        setChatSessions(prevSessions => {
            const updatedSessions = prevSessions.map(session =>
                session.id === sessionToMove ? { ...session, folderId: folderId, lastModified: Date.now() } : session
            );
            saveToLocalStorage(CHAT_SESSIONS_STORAGE_KEY, updatedSessions);
            return updatedSessions;
        });
        const session = chatSessions.find(s => s.id === sessionToMove);
        const folder = folders.find(f => f.id === folderId);
        toast({
             title: "Session Moved",
             description: `Session "${session?.name}" moved ${folderId ? `to folder "${folder?.name}"` : 'out of folder'}.`
        });
        setShowMoveToFolderModal(false);
        setSessionToMove(null);
   }, [sessionToMove, chatSessions, folders, saveToLocalStorage, toast]);

    // --- Tag Functions ---
    const startEditingTags = useCallback((sessionId: string) => {
        const session = chatSessions.find(s => s.id === sessionId);
        if (session) {
            setEditingTagsSessionId(sessionId);
            setEditingTags(session.tags || []);
            setNewTagInput("");
             // Focus input after modal renders
            setTimeout(() => newTagInputRef.current?.focus(), 50);
        }
    }, [chatSessions]);

    const cancelEditingTags = useCallback(() => {
        setEditingTagsSessionId(null);
        setEditingTags([]);
        setNewTagInput("");
    }, []);

    const handleAddTag = useCallback(() => {
        const tagToAdd = newTagInput.trim().toLowerCase();
        if (tagToAdd && !editingTags.includes(tagToAdd) && tagToAdd.length <= 20) { // Add length limit if needed
            setEditingTags(prev => [...prev, tagToAdd]);
            setNewTagInput("");
        } else if (editingTags.includes(tagToAdd)) {
            toast({ variant: "default", title: "Tag Exists", description: "This tag is already added." });
        } else if (tagToAdd.length > 20) {
             toast({ variant: "destructive", title: "Tag Too Long", description: "Tags cannot exceed 20 characters." });
        }
    }, [newTagInput, editingTags, toast]);

    const handleRemoveTag = useCallback((tagToRemove: string) => {
        setEditingTags(prev => prev.filter(tag => tag !== tagToRemove));
    }, []);

    const handleSaveTags = useCallback(() => {
        if (!editingTagsSessionId) return;
        setChatSessions(prevSessions => {
            const updatedSessions = prevSessions.map(session =>
                session.id === editingTagsSessionId ? { ...session, tags: editingTags, lastModified: Date.now() } : session
            );
            saveToLocalStorage(CHAT_SESSIONS_STORAGE_KEY, updatedSessions);
            return updatedSessions;
        });
        toast({ title: "Tags Updated", description: "Session tags have been saved." });
        cancelEditingTags(); // Close the modal/editing state
    }, [editingTagsSessionId, editingTags, saveToLocalStorage, toast, cancelEditingTags]);

    const handleTagFilterChange = useCallback((tag: string) => {
         setFilterTags(prev => {
             const newSet = new Set(prev);
             if (newSet.has(tag)) { newSet.delete(tag); }
             else { newSet.add(tag); }
             return newSet;
         });
     }, []);

    const clearTagFilters = useCallback(() => {
         setFilterTags(new Set());
     }, []);

    const allAvailableTags = React.useMemo(() => {
        const tags = new Set<string>();
        chatSessions.forEach(session => {
            (session.tags || []).forEach(tag => tags.add(tag));
        });
        return Array.from(tags).sort();
    }, [chatSessions]);



  // --- Model Fetching & Management ---
  const calculateActiveModels = useCallback((selectedIds: Set<string>, allFetchedModels: OpenRouterApiModel[]): AIModelInfo[] => {
      const selectedOpenRouterModels = allFetchedModels
        .filter(model => selectedIds.has(model.id))
        .map(model => ({
          id: `openrouter/${model.id}`,
          name: model.name,
          provider: 'openrouter' as const,
          context_length: model.context_length,
        }));
      // Limit the number of displayed models from OpenRouter
      const limitedOpenRouterModels = selectedOpenRouterModels.slice(0, MAX_SELECTABLE_OPENROUTER_MODELS);
      const newActiveModels = [...DEFAULT_GOOGLE_MODELS, ...limitedOpenRouterModels];
      return newActiveModels;
  }, []);

  const fetchOpenRouterModels = useCallback(async (apiKey: string) => {
    if (!apiKey) {
        setAllOpenRouterModels([]);
        setFetchModelsError("API Key is required to fetch models.");
        setActiveModels(DEFAULT_GOOGLE_MODELS); // Reset to default if key removed
        return;
    }
    setIsFetchingModels(true);
    setFetchModelsError(null);
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models", { headers: { "Authorization": `Bearer ${apiKey}` } });
      if (!response.ok) {
          let errorBody = await response.text();
           let errorMessage = `Failed to fetch models: ${response.status}`;
           try { const errorJson = JSON.parse(errorBody); errorMessage = errorJson?.error?.message || errorBody; } catch {}
           console.error("OpenRouter API Error:", errorMessage);
           throw new Error(errorMessage);
       }
      const data = await response.json();
      if (!data || !Array.isArray(data.data)) { throw new Error("Invalid data structure received from OpenRouter."); }
      const fetchedModels: OpenRouterApiModel[] = data.data;
      setAllOpenRouterModels(fetchedModels);
       // Re-calculate active models based on fetched models and *existing* selection
       setSelectedOpenRouterModelIds(prevSelectedIds => {
           const validSelectedIds = new Set<string>();
           fetchedModels.forEach(model => {
               if (prevSelectedIds.has(model.id)) {
                   validSelectedIds.add(model.id);
               }
           });
            // Ensure the selection doesn't exceed the limit after refresh
           const limitedValidSelectedIds = new Set(Array.from(validSelectedIds).slice(0, MAX_SELECTABLE_OPENROUTER_MODELS));
           if (limitedValidSelectedIds.size < validSelectedIds.size) {
                toast({ title: "Model Limit Reached", description: `Selection trimmed to ${MAX_SELECTABLE_OPENROUTER_MODELS} models after refresh.` });
           }
            setActiveModels(calculateActiveModels(limitedValidSelectedIds, fetchedModels));
            // Save the potentially trimmed selection
           localStorage.setItem(SELECTED_OPENROUTER_MODELS_KEY, JSON.stringify(Array.from(limitedValidSelectedIds)));
           return limitedValidSelectedIds;
       });

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error fetching models.';
        console.error("Error fetching OpenRouter models:", error);
        setFetchModelsError(`Error: ${message}`);
        setAllOpenRouterModels([]);
        setActiveModels(DEFAULT_GOOGLE_MODELS); // Reset on error
    } finally {
      setIsFetchingModels(false);
    }
  }, [toast, calculateActiveModels]);


  // --- Effects ---

  // Effect 1: Load initial data from localStorage & setup Speech Recognition
  useEffect(() => {
    // Load Sessions
     const loadedSessions = loadFromLocalStorage<ChatSession[]>(CHAT_SESSIONS_STORAGE_KEY, []).map(s => ({
         ...s,
         messages: s.messages?.map(m => ({ ...m, id: m.id ?? generateMessageId() })) || [], // Ensure messages have IDs
         tags: s.tags || [],
         isBookmarked: s.isBookmarked || false,
         folderId: s.folderId || null,
         totalCost: s.totalCost || 0,
         createdAt: s.createdAt || Date.now(),
         lastModified: s.lastModified || Date.now(),
         name: s.name || DEFAULT_SESSION_NAME,
     }));
    setChatSessions(loadedSessions);

    // Load Settings
    const storedApiKey = loadFromLocalStorage<string>(OPENROUTER_API_KEY_STORAGE_KEY, '');
    const storedSelectedModelIds = loadFromLocalStorage<string[]>(SELECTED_OPENROUTER_MODELS_KEY, []);
    const initialSelectedIds = new Set(storedSelectedModelIds.slice(0, MAX_SELECTABLE_OPENROUTER_MODELS));

    setOpenRouterApiKey(storedApiKey);
    setSelectedOpenRouterModelIds(initialSelectedIds);

    if (storedApiKey) {
      fetchOpenRouterModels(storedApiKey);
    } else {
      setActiveModels(calculateActiveModels(initialSelectedIds, []));
    }

    // Load Folders
    const loadedFolders = loadFromLocalStorage<ChatFolder[]>(CHAT_FOLDERS_STORAGE_KEY, []);
    setFolders(loadedFolders);

    // Determine initial active session
    const storedActiveId = localStorage.getItem(ACTIVE_SESSION_ID_STORAGE_KEY);
    let activeIdToSet = null;
    if (storedActiveId && loadedSessions.some(s => s.id === storedActiveId)) {
        activeIdToSet = storedActiveId;
    } else if (loadedSessions.length > 0) {
        activeIdToSet = loadedSessions[0].id;
    }

    if (activeIdToSet) {
        setActiveSessionId(activeIdToSet);
        if (activeIdToSet !== storedActiveId) {
            localStorage.setItem(ACTIVE_SESSION_ID_STORAGE_KEY, activeIdToSet);
        }
    } else {
        createNewSession();
    }

    // Speech Recognition Setup
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
        setIsSpeechRecognitionSupported(true);
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false; // Stop listening after first result
        recognitionRef.current.lang = 'en-US'; // Adjust language as needed
        recognitionRef.current.interimResults = false; // Get final result only

        recognitionRef.current.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript.trim();
            setInput(prev => prev + transcript); // Append transcript to input
            setIsListening(false);
            console.log("Speech recognition result:", transcript);
        };

        recognitionRef.current.onerror = (event) => {
            // Don't log 'no-speech' error to console, as it's expected user behavior
            if (event.error !== 'no-speech') {
                console.error('Speech recognition error:', event.error);
            }
             let errorMsg = "Speech recognition error";
             if (event.error === 'no-speech') errorMsg = "No speech detected.";
             else if (event.error === 'audio-capture') errorMsg = "Audio capture failed (check microphone).";
             else if (event.error === 'not-allowed') errorMsg = "Microphone access denied.";
             else errorMsg = `Error: ${event.error}`;
             setError(errorMsg);
             toast({ variant: "destructive", title: "Voice Input Error", description: errorMsg });
             setIsListening(false);
        };

        recognitionRef.current.onend = () => {
            console.log("Speech recognition ended.");
            // Ensure listening state is reset if recognition ends naturally
            if (isListening) {
                 setIsListening(false);
            }
        };
    } else {
        setIsSpeechRecognitionSupported(false);
        console.warn("Speech Recognition API not supported in this browser.");
    }

    // Cleanup function
    return () => {
        recognitionRef.current?.abort(); // Stop listening if component unmounts
    };

  }, [loadFromLocalStorage, fetchOpenRouterModels, createNewSession, calculateActiveModels, toast]); // Added toast dependency


   // Effect 1.5: Ensure an active session exists if needed
   useEffect(() => {
      if (!activeSessionId && chatSessions.length > 0) {
          const firstSessionId = chatSessions[0].id;
          setActiveSessionId(firstSessionId);
          localStorage.setItem(ACTIVE_SESSION_ID_STORAGE_KEY, firstSessionId);
          console.log("Active session was null, defaulting to first available session:", firstSessionId);
      } else if (!activeSessionId && chatSessions.length === 0 && activeTab !== 'settings') {
          console.log("No active session and no sessions exist, creating a new one.");
          createNewSession();
      }
   }, [activeSessionId, chatSessions, createNewSession, activeTab]);

  // Effect 2: Update `activeModels` whenever selected IDs or fetched models change
  useEffect(() => {
      // Ensure selectedOpenRouterModelIds respects the limit before calculating
      const limitedSelection = new Set(Array.from(selectedOpenRouterModelIds).slice(0, MAX_SELECTABLE_OPENROUTER_MODELS));
      if (limitedSelection.size < selectedOpenRouterModelIds.size) {
          console.warn(`Selected models exceed limit (${MAX_SELECTABLE_OPENROUTER_MODELS}), trimming.`);
          setSelectedOpenRouterModelIds(limitedSelection); // Update state if trimmed
      }
      setActiveModels(calculateActiveModels(limitedSelection, allOpenRouterModels));
  }, [selectedOpenRouterModelIds, allOpenRouterModels, calculateActiveModels]);


  // Effect 3: Reset `selectedModel` if it's no longer in `activeModels`
  useEffect(() => {
      if (!activeModels.some(m => m.id === selectedModel.id)) {
          const defaultModel = activeModels.find(m => m.id === DEFAULT_GOOGLE_MODELS[0].id) || activeModels[0];
          if (defaultModel) {
              setSelectedModel(defaultModel);
              console.log("Selected model reset to:", defaultModel.name);
          } else {
              console.warn("No active models available to select.");
              // Handle case where activeModels might be empty (e.g., API key removed, no defaults)
          }
      }
  }, [activeModels, selectedModel.id]);


  // Effect 4: Scroll chat to bottom
  useEffect(() => {
    if (chatScrollAreaRef.current && activeTab === 'chat') {
      chatScrollAreaRef.current.scrollTo({
        top: chatScrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, activeTab, thinkingMessageId]); // Added thinkingMessageId dependency

 // Effect 5: Ensure `isListening` state matches recognitionRef state
  useEffect(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    const handleStart = () => setIsListening(true);
    const handleEnd = () => setIsListening(false); // Includes normal end and errors

    recognition.addEventListener('start', handleStart);
    recognition.addEventListener('end', handleEnd);
    // The 'error' event also triggers 'end', so we don't need a separate listener here

    return () => {
      recognition.removeEventListener('start', handleStart);
      recognition.removeEventListener('end', handleEnd);
    };
  }, []);


  // --- Event Handlers ---

  const handleSaveApiKey = () => {
    localStorage.setItem(OPENROUTER_API_KEY_STORAGE_KEY, openRouterApiKey);
    setApiKeySaved(true);
    toast({ title: "API Key Saved", description: "OpenRouter API key saved." });
    fetchOpenRouterModels(openRouterApiKey); // Fetch models with the new key
    setTimeout(() => setApiKeySaved(false), 2000);
  };

  const handleRefreshModels = () => {
      if (!openRouterApiKey) { toast({ variant: "destructive", title: "API Key Missing", description: "Enter API key first." }); return; }
      fetchOpenRouterModels(openRouterApiKey);
   };

  const handleModelSelectionChange = (modelId: string, checked: boolean | 'indeterminate') => {
      if (typeof checked === 'boolean') {
         setSelectedOpenRouterModelIds(prev => {
             const newSet = new Set(prev);
             if (checked) {
                 if (newSet.size < MAX_SELECTABLE_OPENROUTER_MODELS) {
                     newSet.add(modelId);
                 } else {
                     toast({
                         variant: "destructive",
                         title: "Model Limit Reached",
                         description: `You can only select up to ${MAX_SELECTABLE_OPENROUTER_MODELS} OpenRouter models.`
                     });
                     // Don't add the model if the limit is reached
                     return prev; // Return previous state
                 }
             } else {
                 newSet.delete(modelId);
             }
             return newSet;
         });
      }
   };

   const handleSelectAllFilteredModels = () => {
     setSelectedOpenRouterModelIds(prev => {
       const newSet = new Set(prev);
       let addedCount = 0;
       filteredModels.forEach(model => {
            if (newSet.size < MAX_SELECTABLE_OPENROUTER_MODELS && !newSet.has(model.id)) {
                 newSet.add(model.id);
                 addedCount++;
            }
       });
        if (addedCount < filteredModels.length && newSet.size === MAX_SELECTABLE_OPENROUTER_MODELS) {
            toast({
                 variant: "default", // Use default variant for info
                 title: "Model Limit Reached",
                 description: `Added ${addedCount} models. Reached the limit of ${MAX_SELECTABLE_OPENROUTER_MODELS}.`
             });
        }
       return newSet;
     });
   };

   const handleDeselectAllFilteredModels = () => {
      setSelectedOpenRouterModelIds(prev => {
          const newSet = new Set(prev);
          filteredModels.forEach(model => newSet.delete(model.id));
          return newSet;
      });
    };

  const handleImportSelectedModels = () => {
      // Double-check limit before saving (although handleModelSelectionChange should prevent exceeding it)
       const selectedIdsArray = Array.from(selectedOpenRouterModelIds).slice(0, MAX_SELECTABLE_OPENROUTER_MODELS);
      saveToLocalStorage(SELECTED_OPENROUTER_MODELS_KEY, selectedIdsArray);
      toast({ title: "Models Selection Saved", description: `${selectedIdsArray.length} models available in chat.` });
      // Recalculate active models based on the final saved selection
      setActiveModels(calculateActiveModels(new Set(selectedIdsArray), allOpenRouterModels));
   };

   const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
        if (file.size > 10 * 1024 * 1024) { setError("File size exceeds 10MB."); if (fileInputRef.current) fileInputRef.current.value = ''; return; }
        if (selectedModel.provider === 'openrouter') { setError(`File input not supported with OpenRouter model ${selectedModel.name}.`); if (fileInputRef.current) fileInputRef.current.value = ''; return; }

        setSelectedFile(file);
        const reader = new FileReader();
        reader.onloadend = () => { setFileDataUri(reader.result as string); setError(null); };
        reader.onerror = () => { setError("Failed to read file."); setSelectedFile(null); setFileDataUri(undefined); }
        reader.readAsDataURL(file);
    }
    if (fileInputRef.current) { fileInputRef.current.value = ''; }
  };

   const handleEditNameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, sessionId: string) => {
       if (event.key === 'Enter') {
           saveEditedSessionName(sessionId);
       } else if (event.key === 'Escape') {
           cancelEditingSessionName();
       }
   };

    const handleNewTagKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
             event.preventDefault(); // Prevent form submission if inside a form
             handleAddTag();
        } else if (event.key === 'Escape') {
            setNewTagInput(""); // Clear input on escape
        }
    };

  // Client-side function to update thinking steps
   const updateThinkingSteps = (steps: string[]) => {
        if (!activeSessionId || !thinkingMessageId) return; // Ensure we have an active session and thinking message

        setChatSessions(prevSessions => {
            return prevSessions.map(session => {
                if (session.id === activeSessionId) {
                    return {
                        ...session,
                        messages: session.messages.map(msg =>
                            msg.id === thinkingMessageId ? { ...msg, thinkingSteps: steps } : msg
                        )
                    };
                }
                return session;
            });
        });
    };


  const handleSend = useCallback(async () => {
    if (!activeSessionId) {
        console.error("No active session to send message to.");
        toast({ variant: "destructive", title: "Error", description: "No active chat session found. Please create a new chat."});
        return;
    }
    if (!input.trim() && !selectedFile) return;
    if (selectedFile && selectedModel.provider === 'openrouter') { setError(`File input not supported with ${selectedModel.name}.`); return; }
    if (selectedModel.provider === 'openrouter' && !openRouterApiKey && !process.env.NEXT_PUBLIC_OPENROUTER_API_KEY) { setError(`API key required for ${selectedModel.name}.`); toast({ variant: "destructive", title: "API Key Missing", description: "Set key in Settings." }); return; }

    setError(null);
    const userMessageId = generateMessageId();
    const timestamp = Date.now();
    const userMessageText = input;
    const userMessageFile = selectedFile ? { name: selectedFile.name, dataUri: fileDataUri! } : undefined;

    const userMessage: Message = {
      id: userMessageId, sender: 'user', text: userMessageText, timestamp: timestamp,
      ...(userMessageFile && { file: userMessageFile }),
    };

     // Placeholder for thinking message
     const thinkingMsgId = generateMessageId();
     const initialThinkingSteps = selectedModel.provider === 'openrouter'
         ? ["Preparing request for OpenRouter..."]
         : ["Preparing request for Google AI..."];
     const thinkingMessage: Message = {
         id: thinkingMsgId,
         sender: 'ai',
         text: 'Thinking...',
         timestamp: Date.now() + 1,
         modelId: selectedModel.id,
         thinkingSteps: initialThinkingSteps,
     };
     setThinkingMessageId(thinkingMsgId);

    let isFirstMessage = false;
    setChatSessions(prevSessions => {
        const updatedSessions = prevSessions.map(session => {
            if (session.id === activeSessionId) {
                isFirstMessage = session.messages.length === 0;
                return {
                    ...session,
                    messages: [...session.messages, userMessage, thinkingMessage], // Add user and thinking message
                    lastModified: timestamp,
                    name: (session.name === DEFAULT_SESSION_NAME && isFirstMessage)
                          ? generateSessionName(userMessageText)
                          : session.name,
                    modelId: selectedModel.id, // Store last used model
                };
            }
            return session;
        });
        saveToLocalStorage(CHAT_SESSIONS_STORAGE_KEY, updatedSessions);
        return updatedSessions;
    });

    setInput('');
    setSelectedFile(null);
    setFileDataUri(undefined);
    setIsSending(true);

    try {
      const assistantInput: SmartAssistantPromptingInput = {
        modelId: selectedModel.id, prompt: userMessageText,
        ...(userMessageFile && { fileDataUri: userMessageFile.dataUri }),
        ...(selectedModel.provider === 'openrouter' && { apiKey: openRouterApiKey || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY }),
      };

       // Update thinking steps after sending (client-side)
       if (selectedModel.provider === 'openrouter') {
           updateThinkingSteps(["Request sent, awaiting response..."]);
       } else {
           // Google AI/Genkit might have its own streaming/tool use logic handled differently
           // For now, just indicate request sent
           updateThinkingSteps(["Request sent, processing..."]);
       }

      // Call the server function (no callback passed)
      const response = await smartAssistantPrompting(assistantInput);

       // Update thinking steps before processing response (client-side)
       updateThinkingSteps(["Received response, processing..."]);


      const calculatedCost = calculateCost(selectedModel.id, userMessageText.length, response.response.length, !!userMessageFile);

      const aiMessage: Message = {
        id: generateMessageId(), sender: 'ai', text: response.response, cost: calculatedCost,
        timestamp: Date.now(), modelId: selectedModel.id,
      };

      // Replace thinking message with final AI response
      setChatSessions(prevSessions => {
          const updatedSessions = prevSessions.map(session => {
              if (session.id === activeSessionId) {
                  return {
                      ...session,
                      messages: session.messages
                                  .filter(msg => msg.id !== thinkingMsgId) // Remove thinking message
                                  .concat(aiMessage), // Add final AI message
                      lastModified: Date.now(),
                      totalCost: (session.totalCost ?? 0) + calculatedCost,
                  };
              }
              return session;
          });
          saveToLocalStorage(CHAT_SESSIONS_STORAGE_KEY, updatedSessions);
          return updatedSessions;
      });
       setThinkingMessageId(null); // Clear thinking message ID

    } catch (err) {
      console.error("Error calling AI:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error.";
      setError(`Failed to get response: ${errorMessage}`);
      const errorTimestamp = Date.now();
      const errorAiMessage: Message = {
           id: generateMessageId(), sender: 'ai', text: `Error: ${errorMessage}`, cost: 0,
           timestamp: errorTimestamp, modelId: selectedModel.id, isError: true
      };

       // Replace thinking message with error message
       setChatSessions(prevSessions => {
           const updatedSessions = prevSessions.map(session => {
               if (session.id === activeSessionId) {
                   return {
                       ...session,
                       messages: session.messages
                                  .filter(msg => msg.id !== thinkingMsgId) // Remove thinking message
                                  .concat(errorAiMessage), // Add error message
                       lastModified: errorTimestamp,
                   };
               }
               return session;
           });
           saveToLocalStorage(CHAT_SESSIONS_STORAGE_KEY, updatedSessions);
           return updatedSessions;
       });
       setThinkingMessageId(null); // Clear thinking message ID
       toast({ variant: "destructive", title: "AI Error", description: errorMessage });
    } finally {
      setIsSending(false);
    }
  }, [activeSessionId, input, selectedFile, fileDataUri, selectedModel, openRouterApiKey, toast, chatSessions, saveToLocalStorage]);

  const handleKeyPress = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); }
  };

  const handleMicClick = () => {
     if (!isSpeechRecognitionSupported) {
          setError("Voice input is not supported in your browser.");
          toast({ variant: "destructive", title: "Unsupported Feature", description: "Try a different browser like Chrome."});
          return;
      }

     if (isListening) {
        recognitionRef.current?.stop();
        // No need to setIsListening(false) here, onend handler will do it
        console.log("Speech recognition stopped manually.");
     } else {
         try {
             recognitionRef.current?.start();
             // No need to setIsListening(true) here, onstart handler will do it
             setError(null); // Clear previous errors
             console.log("Speech recognition starting...");
         } catch (e) {
            console.error("Error starting speech recognition:", e);
             if (e instanceof DOMException && e.name === 'InvalidStateError') {
                 setError("Speech recognition could not start. Please try again.");
                 toast({ variant: "destructive", title: "Voice Input Error", description: "Could not start, please try again." });
                 // Try to recover by aborting and restarting after a short delay
                 recognitionRef.current?.abort();
                 setTimeout(() => {
                     try { recognitionRef.current?.start(); } catch (restartError) { console.error("Error restarting speech recognition:", restartError); }
                 }, 100);
             } else {
                 setError("Could not start voice input. Check microphone permissions.");
                 toast({ variant: "destructive", title: "Voice Input Error", description: "Check microphone permissions." });
             }
             setIsListening(false); // Ensure state is false if start failed immediately
         }
     }
  };


  // --- Memoized Values ---
  const filteredModels = React.useMemo(() => {
      if (!filterTerm) { return allOpenRouterModels; }
      const lowerCaseFilter = filterTerm.toLowerCase();
      return allOpenRouterModels.filter(model =>
          model.name.toLowerCase().includes(lowerCaseFilter) ||
          model.id.toLowerCase().includes(lowerCaseFilter)
      );
  }, [allOpenRouterModels, filterTerm]);

   // Filter and Sort sessions for the History tab
   const filteredAndSortedSessions = React.useMemo(() => {
       // TODO: Implement folder filtering here when UI is ready
       // Filter by selected tags (if any)
       const tagFilteredSessions = filterTags.size === 0
           ? chatSessions
           : chatSessions.filter(session =>
               (session.tags || []).some(tag => filterTags.has(tag))
           );

       // Sort: Bookmarked first, then by last modified date (newest first)
       return [...tagFilteredSessions].sort((a, b) => {
          if (a.isBookmarked && !b.isBookmarked) return -1;
          if (!a.isBookmarked && b.isBookmarked) return 1;
          return b.lastModified - a.lastModified;
       });
    }, [chatSessions, filterTags]); // Add folders dependency when implemented


  // --- Render ---
  return (
    <Card className="w-full max-w-4xl h-[80vh] flex flex-col shadow-lg rounded-lg">
       {!activeSession && chatSessions.length > 0 && (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-muted-foreground">Loading chat history...</p>
        </div>
      )}
      {(activeSession || chatSessions.length === 0) && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
          <CardHeader className="border-b flex flex-row justify-between items-center p-4 gap-4 flex-wrap">
            <div className="flex items-center gap-2">
                 <CardTitle className="text-lg font-semibold text-primary whitespace-nowrap">AI Assistant</CardTitle>
                 <TooltipProvider delayDuration={100}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                             <Button size="icon" variant="ghost" onClick={createNewSession} className="h-7 w-7 text-muted-foreground hover:text-primary">
                                 <PlusCircle size={16} />
                                 <span className="sr-only">New Chat</span>
                             </Button>
                         </TooltipTrigger>
                         <TooltipContent side="bottom"><p>New Chat</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
             </div>

               {/* Model Selector Dropdown */}
               <DropdownMenu>
                   <DropdownMenuTrigger asChild>
                     <Button variant="outline" className="w-full md:w-auto justify-between min-w-[200px]">
                       <BrainCircuit className="mr-2 h-4 w-4" />
                        <span className="truncate flex-1 text-left">
                          {activeModels.length > 0 ? (selectedModel?.name ?? "Select Model") : "Loading/Setup..."}
                         </span>
                       <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                     </Button>
                   </DropdownMenuTrigger>
                   <DropdownMenuContent align="end" className="w-[--radix-dropdown-menu-trigger-width] max-h-80 overflow-y-auto">
                     <DropdownMenuLabel>Select AI Model</DropdownMenuLabel>
                     <DropdownMenuSeparator />
                      {activeModels.length > 0 ? (
                       activeModels.map((model) => (
                         <DropdownMenuItem key={model.id} onSelect={() => setSelectedModel(model)} disabled={isSending} className={cn(selectedModel?.id === model.id && "bg-accent/50")}>
                           {model.name} {model.provider === 'openrouter' && <Badge variant="secondary" className="ml-auto text-xs">OpenRouter</Badge>}
                         </DropdownMenuItem>
                       ))
                      ) : ( <DropdownMenuItem disabled>{isFetchingModels ? "Loading..." : "No models selected/available. Check Settings."}</DropdownMenuItem> )}
                   </DropdownMenuContent>
                 </DropdownMenu>

             <TabsList className="grid grid-cols-4 w-full md:w-[400px] shrink-0">
              <TabsTrigger value="chat">Chat</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="analyse">Analyse</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
          </CardHeader>

          {/* Chat Tab */}
          <TabsContent value="chat" className="flex-1 overflow-hidden p-0 m-0 data-[state=inactive]:hidden">
             <ScrollArea className="h-full p-4" ref={chatScrollAreaRef}>
              <div className="space-y-4">
                {messages.map((message) => (
                  <div key={message.id} className={cn('flex items-start gap-3', message.sender === 'user' ? 'justify-end' : 'justify-start')}>
                    {message.sender === 'ai' && (<Avatar className="h-8 w-8 border shrink-0"><AvatarFallback><Bot size={16} /></AvatarFallback></Avatar>)}
                     <div className={cn('max-w-[75%] rounded-lg shadow-sm relative group', message.sender === 'user' ? 'bg-primary text-primary-foreground ltr-text p-3' : message.isError ? 'bg-destructive/10 border border-destructive/30 text-destructive ltr-text p-3' : message.id === thinkingMessageId ? 'bg-muted/30 border border-dashed border-accent p-0' : 'bg-secondary text-secondary-foreground p-3', message.sender === 'ai' && !message.isError && message.id !== thinkingMessageId && (isPersian(message.text) ? 'rtl-text' : 'ltr-text'))}>
                        {/* Thinking Steps */}
                         {message.id === thinkingMessageId && (
                             <div className="p-3 space-y-2">
                                 <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                     <Loader2 className="h-4 w-4 animate-spin" /> Thinking...
                                 </div>
                                {message.thinkingSteps && message.thinkingSteps.length > 0 && (
                                    <div className="text-xs text-muted-foreground/80 space-y-1 max-h-24 overflow-y-auto border-t border-dashed border-accent pt-2 mt-2">
                                         {message.thinkingSteps.map((step, index) => (<p key={index}>{step}</p>))}
                                    </div>
                                )}
                            </div>
                         )}

                        {/* Main Message Content (not shown for thinking message) */}
                         {message.id !== thinkingMessageId && (
                             <>
                                 {message.file && (<div className="mb-2 p-2 border rounded-md bg-muted/50 flex items-center gap-2 text-sm ltr-text"><Paperclip size={14} /><span>{message.file.name}</span></div>)}
                                 <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                                 {message.sender === 'ai' && !message.isError && message.cost !== undefined && (
                                    <TooltipProvider delayDuration={100}>
                                       <Tooltip>
                                         <TooltipTrigger asChild><Badge variant="secondary" className="absolute -bottom-2 -right-2 opacity-70 group-hover:opacity-100 transition-opacity text-xs px-1.5 py-0.5 cursor-help">~{formatCurrency(message.cost)}</Badge></TooltipTrigger>
                                         <TooltipContent side="bottom" align="end"><p>Model: {getModelName(message.modelId)}</p><p>Est. Cost: {formatCurrency(message.cost)}</p></TooltipContent>
                                       </Tooltip>
                                    </TooltipProvider>
                                 )}
                                  {/* Display Tags for AI message */}
                                  {message.sender === 'ai' && !message.isError && activeSession?.tags && activeSession.tags.length > 0 && (
                                       <div className="mt-2 flex flex-wrap gap-1">
                                           {activeSession.tags.map(tag => (
                                               <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                                           ))}
                                       </div>
                                  )}
                              </>
                         )}
                    </div>
                     {message.sender === 'user' && (<Avatar className="h-8 w-8 border shrink-0"><AvatarFallback><User size={16} /></AvatarFallback></Avatar>)}
                  </div>
                ))}
                 {/* Remove explicit sending skeleton, handled by thinking message */}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* History Tab */}
           <TabsContent value="history" className="flex-1 overflow-hidden p-0 m-0 data-[state=inactive]:hidden">
             <div className="h-full flex flex-col">
                 <div className="p-4 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-lg font-semibold text-primary">Chat History</h3>
                        <Button size="sm" variant="outline" onClick={() => setShowCreateFolderModal(true)}>
                            <FolderPlus className="mr-2 h-4 w-4" /> Create Folder
                        </Button>
                        <Button size="sm" onClick={createNewSession}>
                            <PlusCircle className="mr-2 h-4 w-4" /> New Chat
                        </Button>
                    </div>
                    {/* Tag Filter Section */}
                     {allAvailableTags.length > 0 && (
                       <div className="flex items-center gap-2 flex-wrap">
                           <Label className="text-sm font-medium shrink-0">Filter by Tags:</Label>
                           <div className="flex gap-1 flex-wrap">
                               {allAvailableTags.map(tag => (
                                   <Badge
                                       key={tag}
                                       variant={filterTags.has(tag) ? "default" : "secondary"}
                                       onClick={() => handleTagFilterChange(tag)}
                                       className="cursor-pointer text-xs"
                                   >
                                       {tag}
                                   </Badge>
                               ))}
                           </div>
                            {filterTags.size > 0 && (
                                <Button variant="ghost" size="sm" onClick={clearTagFilters} className="text-xs h-auto p-1 text-muted-foreground">Clear</Button>
                            )}
                       </div>
                     )}
                 </div>
                  <ScrollArea className="flex-1 p-4" ref={historyScrollAreaRef}>
                      {filteredAndSortedSessions.length > 0 ? (
                          <ul className="space-y-2">
                              {/* TODO: Group by folder */}
                              {filteredAndSortedSessions.map((session) => (
                                  <li
                                      key={session.id}
                                      className={cn(
                                          "p-3 rounded-md border flex items-center justify-between gap-2 cursor-pointer transition-colors hover:bg-muted/50",
                                          session.id === activeSessionId && "bg-accent/20 border-accent"
                                      )}
                                      onClick={() => switchSession(session.id)}
                                  >
                                     <div className="flex-1 min-w-0 flex items-center gap-2">
                                         {/* Bookmark Icon */}
                                         <TooltipProvider delayDuration={100}>
                                             <Tooltip>
                                                 <TooltipTrigger asChild>
                                                     <Button variant="ghost" size="icon" className={cn("h-7 w-7 shrink-0 text-muted-foreground hover:text-yellow-500", session.isBookmarked && "text-yellow-500 hover:text-yellow-600")} onClick={(e) => { e.stopPropagation(); toggleBookmark(session.id); }}>
                                                         <Bookmark size={14} fill={session.isBookmarked ? 'currentColor' : 'none'} />
                                                         <span className="sr-only">{session.isBookmarked ? 'Remove Bookmark' : 'Add Bookmark'}</span>
                                                     </Button>
                                                 </TooltipTrigger>
                                                 <TooltipContent side="top"><p>{session.isBookmarked ? 'Remove Bookmark' : 'Add Bookmark'}</p></TooltipContent>
                                             </Tooltip>
                                         </TooltipProvider>

                                         {/* Session Info */}
                                         <div className="flex-1 min-w-0">
                                             {editingSessionId === session.id ? (
                                                 <div className="flex items-center gap-2">
                                                     <Input ref={editNameInputRef} type="text" value={editingSessionName} onClick={(e) => e.stopPropagation()} onChange={(e) => setEditingSessionName(e.target.value)} onKeyDown={(e) => handleEditNameKeyDown(e, session.id)} onBlur={() => saveEditedSessionName(session.id)} className="h-8 text-sm flex-1" maxLength={MAX_SESSION_NAME_LENGTH}/>
                                                     <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); saveEditedSessionName(session.id); }}> <CheckCircle size={16} className="text-green-600" /> </Button>
                                                     <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); cancelEditingSessionName(); }}> <X size={16} /> </Button>
                                                 </div>
                                             ) : (
                                                 <p className="text-sm font-medium truncate" title={session.name}>{session.name || DEFAULT_SESSION_NAME}</p>
                                             )}
                                             <p className="text-xs text-muted-foreground mt-1">
                                                 {session.messages.length} message{session.messages.length !== 1 ? 's' : ''} - {new Date(session.lastModified).toLocaleString()}
                                                 {session.folderId && <Badge variant="outline" className="ml-2 text-xs">{folders.find(f => f.id === session.folderId)?.name || 'Folder'}</Badge>}
                                             </p>
                                             {/* Display Tags */}
                                             {session.tags && session.tags.length > 0 && (
                                                <div className="mt-1 flex flex-wrap gap-1">
                                                    {session.tags.map(tag => (
                                                        <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                                                    ))}
                                                </div>
                                             )}
                                         </div>
                                     </div>

                                     {/* Action Buttons */}
                                      <div className="flex items-center gap-1 shrink-0">
                                         {/* Edit Name */}
                                        {!editingSessionId && (
                                         <TooltipProvider delayDuration={100}>
                                          <Tooltip><TooltipTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={(e) => { e.stopPropagation(); startEditingSessionName(session.id); }}><Edit2 size={14} /><span className="sr-only">Rename</span></Button>
                                           </TooltipTrigger><TooltipContent side="top"><p>Rename</p></TooltipContent></Tooltip>
                                          </TooltipProvider>
                                        )}
                                         {/* Delete Session */}
                                         <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                              <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={(e) => e.stopPropagation()}><Trash2 size={14} /><span className="sr-only">Delete</span></Button>
                                              </TooltipTrigger><TooltipContent side="top"><p>Delete</p></TooltipContent></Tooltip></TooltipProvider>
                                             </AlertDialogTrigger>
                                            <AlertDialogContent onClick={(e) => e.stopPropagation()}> <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone. This will permanently delete the chat session "{session.name}".</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteSession(session.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                                        </AlertDialog>
                                        {/* Move to Folder */}
                                          <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
                                             <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-blue-500" onClick={(e) => {e.stopPropagation(); openMoveToFolderModal(session.id); }}><FolderPlus size={14} /><span className="sr-only">Move to Folder</span></Button>
                                            </TooltipTrigger><TooltipContent side="top"><p>Move to Folder</p></TooltipContent></Tooltip></TooltipProvider>
                                         {/* Edit Tags */}
                                          <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
                                             <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-purple-500" onClick={(e) => { e.stopPropagation(); startEditingTags(session.id); }}>
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-tags"><path d="M9 5H2v7l6.29 6.29c.94.94 2.48.94 3.42 0l3.58-3.58c.94-.94.94-2.48 0-3.42L9 5Z"/><path d="M6 9.01V9"/><path d="m15 5 6.3 6.3a2.65 2.65 0 0 1 0 3.72L18.7 17.6a2.65 2.65 0 0 1-3.72 0L15 15"/><path d="m12 15-3-3"/></svg>
                                                <span className="sr-only">Edit Tags</span>
                                             </Button>
                                            </TooltipTrigger><TooltipContent side="top"><p>Edit Tags</p></TooltipContent></Tooltip></TooltipProvider>
                                      </div>
                                  </li>
                              ))}
                          </ul>
                      ) : (
                          <div className="text-center text-muted-foreground py-8">
                              <p>No chat history found.</p>
                              {filterTags.size > 0 && <p className="text-sm mt-1">Try clearing tag filters.</p>}
                              <Button size="sm" variant="link" onClick={createNewSession} className="mt-2">Start a new chat</Button>
                          </div>
                      )}
                   </ScrollArea>

                    {/* Create Folder Modal */}
                    <AlertDialog open={showCreateFolderModal} onOpenChange={setShowCreateFolderModal}>
                        <AlertDialogContent>
                             <AlertDialogHeader>
                               <AlertDialogTitle>Create New Folder</AlertDialogTitle>
                               <AlertDialogDescription>Enter a name for your new folder.</AlertDialogDescription>
                             </AlertDialogHeader>
                             <div className="py-4">
                                 <Input
                                     id="new-folder-name"
                                     placeholder="Folder Name"
                                     value={newFolderName}
                                     onChange={(e) => setNewFolderName(e.target.value)}
                                     maxLength={30} // Optional: Limit folder name length
                                 />
                             </div>
                             <AlertDialogFooter>
                                 <AlertDialogCancel onClick={() => setNewFolderName("")}>Cancel</AlertDialogCancel>
                                 <AlertDialogAction onClick={handleCreateFolder} disabled={!newFolderName.trim()}>Create</AlertDialogAction>
                             </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                     {/* Move to Folder Modal */}
                    <AlertDialog open={showMoveToFolderModal} onOpenChange={setShowMoveToFolderModal}>
                        <AlertDialogContent>
                             <AlertDialogHeader>
                               <AlertDialogTitle>Move Session to Folder</AlertDialogTitle>
                               <AlertDialogDescription>Select a folder to move this session to, or move it out of folders.</AlertDialogDescription>
                             </AlertDialogHeader>
                              <ScrollArea className="max-h-60 my-4">
                                <div className="space-y-2 pr-4">
                                    <Button variant="ghost" className="w-full justify-start" onClick={() => handleMoveSessionToFolder(null)}>
                                        (Move out of folder)
                                    </Button>
                                    {folders.map(folder => (
                                        <Button key={folder.id} variant="ghost" className="w-full justify-start" onClick={() => handleMoveSessionToFolder(folder.id)}>
                                            <FolderPlus size={16} className="mr-2"/> {folder.name}
                                        </Button>
                                    ))}
                                    {folders.length === 0 && <p className="text-sm text-muted-foreground text-center py-2">No folders created yet.</p>}
                                 </div>
                               </ScrollArea>
                             <AlertDialogFooter>
                                 <AlertDialogCancel onClick={() => setSessionToMove(null)}>Cancel</AlertDialogCancel>
                             </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                    {/* Edit Tags Modal */}
                    <AlertDialog open={!!editingTagsSessionId} onOpenChange={(open) => !open && cancelEditingTags()}>
                         <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Edit Tags</AlertDialogTitle>
                                <AlertDialogDescription>Add or remove tags for this session.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="py-4 space-y-4">
                                 {/* Existing Tags */}
                                 <div className="flex flex-wrap gap-2">
                                     {editingTags.length > 0 ? editingTags.map(tag => (
                                         <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                                            {tag}
                                             <Button variant="ghost" size="icon" onClick={() => handleRemoveTag(tag)} className="h-4 w-4 ml-1 p-0">
                                                <X size={12} />
                                                <span className="sr-only">Remove tag {tag}</span>
                                             </Button>
                                         </Badge>
                                     )) : <p className="text-sm text-muted-foreground">No tags yet.</p>}
                                 </div>
                                 {/* Add New Tag Input */}
                                 <div className="flex items-center gap-2">
                                     <Input
                                         ref={newTagInputRef}
                                         id="new-tag-input"
                                         placeholder="Add a tag (e.g., project-alpha)"
                                         value={newTagInput}
                                         onChange={(e) => setNewTagInput(e.target.value)}
                                         onKeyDown={handleNewTagKeyDown}
                                         maxLength={20}
                                         className="flex-1"
                                     />
                                     <Button onClick={handleAddTag} disabled={!newTagInput.trim()}>Add</Button>
                                 </div>
                            </div>
                             <AlertDialogFooter>
                                <AlertDialogCancel onClick={cancelEditingTags}>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleSaveTags}>Save Tags</AlertDialogAction>
                            </AlertDialogFooter>
                         </AlertDialogContent>
                     </AlertDialog>

                </div>
           </TabsContent>


          {/* Analyse Tab */}
          <TabsContent value="analyse" className="flex-1 overflow-hidden p-0 m-0 data-[state=inactive]:hidden">
            <ScrollArea className="h-full p-4" ref={analyseScrollAreaRef}>
              <div className="space-y-4">
                <h3 className="text-lg font-semibold mb-2 text-primary">API Usage Analysis</h3>
                 {allAiMessages.length > 0 ? (
                   <Table>
                     <TableCaption>Est. cost per successful AI response. Total est. cost across all sessions: {formatCurrency(totalCost)}</TableCaption>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Timestamp</TableHead>
                          <TableHead>Model Used</TableHead>
                           <TableHead>Session</TableHead>
                          <TableHead>Response Snippet</TableHead>
                          <TableHead className="text-right">Est. Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allAiMessages.map((msg) => {
                            const session = chatSessions.find(s => s.messages.some(m => m.id === msg.id));
                            return (
                                <TableRow key={msg.id}>
                                  <TableCell className="text-xs">{new Date(msg.timestamp).toLocaleString()}</TableCell>
                                  <TableCell className="text-xs">{getModelName(msg.modelId)}</TableCell>
                                   <TableCell className="text-xs truncate max-w-[100px]" title={session?.name}>{session?.name || 'Unknown Session'}</TableCell>
                                  <TableCell className="max-w-[200px] truncate text-xs">{msg.text}</TableCell>
                                  <TableCell className="text-right text-xs">{formatCurrency(msg.cost)}</TableCell>
                                </TableRow>
                            );
                         })}
                        <TableRow className="font-semibold bg-muted/50">
                            <TableCell colSpan={4}>Total Estimated Cost (All Sessions)</TableCell>
                            <TableCell className="text-right">{formatCurrency(totalCost)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                 ) : (
                   <div className="text-center text-muted-foreground py-8">
                     <BarChart className="mx-auto h-12 w-12 mb-2 opacity-50" />
                     <p>No successful AI interactions yet.</p>
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
                    <Label htmlFor="openrouter-api-key" className="flex items-center text-base font-medium"><Key className="mr-2 h-4 w-4" /> OpenRouter API Key</Label>
                    <p className="text-sm text-muted-foreground">Enter your key from <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline text-accent hover:text-accent/80">OpenRouter Keys</a>.</p>
                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      <Input id="openrouter-api-key" type="password" placeholder="sk-or-v1-..." value={openRouterApiKey} onChange={(e) => setOpenRouterApiKey(e.target.value)} className="flex-1"/>
                      <Button onClick={handleSaveApiKey} disabled={!openRouterApiKey.trim()} className="w-full sm:w-auto">
                         {apiKeySaved ? <CheckCircle className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />} {apiKeySaved ? 'Saved!' : 'Save Key'}
                      </Button>
                    </div>
                    <Alert className="mt-3"><AlertTitle>Security Note</AlertTitle><AlertDescription>Key stored in browser local storage.</AlertDescription></Alert>
                  </div>

                  {/* Model Selection Section */}
                  <div className="space-y-4 p-4 border rounded-lg shadow-sm">
                    <div className="flex justify-between items-center gap-2 flex-wrap">
                       <h4 className="text-base font-medium flex items-center"><BrainCircuit className="mr-2 h-4 w-4" /> Manage OpenRouter Models</h4>
                       <Button onClick={handleRefreshModels} variant="outline" size="sm" disabled={isFetchingModels || !openRouterApiKey}>
                         {isFetchingModels ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} {isFetchingModels ? 'Fetching...' : 'Refresh List'}
                       </Button>
                     </div>
                     <p className="text-sm text-muted-foreground">Select up to {MAX_SELECTABLE_OPENROUTER_MODELS} models for the chat dropdown. Click 'Save Selections'.</p>

                     {fetchModelsError && (<Alert variant="destructive"><AlertTitle>Error Fetching</AlertTitle><AlertDescription>{fetchModelsError}</AlertDescription></Alert>)}
                      {!openRouterApiKey && (<Alert variant="default"><AlertTitle>API Key Required</AlertTitle><AlertDescription>Enter API key to fetch and select models.</AlertDescription></Alert>)}

                     {openRouterApiKey && !isFetchingModels && allOpenRouterModels.length > 0 && (
                         <>
                           <div className="flex flex-col sm:flex-row gap-2">
                              <Input type="search" placeholder="Filter models..." value={filterTerm} onChange={(e) => setFilterTerm(e.target.value)} className="flex-1"/>
                              <div className="flex gap-2"><Button onClick={handleSelectAllFilteredModels} variant="secondary" size="sm" className="flex-1 sm:flex-none">Select Filtered</Button><Button onClick={handleDeselectAllFilteredModels} variant="secondary" size="sm" className="flex-1 sm:flex-none">Deselect Filtered</Button></div>
                           </div>
                            <p className="text-sm text-muted-foreground">Selected: {selectedOpenRouterModelIds.size} / {MAX_SELECTABLE_OPENROUTER_MODELS}</p>
                           <ScrollArea className="h-64 border rounded-md">
                             <div className="p-4 space-y-3">
                               {filteredModels.length > 0 ? ( filteredModels.map((model) => (
                                   <div key={model.id} className="flex items-center space-x-3 bg-background p-2 rounded hover:bg-muted/50 transition-colors">
                                     <Checkbox
                                        id={`model-${model.id}`}
                                        checked={selectedOpenRouterModelIds.has(model.id)}
                                        onCheckedChange={(checked) => handleModelSelectionChange(model.id, checked)}
                                        // Disable checkbox if limit is reached and this model is not already selected
                                        disabled={selectedOpenRouterModelIds.size >= MAX_SELECTABLE_OPENROUTER_MODELS && !selectedOpenRouterModelIds.has(model.id)}
                                     />
                                     <div className="grid gap-1.5 leading-none flex-1 min-w-0">
                                       <label
                                            htmlFor={`model-${model.id}`}
                                            className={cn("text-sm font-medium truncate cursor-pointer", (selectedOpenRouterModelIds.size >= MAX_SELECTABLE_OPENROUTER_MODELS && !selectedOpenRouterModelIds.has(model.id)) && "text-muted-foreground opacity-70 cursor-not-allowed")}
                                            title={model.name}
                                       >
                                            {model.name || model.id}
                                       </label>
                                       {model.context_length && (<p className="text-xs text-muted-foreground">Context: {model.context_length.toLocaleString()} tokens</p>)}
                                     </div>
                                   </div> ))
                               ) : ( <p className="text-sm text-muted-foreground text-center py-4">No models match filter.</p> )}
                             </div>
                           </ScrollArea>
                           <div className="flex justify-end pt-2">
                              <Button onClick={handleImportSelectedModels}><Save className="mr-2 h-4 w-4" /> Save {selectedOpenRouterModelIds.size} Selected Model{selectedOpenRouterModelIds.size !== 1 ? 's' : ''}</Button>
                            </div>
                         </>
                       )}
                       {openRouterApiKey && !isFetchingModels && allOpenRouterModels.length === 0 && !fetchModelsError && ( <p className="text-sm text-muted-foreground text-center py-4">No models found. Click 'Refresh List'.</p> )}
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>


          <CardFooter className="border-t p-4 flex-col items-start gap-2">
             {error && (<Alert variant="destructive" className="mb-2 w-full"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>)}
            <div className="flex items-center gap-2 w-full">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-accent shrink-0" onClick={() => fileInputRef.current?.click()} aria-label="Attach file" disabled={isSending || selectedModel.provider === 'openrouter'} title={selectedModel.provider === 'openrouter' ? "File attachment not supported" : "Attach file"}>
                <Paperclip className="h-5 w-5" />
              </Button>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".txt,.pdf,.jpg,.jpeg,.png,.webp,.md" disabled={selectedModel.provider === 'openrouter'} />
               <Textarea placeholder={isListening ? "Listening..." : "Type message or use microphone..."} value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={handleKeyPress} className="flex-1 resize-none min-h-[40px] max-h-[150px] text-sm" rows={1} disabled={isSending || !activeSessionId} dir={isPersian(input) ? 'rtl' : 'ltr'} />
              <TooltipProvider delayDuration={100}>
                 <Tooltip>
                      <TooltipTrigger asChild>
                           <Button
                             variant="ghost"
                             size="icon"
                             className={cn("text-muted-foreground hover:text-accent shrink-0", isListening && "text-destructive animate-pulse")}
                             onClick={handleMicClick}
                             aria-label={isListening ? "Stop listening" : "Use microphone"}
                             disabled={isSending || !activeSessionId || !isSpeechRecognitionSupported}
                             title={!isSpeechRecognitionSupported ? "Voice input not supported" : isListening ? "Stop listening" : "Start voice input"}
                           >
                             <Mic className="h-5 w-5" />
                           </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                         <p>{!isSpeechRecognitionSupported ? "Voice input not supported" : isListening ? "Stop listening" : "Start voice input"}</p>
                       </TooltipContent>
                 </Tooltip>
              </TooltipProvider>
              <Button size="icon" onClick={handleSend} disabled={isSending || !activeSessionId || (!input.trim() && !selectedFile) || (selectedFile && selectedModel.provider === 'openrouter') || (selectedModel.provider === 'openrouter' && !openRouterApiKey && !process.env.NEXT_PUBLIC_OPENROUTER_API_KEY)} aria-label="Send message" className="bg-accent hover:bg-accent/90 text-accent-foreground shrink-0" title={!activeSessionId ? "Create a new chat first" : selectedFile && selectedModel.provider === 'openrouter' ? `Cannot send file with ${selectedModel.name}` : (selectedModel.provider === 'openrouter' && !openRouterApiKey && !process.env.NEXT_PUBLIC_OPENROUTER_API_KEY) ? 'OpenRouter API key required' : "Send message"}>
               {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </Button>
            </div>
             {selectedFile && (
                <div className="mt-2 text-sm text-muted-foreground flex items-center gap-2 w-full ltr-text">
                  <Paperclip size={14} /> <span className="truncate max-w-[calc(100%-80px)]">{selectedFile.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => {setSelectedFile(null); setFileDataUri(undefined); setError(null); if(fileInputRef.current) fileInputRef.current.value = '';}} className="p-1 h-auto text-destructive hover:text-destructive/80 ml-auto">Remove</Button>
                </div>
              )}
          </CardFooter>
        </Tabs>
       )}
    </Card>
  );
}
