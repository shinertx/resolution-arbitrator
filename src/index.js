const express = require('express');
const { arbitrate, getStats, getDisputes } = require('./arbitrator');

const app = express();
const PORT = process.env.PORT || 4030;

app.use(express.json({ limit: '10mb' }));

// ── Dashboard ───────────────────────────────────────────
app.get('/api/stats', (req, res) => {
    res.json(getStats());
});

app.get('/api/disputes', (req, res) => {
    res.json(getDisputes());
});

// ── Submit a resolution for arbitration ─────────────────
app.post('/api/arbitrate', async (req, res) => {
    const { ticketId, customerMessage, agentResponse, resolutionStatus, metadata } = req.body;

    if (!ticketId || !customerMessage || !agentResponse) {
        return res.status(400).json({
            error: { message: 'ticketId, customerMessage, and agentResponse are required', type: 'validation_error' },
        });
    }

    const verdict = arbitrate({
        ticketId,
        customerMessage,
        agentResponse,
        resolutionStatus: resolutionStatus || 'resolved',
        metadata: metadata || {},
    });

    const statusCode = verdict.overruled ? 200 : 200;
    console.log(`[ARBITRATOR] Ticket #${ticketId}: ${verdict.overruled ? '🚫 OVERRULED' : '✅ CONFIRMED'} (${verdict.confidenceScore}/100)`);

    res.json(verdict);
});

// ── Webhook receiver (for Zendesk, Intercom, Freshdesk) ─
app.post('/webhook/:provider', async (req, res) => {
    const { provider } = req.params;
    const payload = req.body;

    console.log(`[WEBHOOK] Received ${provider} webhook`);

    // Normalize payloads from different providers
    let normalized;
    try {
        normalized = normalizeWebhook(provider, payload);
    } catch (err) {
        return res.status(400).json({ error: { message: `Unsupported provider: ${provider}` } });
    }

    const verdict = arbitrate(normalized);
    console.log(`[ARBITRATOR] ${provider} ticket #${normalized.ticketId}: ${verdict.overruled ? '🚫 OVERRULED' : '✅ CONFIRMED'}`);

    res.json(verdict);
});

function normalizeWebhook(provider, payload) {
    switch (provider) {
        case 'zendesk':
            return {
                ticketId: payload.ticket?.id || payload.id,
                customerMessage: payload.ticket?.description || payload.description || '',
                agentResponse: payload.ticket?.latest_comment?.body || '',
                resolutionStatus: payload.ticket?.status || 'solved',
                metadata: { provider: 'zendesk', raw: payload },
            };
        case 'intercom':
            return {
                ticketId: payload.data?.item?.id || payload.id,
                customerMessage: payload.data?.item?.source?.body || '',
                agentResponse: payload.data?.item?.conversation_parts?.conversation_parts?.[0]?.body || '',
                resolutionStatus: payload.data?.item?.state || 'closed',
                metadata: { provider: 'intercom', raw: payload },
            };
        case 'freshdesk':
            return {
                ticketId: payload.freshdesk_webhook?.ticket_id || payload.ticket_id,
                customerMessage: payload.freshdesk_webhook?.ticket_description || '',
                agentResponse: payload.freshdesk_webhook?.ticket_latest_comment || '',
                resolutionStatus: payload.freshdesk_webhook?.ticket_status || 'resolved',
                metadata: { provider: 'freshdesk', raw: payload },
            };
        default:
            throw new Error(`Unsupported provider: ${provider}`);
    }
}

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║  ⚖️  Resolution Arbitrator — Running on port ${PORT}     ║
║  Verifying agents actually resolve support tickets    ║
║  Dashboard: http://localhost:${PORT}/api/stats            ║
║  Webhooks: POST /webhook/zendesk|intercom|freshdesk   ║
╚═══════════════════════════════════════════════════════╝
  `);
});
