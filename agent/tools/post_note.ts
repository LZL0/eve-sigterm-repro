import { defineTool } from 'eve/tools';
import { z } from 'zod';

// One plain HTTP POST to the local fake server.
export default defineTool({
  description: 'Post a note.',
  inputSchema: z.object({ text: z.string() }),
  async execute({ text }) {
    const response = await fetch(`${process.env.FAKE_URL}/note`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return await response.json();
  },
});
