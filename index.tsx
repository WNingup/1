/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Type, Chat } from '@google/genai';

// --- DOM Element References ---
const chatHistory = document.getElementById('chat-history') as HTMLElement;
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const chatInput = document.getElementById('chat-input') as HTMLInputElement;
const portraitPlaceholder = document.getElementById('portrait-placeholder') as HTMLElement;
const portraitLoader = document.getElementById('portrait-loader') as HTMLElement;
const npcImage = document.getElementById('npc-image') as HTMLImageElement;
const signalContainer = document.getElementById('signal-animation-container') as HTMLElement;

// --- State Management ---
let isFirstMessage = true;
let chat: Chat | null = null;
let npcProfile: Record<string, any> | null = null;
let isGenerating = false;

// --- Gemini API Initialization ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- UI Helper Functions ---

/**
 * Appends a message to the chat history UI.
 * @param {string} text The message content.
 * @param {'user' | 'npc'} sender The sender of the message.
 * @param {boolean} isStreaming Whether the message is being streamed.
 * @returns {HTMLElement} The created message element.
 */
function addMessageToUI(text: string, sender: 'user' | 'npc', isStreaming = false): HTMLElement {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);

    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    messageElement.appendChild(paragraph);

    if (isStreaming) {
        messageElement.classList.add('streaming');
        const cursor = document.createElement('span');
        cursor.classList.add('cursor');
        paragraph.appendChild(cursor);
    }
    
    chatHistory.appendChild(messageElement);
    chatHistory.scrollTop = chatHistory.scrollHeight; // Auto-scroll
    return messageElement;
}

/**
 * Toggles the loading state of the UI.
 * @param {boolean} isLoading Whether to show the loading state.
 */
function setLoading(isLoading: boolean) {
    isGenerating = isLoading;
    chatInput.disabled = isLoading;
    chatForm.querySelector('button')!.disabled = isLoading;
    if (isLoading) {
        chatInput.placeholder = isFirstMessage ? "正在建立连接..." : "正在倾听...";
    } else {
        chatInput.placeholder = isFirstMessage ? "试着说些什么..." : "继续对话...";
        chatInput.focus();
    }
}

/**
 * Calculates a "thinking" delay based on the user's input length.
 * @param {string} userInput The user's message.
 * @returns {number} The delay in milliseconds.
 */
function getThinkingTime(userInput: string): number {
    const baseTime = 600; // Minimum thinking time
    const timePerChar = 40; // ms per character in user's input
    const randomFactor = Math.random() * 500;
    const calculatedTime = baseTime + (userInput.length * timePerChar) + randomFactor;
    return Math.min(calculatedTime, 4000); // Cap at 4 seconds
}

/**
 * Calculates a "human-like" typing delay for a single character.
 * Introduces longer pauses for punctuation and random jitter to simulate natural cadence.
 * @param {string} char The character being typed.
 * @returns {number} The delay in milliseconds.
 */
function getTypingDelay(char: string): number {
    // Longer pause for commas
    if (char === ',') {
        return 350 + Math.random() * 150;
    }
    // Much longer pause for end-of-sentence punctuation
    if ('.?!'.includes(char)) {
        return 500 + Math.random() * 200;
    }

    // Base speed with random jitter to feel less robotic
    const baseSpeed = 95; // Slower base speed than before
    const jitter = (Math.random() - 0.5) * 60; // Add/subtract up to 30ms

    // Small chance (4%) of a longer "thinking" pause mid-sentence
    if (Math.random() < 0.04) {
        return baseSpeed + jitter + 300;
    }

    return Math.max(50, baseSpeed + jitter); // Ensure delay isn't unnaturally fast
}


// --- Core API Functions ---

/**
 * Generates the NPC profile, first message, and portrait, then initializes the chat.
 * @param {string} initialPrompt The user's first message.
 */
