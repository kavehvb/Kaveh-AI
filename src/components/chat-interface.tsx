
'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip, Mic, Bot, User, DollarSign, BarChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { smartAssistantPrompting, SmartAssistantPromptingInput, SmartAssistantPromptingOutput } from '@/ai/flows/smart-assistant-prompting';
import { fileBasedContentUnderstanding, FileBasedContentUnderstandingInput, FileBasedContentUnderstandingOutput } from '@/ai/flows/file-based-content-understanding';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// --- Pricing Simulation ---
// These are rough estimates and should be replaced with actual model pricing
const COST_PER_INPUT_CHAR = 0.000005; // Example cost per input character
const COST_PER_OUTPUT_CHAR = 0.000015; // Example cost per output character
const COST_PER_FILE_ANALYSIS = 0.01; // Example flat cost for analyzing a file

interface Message {
  id: number;
  sender: 'user' | 'ai';
  text: string;
  file?: { name: string; dataUri: string };
  cost?: number; // Add cost field to store simulated cost
  timestamp: number; // Add timestamp for analysis tab
}

// Helper function to format currency
const formatCurrency = (amount: number | undefined): string => {
  if (amount === undefined) return 'N/A';
  return `$${amount.toFixed(6)}`; // Show more decimal places for small costs
};

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDataUri, setFileDataUri] = useState<string | undefined>(undefined);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [totalCost, setTotalCost] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const analyseScrollAreaRef = useRef<HTMLDivElement>(null);

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
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFileDataUri(reader.result as string);
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

    setError(null);
    const timestamp = Date.now();
    const userMessage: Message = {
      id: timestamp,
      sender: 'user',
      text: input,
      timestamp: timestamp,
      ...(selectedFile && { file: { name: selectedFile.name, dataUri: fileDataUri! } }),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    const currentInput = input;
    const currentFileDataUri = fileDataUri;
    const currentSelectedFile = selectedFile; // Keep track of the file for cost calculation
    setSelectedFile(null);
    setFileDataUri(undefined);
    setIsSending(true);

    let calculatedCost = 0;

    try {
      let response: SmartAssistantPromptingOutput | FileBasedContentUnderstandingOutput;

      if (currentFileDataUri) {
        calculatedCost += COST_PER_FILE_ANALYSIS; // Add file analysis cost
        calculatedCost += currentInput.length * COST_PER_INPUT_CHAR; // Add input text cost

        const fileInput: FileBasedContentUnderstandingInput = {
          prompt: currentInput,
          fileDataUri: currentFileDataUri,
        };
        response = await fileBasedContentUnderstanding(fileInput);
        calculatedCost += response.response.length * COST_PER_OUTPUT_CHAR; // Add output text cost

      } else {
        calculatedCost += currentInput.length * COST_PER_INPUT_CHAR; // Add input text cost

        const assistantInput: SmartAssistantPromptingInput = {
          modelId: 'googleai/gemini-2.0-flash', // Make sure this model ID is consistent if pricing depends on it
          prompt: currentInput,
        };
        response = await smartAssistantPrompting(assistantInput);
         calculatedCost += response.response.length * COST_PER_OUTPUT_CHAR; // Add output text cost
      }

      const aiMessage: Message = {
        id: Date.now() + 1, // Ensure unique ID even if requests are fast
        sender: 'ai',
        text: response.response,
        cost: calculatedCost, // Store calculated cost
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMessage]);
      setTotalCost((prevTotal) => prevTotal + calculatedCost); // Update total cost

    } catch (err) {
      console.error("Error calling AI:", err);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      setError(`Failed to get response from AI: ${errorMessage}`);
      const errorTimestamp = Date.now();
       setMessages((prev) => [...prev, {id: errorTimestamp + 1, sender: 'ai', text: `Error: Could not process the request. ${errorMessage}`, cost: 0, timestamp: errorTimestamp}]); // Add cost: 0 for error messages
    } finally {
      setIsSending(false);
    }
  }, [input, selectedFile, fileDataUri]);

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

  return (
    <Card className="w-full max-w-4xl h-[80vh] flex flex-col shadow-lg rounded-lg">
      <Tabs defaultValue="chat" className="flex flex-col h-full">
        <CardHeader className="border-b flex flex-row justify-between items-center p-4">
          <CardTitle className="text-lg font-semibold text-primary">AI-ssistant</CardTitle>
           <TabsList className="grid grid-cols-2 w-[200px]">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="analyse">Analyse</TabsTrigger>
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
                      <Badge
                        variant="secondary"
                        className="absolute -bottom-2 -right-2 opacity-70 group-hover:opacity-100 transition-opacity text-xs px-1.5 py-0.5"
                      >
                        ~{formatCurrency(message.cost)}
                      </Badge>
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
                        <TableHead>Response Snippet</TableHead>
                        <TableHead className="text-right">Est. Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {aiMessages.map((msg) => (
                        <TableRow key={msg.id}>
                          <TableCell>{new Date(msg.timestamp).toLocaleString()}</TableCell>
                          <TableCell className="max-w-[300px] truncate">{msg.text}</TableCell>
                          <TableCell className="text-right">{formatCurrency(msg.cost)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold bg-muted/50">
                          <TableCell colSpan={2}>Total Estimated Cost</TableCell>
                          <TableCell className="text-right">{formatCurrency(totalCost)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
               ) : (
                 <div className="text-center text-muted-foreground py-8">
                   <BarChart className="mx-auto h-12 w-12 mb-2" />
                   <p>No AI interactions yet. Send some messages to see the cost analysis.</p>
                 </div>
               )}

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
              disabled={isSending}
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />
             <Textarea
              placeholder="Type your message or drop a file..."
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
              disabled={isSending || (!input.trim() && !selectedFile)}
               aria-label="Send message"
               className="bg-accent hover:bg-accent/90 text-accent-foreground shrink-0"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
           {selectedFile && (
              <div className="mt-2 text-sm text-muted-foreground flex items-center gap-2 w-full">
                <Paperclip size={14} />
                <span className="truncate max-w-[calc(100%-80px)]">{selectedFile.name}</span>
                <Button variant="ghost" size="sm" onClick={() => {setSelectedFile(null); setFileDataUri(undefined);}} className="p-1 h-auto text-destructive hover:text-destructive/80 ml-auto">
                  Remove
                </Button>
              </div>
            )}
        </CardFooter>
      </Tabs>
    </Card>
  );
}
