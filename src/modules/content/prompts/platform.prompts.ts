export const PLATFORM_RULES: Record<string, string> = {
  Twitter: `
    - Maximum 280 characters total including hashtags
    - Start with a punchy hook — first 5 words must grab attention
    - 2 to 3 hashtags only, placed at the very end
    - No filler words, no "I am excited to share"
    - Short punchy sentences — no long paragraphs
  `,
  Linkedin: `
    - Between 800 and 1300 characters
    - ALWAYS professional tone regardless of the global tone setting
    - Start with a bold opening line, then a line break
    - Use short paragraphs — 2 to 3 lines max each
    - 3 to 5 hashtags at the very end
    - End with a question or call to action to drive comments
  `,

  Instagram: `
    - Engaging caption between 100 and 300 characters before hashtags
    - 10 to 15 hashtags placed after two line breaks
    - Emoji-friendly — use relevant emojis naturally in the text
    - Conversational and personal tone
    - End with a call to action like "save this", "tag a friend", "drop your thoughts below"
  `,

  Threads: `
    - Maximum 500 characters total
    - Conversational, first-person tone
    - Feels like a thought you just had, not a press release
    - Maximum 3 hashtags — fewer is better
    - No corporate language
  `,
};

export const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  Twitter: 280,
  Linkedin: 1300,
  Instagram: 2200,
  Threads: 500,
};

export const PLATFORM_MIN_HASHTAGS: Record<string, number> = {
  Twitter: 2,
  Linkedin: 3,
  Instagram: 10,
  Threads: 0,
};

export const PLATFORM_MAX_HASHTAGS: Record<string, number> = {
  Twitter: 3,
  Linkedin: 5,
  Instagram: 15,
  Threads: 3,
};