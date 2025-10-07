// analysis.js - AI Models and Prediction Engine

const Analysis = {
    /**
     * Initialize analysis engine
     */
    init() {
        Utils.log('Analysis engine initialized', 'info');
    },

    /**
     * Main prediction function - runs all models and fuses results
     */
    predict(ticks) {
        const predictions = [];
        const enabledModels = this.getEnabledModels();

        // Run all enabled models
        enabledModels.forEach(modelName => {
            const prediction = this.runModel(modelName, ticks);
            if (prediction) {
                predictions.push(prediction);
            }
        });

        // Fuse predictions using decision engine
        return this.fuseDecisions(predictions);
    },

    /**
     * Get list of enabled models
     */
    getEnabledModels() {
        const models = [];
        if (CONFIG.models.statistical.enabled) models.push('statistical');
        if (CONFIG.models.pattern.enabled) models.push('pattern');
        if (CONFIG.models.ruleBased.enabled) models.push('ruleBased');
        if (CONFIG.models.reinforcementLearning.enabled) models.push('reinforcementLearning');
        return models;
    },

    /**
     * Run specific model
     */
    runModel(modelName, ticks) {
        try {
            switch(modelName) {
                case 'statistical':
                    return this.statisticalModel(ticks);
                case 'pattern':
                    return this.patternModel(ticks);
                case 'ruleBased':
                    return this.ruleBasedModel(ticks);
                case 'reinforcementLearning':
                    return this.reinforcementLearningModel(ticks);
                default:
                    return null;
            }
        } catch (e) {
            Utils.log(`Model ${modelName} failed`, 'error', e);
            return null;
        }
    },

    /**
     * Statistical Probability Model with Bayesian updates
     */
    statisticalModel(ticks) {
        if (ticks.length < 10) {
            return { model: 'statistical', prediction: null, confidence: 0 };
        }

        const lookback = Math.min(ticks.length, CONFIG.models.statistical.lookbackPeriod);
        const recentTicks = ticks.slice(-lookback);
        
        // Count even and odd digits
        const evenCount = recentTicks.filter(t => t.isEven).length;
        const oddCount = lookback - evenCount;

        // Calculate base probabilities
        let evenProb = evenCount / lookback;
        let oddProb = oddCount / lookback;

        // Apply Bayesian update with prior belief (market randomness = 0.5)
        const priorWeight = 0.1;
        evenProb = (evenProb * (1 - priorWeight)) + (0.5 * priorWeight);
        oddProb = (oddProb * (1 - priorWeight)) + (0.5 * priorWeight);

        // Calculate EMA for recent trend
        const recentDigits = recentTicks.slice(-20).map(t => t.isEven ? 1 : 0);
        const ema = Utils.calculateEMA(recentDigits, 10, CONFIG.models.statistical.emaAlpha);

        // Adjust probabilities based on EMA
        if (ema !== null) {
            evenProb = (evenProb + ema) / 2;
            oddProb = 1 - evenProb;
        }

        const prediction = evenProb > oddProb ? 'EVEN' : 'ODD';
        const confidence = Math.max(evenProb, oddProb);

        return {
            model: 'statistical',
            prediction,
            confidence,
            details: {
                evenProb: evenProb.toFixed(3),
                oddProb: oddProb.toFixed(3),
                evenCount,
                oddCount,
                ema: ema ? ema.toFixed(3) : 'N/A'
            }
        };
    },

    /**
     * Pattern Recognition Model with Markov chains
     */
    patternModel(ticks) {
        if (ticks.length < 20) {
            return { model: 'pattern', prediction: null, confidence: 0 };
        }

        const minLen = CONFIG.models.pattern.minPatternLength;
        const maxLen = CONFIG.models.pattern.maxPatternLength;
        
        // Extract recent pattern
        const recentPattern = ticks.slice(-maxLen).map(t => t.digit);
        const currentSequence = recentPattern.slice(-minLen);

        // Search for similar patterns in history
        const matches = this.findSimilarPatterns(ticks, currentSequence);

        if (matches.length === 0) {
            return { model: 'pattern', prediction: null, confidence: 0 };
        }

        // Analyze what typically follows the pattern
        const followingDigits = matches.map(m => m.following);
        const evenFollowing = followingDigits.filter(d => d % 2 === 0).length;
        const oddFollowing = followingDigits.length - evenFollowing;

        const evenProb = evenFollowing / followingDigits.length;
        const oddProb = oddFollowing / followingDigits.length;

        // Detect anomalies (unusual patterns)
        const isAnomaly = this.detectAnomaly(ticks);
        let confidence = Math.max(evenProb, oddProb);
        
        if (isAnomaly) {
            confidence *= 0.7; // Reduce confidence during anomalies
        }

        const prediction = evenProb > oddProb ? 'EVEN' : 'ODD';

        return {
            model: 'pattern',
            prediction,
            confidence,
            details: {
                matchesFound: matches.length,
                evenFollowing,
                oddFollowing,
                isAnomaly
            }
        };
    },

    /**
     * Find similar patterns in historical data
     */
    findSimilarPatterns(ticks, targetPattern) {
        const matches = [];
        const threshold = CONFIG.models.pattern.similarityThreshold;

        for (let i = 0; i < ticks.length - targetPattern.length - 1; i++) {
            const candidate = ticks.slice(i, i + targetPattern.length).map(t => t.digit);
            const similarity = this.calculatePatternSimilarity(targetPattern, candidate);

            if (similarity >= threshold) {
                matches.push({
                    index: i,
                    similarity,
                    following: ticks[i + targetPattern.length].digit
                });
            }
        }

        return matches;
    },

    /**
     * Calculate pattern similarity (normalized)
     */
    calculatePatternSimilarity(pattern1, pattern2) {
        if (pattern1.length !== pattern2.length) return 0;
        
        let matches = 0;
        for (let i = 0; i < pattern1.length; i++) {
            if (pattern1[i] === pattern2[i]) matches++;
        }
        
        return matches / pattern1.length;
    },

    /**
     * Detect anomalies (unusual streaks or patterns)
     */
    detectAnomaly(ticks) {
        if (ticks.length < 10) return false;

        const recent = ticks.slice(-10);
        const allEven = recent.every(t => t.isEven);
        const allOdd = recent.every(t => !t.isEven);

        // Check for long streaks (anomaly indicator)
        return allEven || allOdd;
    },

    /**
     * Rule-Based Model with configurable strategies
     */
    ruleBasedModel(ticks) {
        if (ticks.length < 5) {
            return { model: 'ruleBased', prediction: null, confidence: 0 };
        }

        const recent = ticks.slice(-10);
        const lastDigit = recent[recent.length - 1].digit;
        const isLastEven = recent[recent.length - 1].isEven;

        // Check for streaks
        let streakCount = 1;
        let streakType = isLastEven ? 'EVEN' : 'ODD';

        for (let i = recent.length - 2; i >= 0; i--) {
            if ((recent[i].isEven && streakType === 'EVEN') || 
                (!recent[i].isEven && streakType === 'ODD')) {
                streakCount++;
            } else {
                break;
            }
        }

        let prediction = null;
        let confidence = 0.5;
        const rules = [];

        // Rule 1: Mean reversion after long streak
        if (streakCount >= CONFIG.models.ruleBased.streakThreshold) {
            prediction = streakType === 'EVEN' ? 'ODD' : 'EVEN';
            confidence = CONFIG.models.ruleBased.reversalConfidence;
            rules.push(`Streak reversal (${streakCount} ${streakType})`);
        }

        // Rule 2: Continuation on short streaks
        if (streakCount === 2) {
            prediction = streakType;
            confidence = 0.6;
            rules.push(`Short streak continuation (${streakCount})`);
        }

        // Rule 3: Fibonacci-based prediction
        const fibSequence = [0, 1, 1, 2, 3, 5, 8];
        if (fibSequence.includes(lastDigit)) {
            const nextPrediction = isLastEven ? 'ODD' : 'EVEN';
            if (prediction === null || confidence < 0.65) {
                prediction = nextPrediction;
                confidence = 0.65;
                rules.push('Fibonacci number detected');
            }
        }

        // Default: predict opposite of last
        if (prediction === null) {
            prediction = isLastEven ? 'ODD' : 'EVEN';
            confidence = 0.52;
            rules.push('Default alternation');
        }

        return {
            model: 'ruleBased',
            prediction,
            confidence,
            details: {
                streakCount,
                streakType,
                lastDigit,
                rulesApplied: rules
            }
        };
    },

    /**
     * Reinforcement Learning Model (Q-Learning)
     */
    reinforcementLearningModel(ticks) {
        if (ticks.length < 20) {
            return { model: 'reinforcementLearning', prediction: null, confidence: 0 };
        }

        const qTable = Storage.getQTable();
        const state = this.getState(ticks);
        const stateKey = JSON.stringify(state);

        // Initialize Q-values for new states
        if (!qTable[stateKey]) {
            qTable[stateKey] = { EVEN: 0, ODD: 0 };
        }

        // Epsilon-greedy: exploration vs exploitation
        const epsilon = CONFIG.models.reinforcementLearning.explorationRate;
        let prediction;

        if (Math.random() < epsilon) {
            // Explore: random action
            prediction = Math.random() < 0.5 ? 'EVEN' : 'ODD';
        } else {
            // Exploit: choose best action
            const qValues = qTable[stateKey];
            prediction = qValues.EVEN >= qValues.ODD ? 'EVEN' : 'ODD';
        }

        const confidence = Math.max(...Object.values(qTable[stateKey])) / 10; // Normalize

        return {
            model: 'reinforcementLearning',
            prediction,
            confidence: Math.min(confidence, 1),
            details: {
                state: state,
                qValues: qTable[stateKey]
            }
        };
    },

    /**
     * Get state representation for RL model
     */
    getState(ticks) {
        const recent = ticks.slice(-5);
        return {
            lastDigit: recent[recent.length - 1].digit,
            evenCount: recent.filter(t => t.isEven).length,
            pattern: recent.map(t => t.isEven ? 1 : 0).join('')
        };
    },

    /**
     * Update Q-table after trade result
     */
    updateQLearning(state, action, reward, newState) {
        const qTable = Storage.getQTable();
        const stateKey = JSON.stringify(state);
        const newStateKey = JSON.stringify(newState);

        if (!qTable[stateKey]) {
            qTable[stateKey] = { EVEN: 0, ODD: 0 };
        }
        if (!qTable[newStateKey]) {
            qTable[newStateKey] = { EVEN: 0, ODD: 0 };
        }

        const alpha = CONFIG.models.reinforcementLearning.learningRate;
        const gamma = CONFIG.models.reinforcementLearning.discountFactor;

        const currentQ = qTable[stateKey][action];
        const maxNextQ = Math.max(...Object.values(qTable[newStateKey]));

        // Q-learning update rule
        qTable[stateKey][action] = currentQ + alpha * (reward + gamma * maxNextQ - currentQ);

        Storage.saveQTable(qTable);
    },

    /**
     * Decision Engine: Fuse predictions from all models
     */
    fuseDecisions(predictions) {
        if (predictions.length === 0) {
            return {
                finalPrediction: null,
                confidence: 0,
                shouldTrade: false,
                reason: 'No models provided predictions',
                modelBreakdown: []
            };
        }

        const weightMethod = CONFIG.strategy.weightMethod;
        const weights = this.calculateWeights(predictions, weightMethod);

        // Calculate weighted votes
        let evenScore = 0;
        let oddScore = 0;

        predictions.forEach((pred, index) => {
            if (pred.prediction === 'EVEN') {
                evenScore += pred.confidence * weights[index];
            } else if (pred.prediction === 'ODD') {
                oddScore += pred.confidence * weights[index];
            }
        });

        const totalScore = evenScore + oddScore;
        const finalPrediction = evenScore > oddScore ? 'EVEN' : 'ODD';
        const confidence = totalScore > 0 ? Math.max(evenScore, oddScore) / totalScore : 0;

        // Determine if we should trade
        const minConfidence = CONFIG.trading.minConfidence / 100;
        const shouldTrade = confidence >= minConfidence;
        
        let reason = '';
        if (!shouldTrade) {
            reason = `Confidence ${(confidence * 100).toFixed(1)}% below threshold ${CONFIG.trading.minConfidence}%`;
        } else {
            reason = `Strong ${finalPrediction} signal with ${(confidence * 100).toFixed(1)}% confidence`;
        }

        // Run Monte Carlo simulation for additional validation
        if (shouldTrade && CONFIG.strategy.ensembleMethod === 'weighted') {
            const simResult = this.runMonteCarloSimulation(predictions, 100);
            if (simResult.winProbability < 0.5) {
                return {
                    finalPrediction,
                    confidence,
                    shouldTrade: false,
                    reason: 'Monte Carlo simulation suggests unfavorable odds',
                    modelBreakdown: predictions,
                    simulation: simResult
                };
            }
        }

        return {
            finalPrediction,
            confidence,
            shouldTrade,
            reason,
            modelBreakdown: predictions,
            scores: { evenScore, oddScore }
        };
    },

    /**
     * Calculate weights for each model's prediction
     */
    calculateWeights(predictions, method) {
        const models = Storage.getModels();

        switch(method) {
            case 'equal':
                return predictions.map(() => 1 / predictions.length);

            case 'performance':
                const accuracies = predictions.map(p => {
                    const modelData = models[p.model];
                    return modelData ? modelData.accuracy / 100 : 0.5;
                });
                const totalAccuracy = accuracies.reduce((a, b) => a + b, 0);
                return accuracies.map(acc => totalAccuracy > 0 ? acc / totalAccuracy : 1 / predictions.length);

            case 'confidence':
                const confidences = predictions.map(p => p.confidence);
                const totalConfidence = confidences.reduce((a, b) => a + b, 0);
                return confidences.map(conf => totalConfidence > 0 ? conf / totalConfidence : 1 / predictions.length);

            default:
                return predictions.map(() => 1 / predictions.length);
        }
    },

    /**
     * Run Monte Carlo simulation
     */
    runMonteCarloSimulation(predictions, iterations = 1000) {
        let wins = 0;

        for (let i = 0; i < iterations; i++) {
            // Simulate outcome based on model predictions
            const randomValue = Math.random();
            let cumulativeProbability = 0;

            for (const pred of predictions) {
                cumulativeProbability += pred.confidence / predictions.length;
                if (randomValue <= cumulativeProbability) {
                    if (Math.random() < pred.confidence) {
                        wins++;
                    }
                    break;
                }
            }
        }

        return {
            winProbability: wins / iterations,
            iterations,
            wins
        };
    },

    /**
     * Backtest strategy on historical data
     */
    backtest(startDate = null, endDate = null) {
        const trades = Storage.getTrades();
        let filteredTrades = trades;

        if (startDate) {
            filteredTrades = filteredTrades.filter(t => t.timestamp >= startDate);
        }
        if (endDate) {
            filteredTrades = filteredTrades.filter(t => t.timestamp <= endDate);
        }

        if (filteredTrades.length === 0) {
            return {
                totalTrades: 0,
                winRate: 0,
                profitFactor: 0,
                totalPnL: 0
            };
        }

        const wins = filteredTrades.filter(t => t.result === 'win').length;
        const losses = filteredTrades.filter(t => t.result === 'loss').length;
        
        const grossProfit = filteredTrades
            .filter(t => t.result === 'win')
            .reduce((sum, t) => sum + (t.payout - t.stake), 0);
        
        const grossLoss = filteredTrades
            .filter(t => t.result === 'loss')
            .reduce((sum, t) => sum + t.stake, 0);

        return {
            totalTrades: filteredTrades.length,
            wins,
            losses,
            winRate: (wins / filteredTrades.length) * 100,
            profitFactor: grossLoss > 0 ? grossProfit / grossLoss : 0,
grossProfit,
grossLoss,
totalPnL: grossProfit - grossLoss,
avgWin: wins > 0 ? grossProfit / wins : 0,
avgLoss: losses > 0 ? grossLoss / losses : 0
};
}
};
// Initialize analysis engine
if (typeof window !== 'undefined') {
Analysis.init();
}
// Export analysis
if (typeof module !== 'undefined' && module.exports) {
module.exports = Analysis;
}