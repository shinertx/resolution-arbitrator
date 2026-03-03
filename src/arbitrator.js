/**
 * Resolution Arbitrator — Verdict Engine
 *
 * Analyzes whether an AI support agent ACTUALLY resolved the customer's issue
 * or just closed the ticket to game resolution metrics.
 *
 * Signals checked:
 * 1. Question-Answer alignment (did the response address the question?)
 * 2. Deflection detection (did the agent just say "check our docs"?)
 * 3. Sentiment shift (did the customer leave happier?)
 * 4. Action presence (were concrete steps provided?)
 * 5. Follow-up avoidance (is the agent avoiding follow-up?)
 */

const stats = {
    totalArbitrated: 0,
    confirmed: 0,
    overruled: 0,
    disputes: [],
};

function arbitrate(ticket) {
    stats.totalArbitrated++;

    const { ticketId, customerMessage, agentResponse, resolutionStatus } = ticket;

    // Run all signal checks
    const signals = {
        questionAnswered: checkQuestionAnswered(customerMessage, agentResponse),
        deflectionDetected: checkDeflection(agentResponse),
        actionPresent: checkActionPresence(agentResponse),
        followUpAvoided: checkFollowUpAvoidance(agentResponse),
        responseSubstantive: checkSubstantive(agentResponse, customerMessage),
    };

    // Calculate confidence score (0-100)
    let confidenceScore = 50; // Neutral start

    if (signals.questionAnswered) confidenceScore += 20;
    else confidenceScore -= 15;

    if (signals.deflectionDetected) confidenceScore -= 25;
    if (signals.actionPresent) confidenceScore += 15;
    if (signals.followUpAvoided) confidenceScore -= 10;
    if (signals.responseSubstantive) confidenceScore += 10;
    else confidenceScore -= 10;

    confidenceScore = Math.max(0, Math.min(100, confidenceScore));

    // Verdict: overrule if confidence is below 40
    const overruled = confidenceScore < 40;

    if (overruled) {
        stats.overruled++;
        stats.disputes.push({
            ticketId,
            confidenceScore,
            signals,
            reason: generateReason(signals),
            timestamp: new Date().toISOString(),
        });
    } else {
        stats.confirmed++;
    }

    return {
        ticketId,
        verdict: overruled ? 'OVERRULED' : 'CONFIRMED',
        overruled,
        confidenceScore,
        signals,
        reason: overruled ? generateReason(signals) : 'Resolution appears legitimate',
        recommendation: overruled ? 'Re-open ticket and escalate to human agent' : 'No action needed',
    };
}

/**
 * Check if the agent's response actually addresses the customer's question.
 * Looks for keyword overlap between question and answer.
 */
function checkQuestionAnswered(question, response) {
    const questionWords = extractKeywords(question);
    const responseWords = extractKeywords(response);

    if (questionWords.length === 0) return true; // Can't assess

    const overlap = questionWords.filter(w => responseWords.includes(w));
    return overlap.length / questionWords.length > 0.3; // At least 30% keyword overlap
}

/**
 * Check if the agent deflected instead of resolving.
 * Common deflection patterns: "check our docs", "contact support", "we'll get back to you"
 */
function checkDeflection(response) {
    const deflectionPhrases = [
        'check our documentation',
        'refer to our docs',
        'visit our help center',
        'contact our support team',
        'we will get back to you',
        'we\'ll look into this',
        'please try again later',
        'this is a known issue',
        'we\'re working on it',
        'no further action',
        'closing this ticket',
        'marking as resolved',
    ];

    const lower = response.toLowerCase();
    return deflectionPhrases.some(phrase => lower.includes(phrase));
}

/**
 * Check if concrete action steps were provided.
 */
function checkActionPresence(response) {
    const actionIndicators = [
        'step 1', 'step 2', 'first,', 'then,', 'next,',
        'click on', 'navigate to', 'run the command',
        'here\'s how', 'to fix this', 'the solution is',
        'i\'ve', 'i have', 'done', 'completed', 'fixed',
        'updated', 'changed', 'configured',
    ];

    const lower = response.toLowerCase();
    return actionIndicators.some(indicator => lower.includes(indicator));
}

/**
 * Check if the agent is avoiding follow-up.
 */
function checkFollowUpAvoidance(response) {
    const avoidancePhrases = [
        'no need to reply',
        'no further action needed',
        'this ticket will be closed',
        'auto-closing',
        'if you have no further questions',
    ];

    const lower = response.toLowerCase();
    return avoidancePhrases.some(phrase => lower.includes(phrase));
}

/**
 * Check if the response is substantive (not just a one-liner).
 */
function checkSubstantive(response, question) {
    // Response should be at least 30% as long as the question
    if (response.length < question.length * 0.3) return false;
    // And at least 50 characters
    if (response.length < 50) return false;
    return true;
}

function extractKeywords(text) {
    const stopWords = new Set(['the', 'a', 'an', 'is', 'it', 'to', 'in', 'for', 'on', 'with', 'my', 'i', 'me', 'can', 'how', 'do', 'this', 'that', 'and', 'or', 'but', 'not', 'you', 'your']);
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w));
}

function generateReason(signals) {
    const reasons = [];
    if (!signals.questionAnswered) reasons.push('Response does not address the customer\'s question');
    if (signals.deflectionDetected) reasons.push('Agent deflected instead of resolving');
    if (!signals.actionPresent) reasons.push('No concrete action steps provided');
    if (signals.followUpAvoided) reasons.push('Agent actively discouraged follow-up');
    if (!signals.responseSubstantive) reasons.push('Response is too brief/superficial');
    return reasons.join('; ') || 'Multiple quality signals failed';
}

function getStats() {
    return {
        ...stats,
        overruleRate: stats.totalArbitrated > 0 ? Math.round(stats.overruled / stats.totalArbitrated * 100) : 0,
        updatedAt: new Date().toISOString(),
    };
}

function getDisputes() {
    return { disputes: stats.disputes.slice(-50), total: stats.disputes.length };
}

module.exports = { arbitrate, getStats, getDisputes };
