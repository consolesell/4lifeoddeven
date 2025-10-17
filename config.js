// config.js - Centralized Configuration

const CONFIG = {
    // API Configuration
    api: {
        appId: '1089',
        wsUrl: 'wss://ws.derivws.com/websockets/v3',
        reconnectAttempts: 5,
        reconnectDelay: 3000,
        requestTimeout: 30000
    },

    // Trading Configuration
    trading: {
        baseStake: 0.35,
        minStake: 0.35,
        maxStake: 100,
        contractDuration: 1, // ticks
        contractType: 'DIGITEVEN', // or 'DIGITODD'
        minConfidence: 60, // percentage
        autoTrade: true,
        simulationMode: false,
        martingale: true,  // Enable/disable the martingale strategy
        martingaleFactor: 2,  // Multiplier (e.g., 2 doubles the stake after each loss; try 2.1 for a slight edge)
        initialStake: baseStake,  // Starting bet amount (in your base unit, like USD or crypto)
        maxMartingaleSteps: 3,  // Optional: Limit the number of consecutive doublings to avoid blowing the account
    // ...rest of your config
        adaptiveStaking: false
    },

    // Risk Management
    risk: {
        maxDailyLoss: 50,
        maxConsecutiveLosses: 5,
        cooldownPeriod: 15, // seconds
        stopLossPercentage: 10,
        takeProfitPercentage: 20,
        maxDrawdown: 30
    },

    // Model Configuration
    models: {
        statistical: {
            enabled: true,
            weight: 1.0,
            lookbackPeriod: 100,
            emaAlpha: 0.1
        },
        pattern: {
            enabled: true,
            weight: 1.0,
            minPatternLength: 3,
            maxPatternLength: 10,
            similarityThreshold: 0.7
        },
        ruleBased: {
            enabled: true,
            weight: 1.0,
            streakThreshold: 3,
            reversalConfidence: 0.7
        },
        reinforcementLearning: {
            enabled: false,
            weight: 0.5,
            learningRate: 0.1,
            discountFactor: 0.95,
            explorationRate: 0.1
        }
    },

    // Strategy Settings
    strategy: {
        type: 'moderate', // conservative, moderate, aggressive, custom
        weightMethod: 'performance', // equal, performance, confidence
        votingThreshold: 0.6,
        ensembleMethod: 'weighted' // voting, weighted, stacking
    },

    // UI Configuration
    ui: {
        theme: 'light', // light, dark
        chartUpdateInterval: 1000,
        historyDisplayLimit: 20,
        notificationsEnabled: true,
        soundEnabled: true,
        animationsEnabled: true
    },

    // Storage Configuration
    storage: {
        prefix: 'deriv_bot_',
        maxHistorySize: 1000,
        autoBackup: true,
        backupInterval: 3600000, // 1 hour in ms
        compressionEnabled: true
    },

    // Performance Tracking
    performance: {
        recalcInterval: 50, // trades
        metricsToTrack: ['winRate', 'profitFactor', 'sharpeRatio', 'maxDrawdown'],
        benchmarkSymbol: 'R_100'
    },

    // Symbols Configuration
    symbols: {
        'R_10': { name: 'Volatility 10 Index', volatility: 'low' },
        'R_25': { name: 'Volatility 25 Index', volatility: 'medium' },
        'R_50': { name: 'Volatility 50 Index', volatility: 'medium' },
        'R_75': { name: 'Volatility 75 Index', volatility: 'high' },
        'R_100': { name: 'Volatility 100 Index', volatility: 'high' }
    },

    // Logging Configuration
    logging: {
        enabled: true,
        level: 'info', // debug, info, warn, error
        console: true,
        storage: true
    }
};

// Strategy Presets
const STRATEGY_PRESETS = {
    conservative: {
        minConfidence: 75,
        maxConsecutiveLosses: 3,
        cooldownPeriod: 10,
        adaptiveStaking: false,
        models: {
            statistical: { weight: 1.5 },
            pattern: { weight: 1.0 },
            ruleBased: { weight: 0.5 }
        }
    },
    moderate: {
        minConfidence: 60,
        maxConsecutiveLosses: 10,
        cooldownPeriod: 15,
        adaptiveStaking: true,
        models: {
            statistical: { weight: 1.0 },
            pattern: { weight: 1.0 },
            ruleBased: { weight: 1.0 }
        }
    },
    aggressive: {
        minConfidence: 50,
        maxConsecutiveLosses: 7,
        cooldownPeriod: 2,
        adaptiveStaking: true,
        models: {
            statistical: { weight: 0.8 },
            pattern: { weight: 1.2 },
            ruleBased: { weight: 1.5 }
        }
    }
};

// Export configuration
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG, STRATEGY_PRESETS };
}
