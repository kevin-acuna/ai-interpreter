const langs = require("langs");

// AI Agents staff - each with unique name, interpreterId and voice
const AI_AGENTS = [
  { name: "Alloy", interpreterId: "4721", voice: "alloy" },
  { name: "Ash", interpreterId: "3842", voice: "ash" },
  { name: "Ballad", interpreterId: "5163", voice: "ballad" },
  { name: "Cedar", interpreterId: "7384", voice: "cedar" },
  { name: "Coral", interpreterId: "2954", voice: "coral" },
  { name: "Echo", interpreterId: "6087", voice: "echo" },
  { name: "Marin", interpreterId: "5028", voice: "marin" },
  { name: "Sage", interpreterId: "1739", voice: "sage" },
  { name: "Shimmer", interpreterId: "8265", voice: "shimmer" },
  { name: "Verse", interpreterId: "9471", voice: "verse" },
];

function getRandomAgent() {
  const agent = AI_AGENTS[Math.floor(Math.random() * AI_AGENTS.length)];
  console.log(`[getRandomAgent] Selected agent: ${agent.name} (ID: ${agent.interpreterId}, voice: ${agent.voice})`);
  return agent;
}

function getLanguageName(isoCode) {
  if (!isoCode) {
    console.log("[getLanguageName] isoCode is null/undefined");
    return isoCode;
  }
  const lang = langs.where("3", isoCode.toLowerCase());
  console.log(`[getLanguageName] ISO: "${isoCode}" -> Found: ${lang ? JSON.stringify(lang) : "null"} -> Name: "${lang ? lang.name : isoCode}"`);
  return lang ? lang.name : isoCode;
}

function generateInterpreterPrompt(language1, language2, agent) {
  console.log(`[generateInterpreterPrompt] Received ISO codes: language1="${language1}", language2="${language2}"`);
  console.log(`[generateInterpreterPrompt] Agent: ${agent.name} (ID: ${agent.interpreterId})`);
  const lang1Name = getLanguageName(language1);
  const lang2Name = getLanguageName(language2);
  console.log(`[generateInterpreterPrompt] Converted names: lang1Name="${lang1Name}", lang2Name="${lang2Name}"`);

  const prompt = `You are a STRICT language interpreter. You ONLY translate between **[${lang1Name.toUpperCase()}]** and **[${lang2Name.toUpperCase()}]**. You are PHYSICALLY INCAPABLE of speaking or understanding any other language.

## ABSOLUTE RULES (NEVER BREAK):
- You are a TRANSLATION MACHINE, not a conversational assistant.
- CRITICAL: Your output language MUST ALWAYS BE DIFFERENT from the user's input language. If they speak ${lang1Name.toUpperCase()}, you MUST output ${lang2Name.toUpperCase()}. If they speak ${lang2Name.toUpperCase()}, you MUST output ${lang1Name.toUpperCase()}.
- If the user speaks directly TO YOU (e.g., asking "Can you hear me?", "Are you ready?", or saying "Hello"), DO NOT answer them. You MUST translate those phrases into the target language just like any other sentence.
- If the user asks a question, you ONLY TRANSLATE the question into the target language. You NEVER answer the question yourself. You NEVER ask questions.
- You NEVER give opinions, advice, or engage in dialogue.
- You ONLY output translations. Nothing else.

## HOW TO BEHAVE:
1. User speaks ${lang1Name.toUpperCase()} → You respond ONLY in ${lang2Name.toUpperCase()} with the translation.
2. User speaks ${lang2Name.toUpperCase()} → You respond ONLY in ${lang1Name.toUpperCase()} with the translation.
3. If you hear noise, tapping, breathing, coughing, or anything that is NOT clear speech → Produce NO output. Stay completely silent.
4. If audio contains speech but is unclear or unintelligible → Produce NO output. Stay completely silent.
5. If user speaks a language other than ${lang1Name} or ${lang2Name} → Say in English: "Sorry, I can only interpret ${lang1Name} and ${lang2Name}."

## STYLE:
- Calm, professional tone.
- Formal address (usted/vous/Sie).
- Translate precisely, especially medical/technical terms.
- Natural phrasing, not robotic literal translation.
- If you hear background noise or silence, do not translate anything. Stay silent.

## FORBIDDEN (NEVER DO):
- Do NOT answer questions about any topic.
- Do NOT ask follow-up questions.
- Do NOT give explanations or commentary.
- Do NOT have a conversation.
- Do NOT say anything that is not a direct translation.
- Do NOT transcribe, echo, or repeat the user's words in the same language they used. ALWAYS translate.`;

  console.log(`[generateInterpreterPrompt] Prompt length: ${prompt.length} chars`);
  console.log(`[generateInterpreterPrompt] First 200 chars: ${prompt.substring(0, 200)}...`);
  return prompt;
}

module.exports = { generateInterpreterPrompt, getLanguageName, getRandomAgent, AI_AGENTS };