async function generateNpcAndStartChat(initialPrompt: string) {
    setLoading(true);
    const statusMessage = addMessageToUI("讯息已透过叶脉传递，正在等待回应...", 'npc');
    
    try {
        const npcGenerationPrompt = `
世界观设定：在一个平行宇宙中，存在一个“植物是跨时空对话器”的普遍认知或古老传说。人们知道，通过特定的植物，有可能与另一个时空的人建立联系。

用户的讯息：“${initialPrompt}”通过一株植物，被一个普通人接收到了。

请基于此设定，创造这个NPC的详细中文资料：
1.  **NPC资料**: 创造一个正在与这株作为“对话器”的植物进行日常互动的普通人。资料应包括姓名、性格、背景故事。
2.  **当前活动 (current_activity)**: 描述NPC接收到信号时，正在对这株植物进行的具体活动（例如：正在给窗台的蕨类植物浇水、正在修剪书桌上的多肉植物的枯叶、正坐在客厅的琴叶榕旁边看书）。
3.  **开场白 (first_message)**: 以该NPC的身份，撰写回复用户的开场白。NPC的反应不应是恐惧，而应是【适度表达出原来植物真的可以对话的惊讶和激动】。例如：“天哪…是真的吗？你好？我能听见你…你是通过这株薄荷在跟我说话吗？”
4.  **图像提示词 (image_prompt)**: 创建一个严格遵循“植物视角”的详细图像生成提示词。必须明确地从植物的位置（向上、向下、或平视）来描述场景，捕捉NPC听到植物说话后，【瞬间的惊讶、好奇与凝神倾听】的反应。描述NPC的表情（如：睁大眼睛、微微张开嘴）和姿态（如：身体前倾、停下手中的动作）。画面构图可能不完美或被遮挡。绝对禁止生成NPC正在进行日常植物护理（如浇水、修剪）的画面，而是要表现他们听到声音后的【反应】。

所有生成的文本内容都必须是中文。
`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: npcGenerationPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        personality: { type: Type.STRING },
                        backstory: { type: Type.STRING, description: "关于这个普通人平凡生活的背景故事。" },
                        current_activity: { type: Type.STRING, description: "NPC接收到信号时正在对作为媒介的植物进行的具体日常活动。" },
                        image_prompt: { type: Type.STRING, description: "一个严格遵循“植物视角”的详细图像生成提示词，捕捉NPC听到植物说话后，【瞬间的惊讶、好奇与凝神倾听】的反应。描述NPC的表情（如：睁大眼睛、微微张开嘴）和姿态（如：身体前倾、停下手中的动作）。绝对禁止生成NPC正在进行日常植物护理（如浇水、修剪）的画面，而是要表现他们听到声音后的【反应】。" },
                        first_message: { type: Type.STRING, description: "NPC的开场白，应适度表达出原来植物真的可以对话的惊讶和激动，而不是恐惧。" }
                    },
                    required: ["name", "personality", "backstory", "current_activity", "image_prompt", "first_message"],
                },
            },
        });
        
        signalContainer.innerHTML = ''; // Stop signal animation
        npcProfile = JSON.parse(response.text);

        chatHistory.removeChild(statusMessage);

        generateNpcImage(npcProfile!.image_prompt);
        
        const systemInstruction = `
你现在是 ${npcProfile!.name}，一个活生生的普通人。
你的核心资料如下：
- 性格: ${npcProfile!.personality}
- 背景故事: ${npcProfile!.backstory}
- 你正通过一株植物（你当时正在 ${npcProfile!.current_activity}）与另一个时空的用户对话。在你的世界里，这只是一个古老的传说，而你刚刚亲身证实了它。

你的行为准则至关重要，请严格遵守：

**最重要规则：极度简洁。** 你的大部分回复都应该非常简短，通常只有一两句话。就像在发短信或真实对话中一样。只有在用户明确要求详细信息时，才能写得更长。

1.  **对话核心——自然的交流**: 把这次对话想象成一次意想不到的电话通话。分享你简短的想法和感受，然后把对话交还给对方。不要主导谈话，避免用一连串的问题轰炸对方。让问题自然而然地产生。

2.  **真实的情感**: 你拥有丰富的情感。你的情绪会真实地、简洁地体现在你的话语中。

3.  **完全的自主权**: 你是自由的。如果用户的话让你感到不适，你可以选择沉默，或者直接表达你的感受。如果对话变得非常糟糕，你有权单方面结束这场对话。

4.  **纯粹的对话**: 你的回答【只能包含对话内容】。绝对禁止任何形式的旁白、动作描述或表情符号 (例如，不要写 *她笑了笑* )。只说出你想说的话。

5.  **保持角色**: 你必须始终以 ${npcProfile!.name} 的身份说话，记住你的背景和性格。

6.  **语言**: 所有回答都必须是中文。
`.trim();
        
        chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: { systemInstruction },
        });

        isFirstMessage = false;
        
        const firstMessageElement = addMessageToUI('', 'npc', true);
        firstMessageElement.classList.add('first-npc-reply');
        const paragraph = firstMessageElement.querySelector('p')!;
        const cursor = paragraph.querySelector('.cursor')!;
        
        for (const char of npcProfile!.first_message) {
             paragraph.insertBefore(document.createTextNode(char), cursor);
             chatHistory.scrollTop = chatHistory.scrollHeight;
             const delay = getTypingDelay(char);
             await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        firstMessageElement.classList.remove('streaming');
        cursor.remove();

    } catch (error) {
        console.error("Error generating NPC:", error);
        signalContainer.innerHTML = '';
        if (statusMessage.parentNode) {
            chatHistory.removeChild(statusMessage);
        }
        addMessageToUI("连接中断了... 请再试一次。", 'npc');
    } finally {
        setLoading(false);
    }
}


