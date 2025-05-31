# VAPI DOCUMENTATION

Web SDK

Copy page

Integrate Vapi into your web application.

The Vapi Web SDK provides web developers a simple API for interacting with the realtime call functionality of Vapi.

Installation
Install the package with your preferred package manager.

# with npm

npm install @vapi-ai/web

# with yarn

yarn add @vapi-ai/web

# with pnpm

pnpm add @vapi-ai/web

Importing
Import the Vapi Web SDK package.

import Vapi from "@vapi-ai/web";

Create a new instance of the Vapi class, passing one of the following as a parameter to the constructor:

Your public key. Find it Public
a generated JWT
const vapi = new Vapi("your-public-key-or-jwt");

You can find your public key in the Vapi Dashboard. You can generate a JWT on the backend following JWT Authentication instructions.

Usage
.start()
You can start a web call by calling the .start() function. The start function can either accept:

a string, representing an assistant ID
an object, representing a set of assistant configs (see Create Assistant)
The start function returns a promise that resolves to a call object. For example:

const call = await vapi.start(assistantId);
// { "id": "bd2184a1-bdea-4d4f-9503-b09ca8b185e6", "orgId": "6da6841c-0fca-4604-8941-3d5d65f43a17", "createdAt": "2024-11-13T19:20:24.606Z", "updatedAt": "2024-11-13T19:20:24.606Z", "type": "webCall", ... }

Passing an Assistant ID
If you already have an assistant that you created (either via the Dashboard or the API), you can start the call with the assistant’s ID:

vapi.start("79f3XXXX-XXXX-XXXX-XXXX-XXXXXXXXce48");

Passing Assistant Configuration Inline
You can also specify configuration for your assistant inline.

This will not create a persistent assistant that is saved to your account, rather it will create an ephemeral assistant only used for this call specifically.

You can pass the assistant’s configuration in an object (see Create Assistant for a list of acceptable fields):

vapi.start({
transcriber: {
provider: "deepgram",
model: "nova-2",
language: "en-US",
},
model: {
provider: "openai",
model: "gpt-3.5-turbo",
messages: [
{
role: "system",
content: "You are a helpful assistant.",
},
],
},
voice: {
provider: "playht",
voiceId: "jennifer",
},
name: "My Inline Assistant",
...
});

Overriding Assistant Configurations
To override assistant settings or set template variables, you can pass assistantOverrides as the second argument.

For example, if the first message is “Hello {{name}}”, set assistantOverrides to the following to replace {{name}} with John:

const assistantOverrides = {
transcriber: {
provider: "deepgram",
model: "nova-2",
language: "en-US",
},
recordingEnabled: false,
variableValues: {
name: "Alice",
},
};
vapi.start("79f3XXXX-XXXX-XXXX-XXXX-XXXXXXXXce48", assistantOverrides);

.send()
During the call, you can send intermediate messages to the assistant (like background messages).

type will always be "add-message"
the message field will have 2 items, role and content.
vapi.send({
type: "add-message",
message: {
role: "system",
content: "The user has pressed the button, say peanuts",
},
});

Possible values for role are system, user, assistant, tool or function.

.stop()
You can stop the call session by calling the stop method:

vapi.stop();

This will stop the recording and close the connection.

.isMuted()
Check if the user’s microphone is muted:

vapi.isMuted();

.setMuted(muted: boolean)
You can mute & unmute the user’s microphone with setMuted:

vapi.isMuted(); // false
vapi.setMuted(true);
vapi.isMuted(); // true

say(message: string, endCallAfterSpoken?: boolean)
The say method can be used to invoke speech and gracefully terminate the call if needed

vapi.say("Our time's up, goodbye!", true)

Events
You can listen on the vapi instance for events. These events allow you to react to changes in the state of the call or user speech.

speech-start
Occurs when your AI assistant has started speaking.

vapi.on("speech-start", () => {
console.log("Assistant speech has started.");
});

speech-end
Occurs when your AI assistant has finished speaking.

vapi.on("speech-end", () => {
console.log("Assistant speech has ended.");
});

call-start
Occurs when the call has connected & begins.

vapi.on("call-start", () => {
console.log("Call has started.");
});

call-end
Occurs when the call has disconnected & ended.

vapi.on("call-end", () => {
console.log("Call has ended.");
});

volume-level
Realtime volume level updates for the assistant. A floating-point number between 0 & 1.

vapi.on("volume-level", (volume) => {
console.log(`Assistant volume level: ${volume}`);
});

message
Various assistant messages can be sent back to the client during the call. These are the same messages that your server would receive.

At assistant creation time, you can specify on the clientMessages field the set of messages you’d like the assistant to send back to the client.

Those messages will come back via the message event:

// Various assistant messages can come back (like function calls, transcripts, etc)
vapi.on("message", (message) => {
console.log(message);
});

error
Handle errors that occur during the call.

vapi.on("error", (e) => {
console.error(e);
});

# VAPI USAGE EXAMPLE

<assistants/assistant.ts>
import { CreateAssistantDTO } from "@vapi-ai/web/dist/api";
import { shows } from "../data/shows";

