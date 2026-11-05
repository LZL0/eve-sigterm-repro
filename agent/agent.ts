import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { defineAgent } from 'eve';

// A fake OpenAI-compatible server started by repro.mjs.
const fake = createOpenAICompatible({ name: 'fake', baseURL: `${process.env.FAKE_URL}/v1`, apiKey: 'fake-key', includeUsage: true });

export default defineAgent({
  defaultTools: false,
  model: fake('fake-model'),
  modelContextWindowTokens: 64_000,
});