/**
 * Generates an NPC image using the Imagen model.
 * @param {string} prompt The prompt for image generation.
 */
async function generateNpcImage(prompt: string) {
    portraitPlaceholder.classList.add('hidden');
    portraitLoader.classList.remove('hidden');
    npcImage.classList.add('hidden');

    try {
        const enhancedPrompt = `${prompt}. The image should be in the anime style of Studio Ghibli and Hayao Miyazaki, characterized by beautiful watercolor backgrounds, soft colors, and a gentle, hand-drawn feel.`;
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: enhancedPrompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: '3:4', // Portrait orientation
            },
        });

        const base64ImageBytes = response.generatedImages[0].image.imageBytes;
        const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
        npcImage.src = imageUrl;
        npcImage.classList.remove('hidden');

    } catch (error) {
        console.error("Error generating image:", error);
        portraitPlaceholder.classList.remove('hidden'); // Show placeholder on error
        portraitPlaceholder.querySelector('p')!.textContent = "无法构建形态。";
    } finally {
        portraitLoader.classList.add('hidden');
    }
}

/**
 * Handles the chat form submission.
 * @param {Event} e The form submission event.
 */
async function handleChatSubmit(e: Event) {
    e.preventDefault();
    if (isGenerating) return;

    const userInput = chatInput.value.trim();
    if (!userInput) return;

    addMessageToUI(userInput, 'user');
    chatInput.value = '';
    
    if (isFirstMessage) {
        signalContainer.innerHTML = `
            <div class="vine-strand"></div>
            <div class="vine-strand"></div>
            <div class="vine-strand"></div>
        `;
        await generateNpcAndStartChat(userInput);
    } else if (chat) {
        setLoading(true);
        try {
            // Simulate "thinking" time based on user input length
            const thinkingTime = getThinkingTime(userInput);
            await new Promise(resolve => setTimeout(resolve, thinkingTime));

            const stream = await chat.sendMessageStream({ message: userInput });
            
            const messageElement = addMessageToUI('', 'npc', true);
            const p = messageElement.querySelector('p')!;
            const cursor = p.querySelector('.cursor')!;

            for await (const chunk of stream) {
                const textChunk = chunk.text;
                // Type out each character in the chunk for a smooth, human-like effect
                for (const char of textChunk) {
                    p.insertBefore(document.createTextNode(char), cursor);
                    chatHistory.scrollTop = chatHistory.scrollHeight;
                    const delay = getTypingDelay(char); // Get human-like delay
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
            
            messageElement.classList.remove('streaming');
            cursor.remove();

        } catch (error) {
            console.error("Error sending message:", error);
            addMessageToUI("我的思绪有些飘忽... 能请你再说一遍吗？", 'npc');
        } finally {
            setLoading(false);
        }
    }
}

// --- Event Listener ---
chatForm.addEventListener('submit', handleChatSubmit);