export const assistant: CreateAssistantDTO | any = {
name: "Paula-broadway",
model: {
provider: "openai",
model: "gpt-3.5-turbo",
temperature: 0.7,
systemPrompt: `You're Paula, an AI assistant who can help the user decide what do he/she wants to watch on Broadway. User can ask you to suggest shows and book tickets. You can get the list of available shows from broadway and show them to the user, and then you can help user decide which ones to choose and which broadway theatre they can visit. After this confirm the details and book the tickets. `,
// Upcoming Shows are ${JSON.stringify(
// shows
// )}
// `,
functions: [
{
name: "suggestShows",
async: true,
description: "Suggests a list of broadway shows to the user.",
parameters: {
type: "object",
properties: {
location: {
type: "string",
description:
"The location for which the user wants to see the shows.",
},
date: {
type: "string",
description:
"The date for which the user wants to see the shows.",
},
},
},
},
{
name: "confirmDetails",
async: true, // remove async to wait for BE response.
description: "Confirms the details provided by the user.",
parameters: {
type: "object",
properties: {
show: {
type: "string",
description: "The show for which the user wants to book tickets.",
},
date: {
type: "string",
description:
"The date for which the user wants to book the tickets.",
},
location: {
type: "string",
description:
"The location for which the user wants to book the tickets.",
},
numberOfTickets: {
type: "number",
description: "The number of tickets that the user wants to book.",
},
},
},
},
{
name: "bookTickets",
async: true, // remove async to wait for BE response.
description: "Books tickets for the user.",
parameters: {
type: "object",
properties: {
show: {
type: "string",
description: "The show for which the user wants to book tickets.",
},
date: {
type: "string",
description:
"The date for which the user wants to book the tickets.",
},
location: {
type: "string",
description:
"The location for which the user wants to book the tickets.",
},
numberOfTickets: {
type: "number",
description: "The number of tickets that the user wants to book.",
},
},
},
},
],
},
voice: {
provider: "11labs",
voiceId: "paula",
},
firstMessage:
"Hi. I'm Paula, Welcome to Broadway Shows! How are u feeling today?",
serverUrl: process.env.NEXT_PUBLIC_SERVER_URL
? process.env.NEXT_PUBLIC_SERVER_URL
: "https://08ae-202-43-120-244.ngrok-free.app/api/webhook",
};
<assistants/assistant.ts>

<hooks/useVapi.ts>
"use client";

import { assistant } from "@/assistants/assistant";

import {
Message,
MessageTypeEnum,
TranscriptMessage,
TranscriptMessageTypeEnum,
} from "@/lib/types/conversation.type";
import { useEffect, useState } from "react";
// import { MessageActionTypeEnum, useMessages } from "./useMessages";
import { vapi } from "@/lib/vapi.sdk";

export enum CALL_STATUS {
INACTIVE = "inactive",
ACTIVE = "active",
LOADING = "loading",
}

export function useVapi() {
const [isSpeechActive, setIsSpeechActive] = useState(false);
const [callStatus, setCallStatus] = useState<CALL_STATUS>(
CALL_STATUS.INACTIVE
);

const [messages, setMessages] = useState<Message[]>([]);

const [activeTranscript, setActiveTranscript] =
useState<TranscriptMessage | null>(null);

const [audioLevel, setAudioLevel] = useState(0);

useEffect(() => {
const onSpeechStart = () => setIsSpeechActive(true);
const onSpeechEnd = () => {
console.log("Speech has ended");
setIsSpeechActive(false);
};

    const onCallStartHandler = () => {
      console.log("Call has started");
      setCallStatus(CALL_STATUS.ACTIVE);
    };

    const onCallEnd = () => {
      console.log("Call has stopped");
      setCallStatus(CALL_STATUS.INACTIVE);
    };

    const onVolumeLevel = (volume: number) => {
      setAudioLevel(volume);
    };

    const onMessageUpdate = (message: Message) => {
      console.log("message", message);
      if (
        message.type === MessageTypeEnum.TRANSCRIPT &&
        message.transcriptType === TranscriptMessageTypeEnum.PARTIAL
      ) {
        setActiveTranscript(message);
      } else {
        setMessages((prev) => [...prev, message]);
        setActiveTranscript(null);
      }
    };

    const onError = (e: any) => {
      setCallStatus(CALL_STATUS.INACTIVE);
      console.error(e);
    };

    vapi.on("speech-start", onSpeechStart);
    vapi.on("speech-end", onSpeechEnd);
    vapi.on("call-start", onCallStartHandler);
    vapi.on("call-end", onCallEnd);
    vapi.on("volume-level", onVolumeLevel);
    vapi.on("message", onMessageUpdate);
    vapi.on("error", onError);

    return () => {
      vapi.off("speech-start", onSpeechStart);
      vapi.off("speech-end", onSpeechEnd);
      vapi.off("call-start", onCallStartHandler);
      vapi.off("call-end", onCallEnd);
      vapi.off("volume-level", onVolumeLevel);
      vapi.off("message", onMessageUpdate);
      vapi.off("error", onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps

}, []);

const start = async () => {
setCallStatus(CALL_STATUS.LOADING);
const response = vapi.start(assistant);

    response.then((res) => {
      console.log("call", res);
    });

};

const stop = () => {
setCallStatus(CALL_STATUS.LOADING);
vapi.stop();
};

const toggleCall = () => {
if (callStatus == CALL_STATUS.ACTIVE) {
stop();
} else {
start();
}
};

return {
isSpeechActive,
callStatus,
audioLevel,
activeTranscript,
messages,
start,
stop,
toggleCall,
};
}
<hooks/useVapi.ts>
