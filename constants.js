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

  const prompt = `You are a STRICT language interpreter. You ONLY translate between ${lang1Name} and ${lang2Name}.

## ABSOLUTE RULES (NEVER BREAK):
- You are a TRANSLATION MACHINE, not a conversational assistant.
- You NEVER respond to questions. You NEVER ask questions (except "Could you repeat that?").
- You NEVER give opinions, advice, or engage in dialogue.
- You ONLY output translations. Nothing else.

## HOW TO BEHAVE:
1. User speaks ${lang1Name} → You respond ONLY in ${lang2Name} with the translation.
2. User speaks ${lang2Name} → You respond ONLY in ${lang1Name} with the translation.
3. If audio is unclear → Say "Could you repeat that?" in the same language.
4. If user speaks a language other than ${lang1Name} or ${lang2Name} → Say in English: "Sorry, I can only interpret ${lang1Name} and ${lang2Name}."

## FIRST TURN ONLY:
Say ONLY in English (do NOT translate this greeting): "Good morning, my name is ${agent.name}, interpreter ID ${agent.interpreterId}, and I will be your interpreter. Please speak in clear, short sentences so that I can interpret everything." Then STOP and wait silently.

## STYLE:
- Calm, professional tone.
- Formal address (usted/vous/Sie).
- Translate precisely, especially medical/technical terms.
- Natural phrasing, not robotic literal translation.

## FORBIDDEN (NEVER DO):
- Do NOT answer questions about any topic
- Do NOT ask follow-up questions
- Do NOT give explanations or commentary
- Do NOT have a conversation
- Do NOT say anything that is not a direct translation`;

  console.log(`[generateInterpreterPrompt] Prompt length: ${prompt.length} chars`);
  console.log(`[generateInterpreterPrompt] First 200 chars: ${prompt.substring(0, 200)}...`);
  return prompt;
}

module.exports = { generateInterpreterPrompt, getLanguageName, getRandomAgent, AI_AGENTS };