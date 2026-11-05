import { eveChannel } from 'eve/channels/eve';

// A fixed bearer token so the production build accepts the repro's client.
export default eveChannel({
  auth: async (request) => request.headers.get('authorization') === `Bearer ${process.env.REPRO_TOKEN}`
    ? { principalId: 'repro', principalType: 'service', authenticator: 'repro' }
    : null,
});
