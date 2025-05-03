'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip, Mic, Bot, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { smartAssistantPrompting, SmartAssistantPromptingInput, SmartAssistantPromptingOutput } from '@/ai/flows/smart-assistant-prompting';
import { fileBasedContentUnderstanding, FileBasedContentUnderstandingInput, FileBasedContentUnderstandingOutput } from '@/ai/flows/file-based-content-understanding';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface Message {
  id: number;
  sender: 'user' | 'ai';
  text: string;
  file?: { name: string; dataUri: string }; // Store file info
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDataUri, setFileDataUri] = useState<string | undefined>(undefined);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false); // Placeholder for voice input

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages are added
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
     // Reset file input value to allow selecting the same file again
     if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
  };

  const handleSend = useCallback(async () => {
    if (!input.trim() && !selectedFile) return;

    setError(null); // Clear previous errors
    const userMessage: Message = {
      id: Date.now(),
      sender: 'user',
      text: input,
      ...(selectedFile && { file: { name: selectedFile.name, dataUri: fileDataUri! } }), // Add file info if present
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput(''); // Clear input field immediately
    const currentInput = input; // Store current input value
    const currentFileDataUri = fileDataUri; // Store current file data URI
    setSelectedFile(null); // Clear selected file state
    setFileDataUri(undefined); // Clear file data URI state
    setIsSending(true);

    try {
      let response: SmartAssistantPromptingOutput | FileBasedContentUnderstandingOutput;

      if (currentFileDataUri) {
         // Use file-based content understanding if a file is attached
        const fileInput: FileBasedContentUnderstandingInput = {
          prompt: currentInput,
          fileDataUri: currentFileDataUri,
        };
        response = await fileBasedContentUnderstanding(fileInput);
      } else {
        // Use smart assistant prompting for text-only input
        const assistantInput: SmartAssistantPromptingInput = {
          modelId: 'googleai/gemini-2.0-flash', // Example model, make configurable later
          prompt: currentInput,
        };
        response = await smartAssistantPrompting(assistantInput);
      }


      const aiMessage: Message = {
        id: Date.now() + 1,
        sender: 'ai',
        text: response.response,
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      console.error("Error calling AI:", err);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      setError(`Failed to get response from AI: ${errorMessage}`);
      // Optional: Add an error message to the chat
       setMessages((prev) => [...prev, {id: Date.now() +1, sender: 'ai', text: `Error: Could not process the request. ${errorMessage}`}]);
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
    // Placeholder for voice input functionality
    setIsRecording(!isRecording);
    setError("Voice input is not yet implemented.");
    setTimeout(() => setError(null), 3000);
  };

  return (
    <Card className="w-full max-w-4xl h-[80vh] flex flex-col shadow-lg rounded-lg">
      <CardHeader className="border-b">
        <CardTitle className="text-lg font-semibold text-primary">AI-ssistant Chat</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
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
                    'max-w-[75%] rounded-lg p-3 shadow-sm',
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
      </CardContent>
      <CardFooter className="border-t p-4">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex items-center gap-2 w-full">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-accent"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach file"
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            // Consider adding 'accept' attribute for specific file types
            // accept="image/*,application/pdf,.txt,.csv"
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
                "text-muted-foreground hover:text-accent",
                isRecording && "text-destructive hover:text-destructive/80" // Indicate recording state
              )}
            onClick={handleMicClick}
            aria-label="Use microphone"
            disabled={isSending} // Disable during sending
          >
            <Mic className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            onClick={handleSend}
            disabled={isSending || (!input.trim() && !selectedFile)}
             aria-label="Send message"
             className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
         {selectedFile && (
            <div className="mt-2 text-sm text-muted-foreground flex items-center gap-2">
              <Paperclip size={14} />
              <span>{selectedFile.name}</span>
              <Button variant="ghost" size="sm" onClick={() => {setSelectedFile(null); setFileDataUri(undefined);}} className="p-1 h-auto text-destructive hover:text-destructive/80">
                Remove
              </Button>
            </div>
          )}
      </CardFooter>
    </Card>
  );
}
