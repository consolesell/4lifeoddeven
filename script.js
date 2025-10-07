// script.js - Main Application Logic

class DerivBot {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.isTrading = false;
    this.currentSymbol = null;
    this.authToken = null;
    this.tickBuffer = [];
    this.tradeQueue = [];
    this.lastTradeTime = 0;
    this.consecutiveLosses = 0;
    this.dailyLoss = 0;
    this.emergencyStop = false;
    this.charts = {};
    
    // Reconnection properties
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000; // Start with 1 second
    this.maxReconnectDelay = 30000; // Max 30 seconds
    this.reconnectTimer = null;
    this.isReconnecting = false;
    this.shouldReconnect = true;
    this.lastAppId = null;
    this.pingInterval = null;
    this.pongTimeout = null;
    this.connectionHealth = 100;
    this.missedPongs = 0;
    this.maxMissedPongs = 3;

    this.init();  
  }  

  /**  
   * Initialize the bot  
   */  
  init() {  
    Utils.log('Deriv Bot initializing...', 'info');  
    this.setupEventListeners();  
    this.setupCharts();  
    this.loadSavedSettings();  
    this.updateUI();  
    Utils.requestNotificationPermission();  
    Utils.log('Deriv Bot ready', 'info');  
  }  

  /**  
   * Setup event listeners  
   */  
  setupEventListeners() {  
    // Connection controls  
    document.getElementById('connectBtn').addEventListener('click', () => this.connect());  
    document.getElementById('emergencyStop').addEventListener('click', () => this.handleEmergencyStop());  

    // Navigation  
    document.querySelectorAll('.nav-btn').forEach(btn => {  
      btn.addEventListener('click', (e) => this.switchView(e.target.dataset.view));  
    });  

    // Theme toggle  
    document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());  

    // Notifications toggle  
    document.getElementById('notificationsToggle').addEventListener('click', () => this.toggleNotifications());  

    // Trade controls  
    document.getElementById('autoTrade').addEventListener('change', (e) => {  
      CONFIG.trading.autoTrade = e.target.checked;  
      this.updateUI();  
    });  

    document.getElementById('simulationMode').addEventListener('change', (e) => {  
      CONFIG.trading.simulationMode = e.target.checked;  
      this.updateUI();  
    });  

    document.getElementById('adaptiveStaking').addEventListener('change', (e) => {  
      CONFIG.trading.adaptiveStaking = e.target.checked;  
    });  

    document.getElementById('manualTrade').addEventListener('click', () => this.executeManualTrade());  

    // Confidence slider  
    const confidenceSlider = document.getElementById('minConfidence');  
    confidenceSlider.addEventListener('input', (e) => {  
      CONFIG.trading.minConfidence = parseInt(e.target.value);  
      document.getElementById('minConfidenceValue').textContent = `${e.target.value}%`;  
    });  

    // Base stake input  
    document.getElementById('baseStake').addEventListener('change', (e) => {  
      const stake = parseFloat(e.target.value);  
      if (Utils.validateStake(stake)) {  
        CONFIG.trading.baseStake = stake;  
      }  
    });  

    // Model toggles  
    ['statistical', 'pattern', 'ruleBased', 'RL'].forEach(model => {  
      const checkbox = document.getElementById(`model${model.charAt(0).toUpperCase() + model.slice(1)}`);  
      if (checkbox) {  
        checkbox.addEventListener('change', (e) => {  
          const modelKey = model === 'RL' ? 'reinforcementLearning' : model;  
          CONFIG.models[modelKey].enabled = e.target.checked;  
        });  
      }  
    });  

    // History controls  
    document.getElementById('exportCSV')?.addEventListener('click', () => this.exportHistory('csv'));  
    document.getElementById('clearHistory')?.addEventListener('click', () => this.clearHistory());  

    // Settings controls  
    document.getElementById('backupData')?.addEventListener('click', () => Storage.backupData());  
    document.getElementById('resetAll')?.addEventListener('click', () => this.resetAll());  

    // Filter controls  
    document.getElementById('filterType')?.addEventListener('change', () => this.updateHistoryTable());  
    document.getElementById('filterDate')?.addEventListener('change', () => this.updateHistoryTable());  

    // Strategy selector  
    document.getElementById('strategyType')?.addEventListener('change', (e) => {  
      this.applyStrategyPreset(e.target.value);  
    });  

    // Modal controls  
    document.querySelector('.modal-close')?.addEventListener('click', () => this.hideModal());  
    document.getElementById('modalConfirm')?.addEventListener('click', () => this.handleModalConfirm());  
    document.getElementById('modalCancel')?.addEventListener('click', () => this.hideModal());  
  }  

  /**  
   * Connect to Deriv WebSocket with reconnection support
   */  
  async connect() {  
    const appId = document.getElementById('appId').value.trim();  
    const token = document.getElementById('apiToken').value.trim();  
    const symbol = document.getElementById('symbol').value;  

    if (!appId) {  
      this.showModal('error', 'Validation Error', 'Please enter App ID');  
      return;  
    }  

    if (!token || !Utils.validateToken(token)) {  
      this.showModal('error', 'Validation Error', 'Please enter a valid API token');  
      return;  
    }  

    // Store credentials for reconnection
    this.lastAppId = appId;
    this.authToken = token;
    this.currentSymbol = symbol;
    this.shouldReconnect = true;
    
    this.establishConnection();
  }

  /**
   * Establish WebSocket connection
   */
  establishConnection() {
    if (this.isReconnecting) {
      Utils.log('Connection attempt already in progress', 'debug');
      return;
    }

    this.isReconnecting = true;
    this.showLoading('Connecting to Deriv...');  

    try {  
      const wsUrl = `${CONFIG.api.wsUrl}?app_id=${this.lastAppId}`;  
      
      // Close existing connection if any
      if (this.ws) {
        this.cleanupConnection();
      }
      
      this.ws = new WebSocket(wsUrl);  

      this.ws.onopen = () => {  
        Utils.log('WebSocket connected', 'info');  
        this.onConnectionOpen();
      };  

      this.ws.onmessage = (msg) => this.handleMessage(msg);  

      this.ws.onerror = (error) => {  
        Utils.log('WebSocket error', 'error', error);  
        this.handleConnectionError(error);
      };  

      this.ws.onclose = (event) => {  
        Utils.log('WebSocket closed', 'info', { 
          code: event.code, 
          reason: event.reason,
          wasClean: event.wasClean 
        });  
        this.handleConnectionClose(event);
      };  

    } catch (error) {  
      Utils.log('Connection failed', 'error', error);  
      this.hideLoading();  
      this.handleConnectionError(error);
    }  
  }

  /**
   * Handle successful connection
   */
  onConnectionOpen() {
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
    this.connectionHealth = 100;
    this.missedPongs = 0;
    
    // Clear any reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Start connection health monitoring
    this.startHeartbeat();
    
    // Authorize
    this.authorize(this.authToken, this.currentSymbol);
    
    Utils.log('Connection established successfully', 'info');
  }

  /**
   * Handle connection error
   */
  handleConnectionError(error) {
    this.hideLoading();
    this.connectionHealth = Math.max(0, this.connectionHealth - 20);
    
    if (!this.shouldReconnect || this.emergencyStop) {
      this.showModal('error', 'Connection Error', 'Failed to connect to Deriv API');
      return;
    }
    
    this.attemptReconnection('Connection error occurred');
  }

  /**
   * Handle connection close
   */
  handleConnectionClose(event) {
    this.isReconnecting = false;
    this.stopHeartbeat();
    
    // Don't reconnect if it was a clean close or emergency stop
    if (event.wasClean || !this.shouldReconnect || this.emergencyStop) {
      this.handleDisconnect();
      return;
    }
    
    // Determine if we should attempt reconnection
    const shouldAttemptReconnect = 
      event.code !== 1000 && // Normal closure
      event.code !== 1001 && // Going away
      this.reconnectAttempts < this.maxReconnectAttempts;
    
    if (shouldAttemptReconnect) {
      this.attemptReconnection(`Connection closed (code: ${event.code})`);
    } else {
      this.handleDisconnect();
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.showModal('error', 'Connection Failed', 
          `Failed to reconnect after ${this.maxReconnectAttempts} attempts. Please check your connection and try again.`);
      }
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  attemptReconnection(reason) {
    if (!this.shouldReconnect || this.emergencyStop) {
      return;
    }
    
    this.reconnectAttempts++;
    
    // Calculate delay with exponential backoff and jitter
    const baseDelay = Math.min(
      this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    const delay = baseDelay + jitter;
    
    Utils.log(
      `Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${Math.round(delay/1000)}s`, 
      'warn',
      { reason }
    );
    
    // Update UI with reconnection status
    this.updateConnectionStatus(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    // Show notification for first reconnection attempt
    if (this.reconnectAttempts === 1) {
      Utils.notify('Connection Lost', 'Attempting to reconnect...', 'warning');
    }
    
    // Clear existing timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    // Schedule reconnection
    this.reconnectTimer = setTimeout(() => {
      Utils.log(`Executing reconnection attempt ${this.reconnectAttempts}`, 'info');
      this.establishConnection();
    }, delay);
  }

  /**
   * Start heartbeat/ping mechanism
   */
  startHeartbeat() {
    this.stopHeartbeat();
    
    // Send ping every 30 seconds
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendPing();
      }
    }, 30000);
    
    Utils.log('Heartbeat monitoring started', 'debug');
  }

  /**
   * Stop heartbeat monitoring
   */
  stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  /**
   * Send ping to server
   */
  sendPing() {
    try {
      this.sendMessage({ ping: 1 });
      
      // Set timeout for pong response
      this.pongTimeout = setTimeout(() => {
        this.missedPongs++;
        this.connectionHealth = Math.max(0, this.connectionHealth - 15);
        
        Utils.log(`Missed pong response (${this.missedPongs}/${this.maxMissedPongs})`, 'warn');
        
        if (this.missedPongs >= this.maxMissedPongs) {
          Utils.log('Connection appears unhealthy, forcing reconnection', 'error');
          this.forceReconnect('Too many missed pong responses');
        }
      }, 10000); // Wait 10 seconds for pong
      
    } catch (error) {
      Utils.log('Failed to send ping', 'error', error);
    }
  }

  /**
   * Handle pong response
   */
  handlePong() {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
    
    this.missedPongs = 0;
    this.connectionHealth = Math.min(100, this.connectionHealth + 5);
    
    Utils.log('Pong received, connection healthy', 'debug');
  }

  /**
   * Force reconnection
   */
  forceReconnect(reason) {
    Utils.log('Forcing reconnection', 'warn', { reason });
    
    this.cleanupConnection();
    
    if (this.shouldReconnect && !this.emergencyStop) {
      this.attemptReconnection(reason);
    }
  }

  /**
   * Cleanup connection resources
   */
  cleanupConnection() {
    this.stopHeartbeat();
    
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close(1000, 'Client cleanup');
        }
      } catch (error) {
        Utils.log('Error during connection cleanup', 'error', error);
      }
      
      this.ws = null;
    }
  }

  /**
   * Update connection status in UI
   */
  updateConnectionStatus(status) {
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl) {
      statusEl.textContent = status;
      
      // Update class based on connection health
      if (this.connectionHealth > 70) {
        statusEl.className = 'status-badge connected';
      } else if (this.connectionHealth > 30) {
        statusEl.className = 'status-badge warning';
      } else {
        statusEl.className = 'status-badge disconnected';
      }
    }
  }

  /**  
   * Authorize with API token  
   */  
  authorize(token, symbol) {  
    this.authToken = token;  
    this.currentSymbol = symbol;  
      
    this.sendMessage({  
      authorize: token  
    });  
  }  

  /**  
   * Handle incoming WebSocket messages  
   */  
  handleMessage(msg) {  
    try {  
      const data = JSON.parse(msg.data);  
      Utils.log('Received message', 'debug', data);  

      if (data.error) {  
        this.handleError(data.error);  
        return;  
      }  

      switch(data.msg_type) {  
        case 'authorize':  
          this.handleAuthorize(data);  
          break;  
        case 'tick':  
          this.handleTick(data.tick);  
          break;  
        case 'buy':  
          this.handleBuyResponse(data);  
          break;  
        case 'proposal_open_contract':  
          this.handleContractUpdate(data);  
          break;
        case 'ping':
          this.handlePong();
          break;
        default:  
          Utils.log(`Unhandled message type: ${data.msg_type}`, 'debug');  
      }  
    } catch (error) {  
      Utils.log('Failed to parse message', 'error', error);  
    }  
  }  

  /**  
   * Handle authorization response  
   */  
  handleAuthorize(data) {  
    this.hideLoading();  
    this.isConnected = true;  
      
    Utils.log('Authorized successfully', 'info', data.authorize);  
    Utils.notify('Connected', 'Successfully connected to Deriv', 'success');  

    // Update UI  
    this.updateConnectionStatus('Connected');
    document.getElementById('connectBtn').disabled = true;  

    // Subscribe to ticks  
    this.subscribeTicks(this.currentSymbol);
    
    // Notify successful reconnection if this was a reconnect
    if (this.reconnectAttempts > 0) {
      Utils.notify('Reconnected', 'Connection restored successfully', 'success');
      this.reconnectAttempts = 0;
    }
  }  

  /**  
   * Subscribe to tick stream  
   */  
  subscribeTicks(symbol) {  
    this.sendMessage({  
      ticks: symbol,  
      subscribe: 1  
    });  
    Utils.log(`Subscribed to ${symbol}`, 'info');  
  }  

  /**  
   * Handle tick data  
   */  
  async handleTick(tick) {  
    // Save tick to storage  
    const tickData = Storage.saveTick(tick);  
      
    if (!tickData) return;  

    // Update UI  
    this.updateTickDisplay(tickData);  
    this.updateCharts(tickData);  

    // Add to buffer  
    this.tickBuffer.push(tickData);  

    // Run prediction engine  
    if (this.tickBuffer.length >= 20 && !this.emergencyStop) {  
      const prediction = Analysis.predict(this.tickBuffer);  
      this.updatePredictionDisplay(prediction);  

      // Auto-trade if enabled  
      if (CONFIG.trading.autoTrade && prediction.shouldTrade) {  
        await this.executeTrade(prediction);  
      }  
    }  

    // Dispatch custom event  
    window.dispatchEvent(new CustomEvent('tickReceived', { detail: tickData }));  
  }  

  /**  
   * Update tick display in UI  
   */  
  updateTickDisplay(tick) {  
    document.getElementById('currentDigit').textContent = tick.digit;  
    document.getElementById('currentQuote').textContent = tick.quote.toFixed(4);  
    document.getElementById('tickTime').textContent = Utils.formatTime(tick.timestamp);  
      
    const label = document.getElementById('digitLabel');  
    label.textContent = tick.isEven ? 'EVEN' : 'ODD';  
    label.className = `digit-label ${tick.isEven ? 'even' : 'odd'}`;  

    // Update volatility  
    const volatility = Utils.calculateVolatility(this.tickBuffer, 20);  
    document.getElementById('volatility').textContent = (volatility * 100).toFixed(2) + '%';  

    // Update history display  
    this.updateDigitHistory(tick);  
  }  

  /**  
   * Update digit history display  
   */  
  updateDigitHistory(tick) {  
    const historyContainer = document.getElementById('digitHistory');  
    const digitEl = document.createElement('div');  
    digitEl.className = `history-digit ${tick.isEven ? 'even' : 'odd'}`;  
    digitEl.textContent = tick.digit;  
      
    historyContainer.insertBefore(digitEl, historyContainer.firstChild);  

    // Keep only last 20  
    while (historyContainer.children.length > 20) {  
      historyContainer.removeChild(historyContainer.lastChild);  
    }  
  }  

  /**  
   * Update prediction display  
   */  
  updatePredictionDisplay(prediction) {  
    document.getElementById('predictionValue').textContent = prediction.finalPrediction || '-';  
    document.getElementById('confidenceText').textContent =   
      `${(prediction.confidence * 100).toFixed(1)}%`;  
      
    const confidenceFill = document.getElementById('confidenceFill');  
    confidenceFill.style.width = `${prediction.confidence * 100}%`;  

    document.getElementById('tradeReason').textContent = prediction.reason;  

    // Update model breakdown  
    const modelVotesContainer = document.getElementById('modelVotes');  
    modelVotesContainer.innerHTML = '';  

    prediction.modelBreakdown?.forEach(model => {  
      const voteEl = document.createElement('div');  
      voteEl.className = 'model-vote';  
      voteEl.innerHTML = `  
        <span class="model-name">${model.model}</span>  
        <span class="model-prediction ${model.prediction?.toLowerCase() || 'neutral'}">  
          ${model.prediction || 'N/A'} (${(model.confidence * 100).toFixed(0)}%)  
        </span>  
      `;  
      modelVotesContainer.appendChild(voteEl);  
    });  

    // Enable/disable manual trade button  
    document.getElementById('manualTrade').disabled = !prediction.shouldTrade || this.emergencyStop;  
  }  

  /**  
   * Execute trade  
   */  
  async executeTrade(prediction) {  
    // Check if connected
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      Utils.log('Cannot execute trade: not connected', 'warn');
      return;
    }
    
    // Check risk management rules  
    if (!this.checkRiskManagement()) {  
      Utils.log('Trade blocked by risk management', 'warn');  
      return;  
    }  

    // Check cooldown period  
    const now = Date.now();  
    if (now - this.lastTradeTime < CONFIG.risk.cooldownPeriod * 1000) {  
      Utils.log('Trade blocked by cooldown period', 'warn');  
      return;  
    }  

    // Calculate stake  
    const stake = this.calculateStake();  

    if (!Utils.validateStake(stake)) {  
      Utils.log('Invalid stake amount', 'error');  
      return;  
    }  

    // Simulation mode  
    if (CONFIG.trading.simulationMode) {  
      this.simulateTrade(prediction, stake);  
      return;  
    }  

    // Send buy request  
    const contractType = prediction.finalPrediction === 'EVEN' ? 'DIGITEVEN' : 'DIGITODD';  
      
    this.showLoading('Placing trade...');  

    try {  
      this.sendMessage({  
        buy: 1,  
        subscribe: 1,  
        price: stake,  
        parameters: {  
          amount: stake,  
          basis: 'stake',  
          contract_type: contractType,  
          currency: 'USD',  
          duration: CONFIG.trading.contractDuration,  
          duration_unit: 't',  
          symbol: this.currentSymbol  
        }  
      });  

      this.lastTradeTime = now;  
      Utils.log('Trade executed', 'info', { prediction: prediction.finalPrediction, stake });  

    } catch (error) {  
      this.hideLoading();  
      Utils.log('Trade execution failed', 'error', error);  
      this.showModal('error', 'Trade Failed', error.message);  
    }  
  }  

  /**  
   * Execute manual trade  
   */  
  executeManualTrade() {  
    const predictionValue = document.getElementById('predictionValue').textContent;  
    if (predictionValue === '-') {  
      this.showModal('warning', 'No Prediction', 'Wait for a prediction before trading manually');  
      return;  
    }  

    const confidence = parseFloat(document.getElementById('confidenceText').textContent) / 100;  
    const prediction = {  
      finalPrediction: predictionValue,  
      confidence,  
      shouldTrade: true,  
      reason: 'Manual trade executed by user'  
    };  

    this.executeTrade(prediction);  
  }  

  /**  
   * Handle buy response  
   */  
  handleBuyResponse(data) {  
    this.hideLoading();  

    if (data.buy) {  
      Utils.log('Contract purchased', 'info', data.buy);  
      Utils.notify('Trade Placed', `Contract ID: ${data.buy.contract_id}`, 'success');  
      Utils.playSound('success');  

      // Subscribe to contract updates  
      this.sendMessage({  
        proposal_open_contract: 1,  
        contract_id: data.buy.contract_id,  
        subscribe: 1  
      });  
    }  
  }  

  /**  
   * Handle contract updates  
   */  
  handleContractUpdate(data) {  
    const contract = data.proposal_open_contract;  
      
    if (contract.is_sold) {  
      this.handleContractSettlement(contract);  
    }  
  }  

  /**  
   * Handle contract settlement  
   */  
  handleContractSettlement(contract) {  
    const stake = parseFloat(contract.buy_price);  
    const payout = parseFloat(contract.sell_price) || 0;  
    const profit = payout - stake;  
    const result = profit > 0 ? 'win' : 'loss';  

    // Save trade  
    const trade = {  
      contractId: contract.contract_id,  
      contractType: contract.contract_type,  
      stake,  
      payout,  
      profit,  
      result,  
      prediction: contract.contract_type.includes('EVEN') ? 'EVEN' : 'ODD',  
      actualDigit: contract.exit_tick,  
      confidence: parseFloat(document.getElementById('confidenceText').textContent) / 100  
    };  

    Storage.saveTrade(trade);  

    // Update consecutive losses  
    if (result === 'loss') {  
      this.consecutiveLosses++;  
      this.dailyLoss += stake;  
    } else {  
      this.consecutiveLosses = 0;  
    }  

    // Update RL model if enabled  
    if (CONFIG.models.reinforcementLearning.enabled && this.tickBuffer.length > 5) {  
      const state = Analysis.getState(this.tickBuffer.slice(-5));  
      const action = trade.prediction;  
      const reward = result === 'win' ? 1 : -1;  
      const newState = Analysis.getState(this.tickBuffer);  
      Analysis.updateQLearning(state, action, reward, newState);  
    }  

    // Update UI  
    this.updateStatsDisplay();  
    this.updateHistoryTable();  

    // Notifications  
    if (result === 'win') {  
      Utils.notify('Trade Won! 🎉', `Profit: ${Utils.formatCurrency(profit)}`, 'success');  
      Utils.playSound('success');  
    } else {  
      Utils.notify('Trade Lost', `Loss: ${Utils.formatCurrency(stake)}`, 'error');  
      Utils.playSound('error');  
    }  

    Utils.log('Contract settled', 'info', trade);  

    // Dispatch event  
    window.dispatchEvent(new CustomEvent('tradeCompleted', { detail: trade }));  
  }  

  /**  
   * Simulate trade (for testing)  
   */  
  simulateTrade(prediction, stake) {  
    const actualDigit = this.tickBuffer[this.tickBuffer.length - 1].digit;  
    const actualIsEven = actualDigit % 2 === 0;  
    const predictedIsEven = prediction.finalPrediction === 'EVEN';  
      
    const result = actualIsEven === predictedIsEven ? 'win' : 'loss';  
    const payout = result === 'win' ? stake * 1.95 : 0;  
    const profit = payout - stake;  

    const trade = {  
      contractId: 'SIM_' + Utils.generateId(),  
      contractType: prediction.finalPrediction,  
      stake,  
      payout,  
      profit,  
      result,  
      prediction: prediction.finalPrediction,  
      actualDigit,  
      confidence: prediction.confidence,  
      simulated: true  
    };  

    Storage.saveTrade(trade);  

    if (result === 'loss') {  
      this.consecutiveLosses++;  
    } else {  
      this.consecutiveLosses = 0;  
    }  

    this.updateStatsDisplay();  
    this.updateHistoryTable();  

    Utils.notify(  
      result === 'win' ? 'Simulated Win' : 'Simulated Loss',  
      `${result === 'win' ? 'Profit' : 'Loss'}: ${Utils.formatCurrency(Math.abs(profit))}`,  
      result  
    );  

    Utils.log('Simulated trade completed', 'info', trade);  
  }  

  /**  
   * Calculate stake with adaptive sizing  
   */  
  calculateStake() {  
    let stake = CONFIG.trading.baseStake;  

    if (CONFIG.trading.adaptiveStaking) {  
      const performance = Storage.getPerformance();  
      const winRate = performance.winRate / 100;  

      if (winRate > 0.5) {  
        // Use Kelly Criterion  
        const edge = winRate - 0.5;  
        const kelly = Utils.calculateKellyCriterion(winRate, 1.95, edge);  
        stake = CONFIG.trading.baseStake * (1 + kelly * 2); // Conservative Kelly  
      } else if (this.consecutiveLosses > 2) {  
        // Reduce stake after losses  
        stake = CONFIG.trading.baseStake * 0.5;  
      }  
    }  

    // Enforce limits  
    stake = Math.max(CONFIG.trading.minStake, Math.min(stake, CONFIG.trading.maxStake));  
      
    return parseFloat(stake.toFixed(2));  
  }  

  /**  
   * Check risk management rules  
   */  
  checkRiskManagement() {  
    // Check emergency stop  
    if (this.emergencyStop) {  
      return false;  
    }  

    // Check consecutive losses  
    if (this.consecutiveLosses >= CONFIG.risk.maxConsecutiveLosses) {  
      this.showModal('warning','Risk Limit Reached',   
        `Max consecutive losses (${CONFIG.risk.maxConsecutiveLosses}) reached. Trading paused.`);  
      CONFIG.trading.autoTrade = false;  
      document.getElementById('autoTrade').checked = false;  
      return false;  
    }  

    // Check daily loss limit  
    if (this.dailyLoss >= CONFIG.risk.maxDailyLoss) {  
      this.showModal('warning', 'Daily Loss Limit',   
        `Daily loss limit of ${Utils.formatCurrency(CONFIG.risk.maxDailyLoss)} reached. Trading paused.`);  
      CONFIG.trading.autoTrade = false;  
      document.getElementById('autoTrade').checked = false;  
      return false;  
    }  

    return true;  
  }  

  /**  
   * Handle emergency stop  
   */  
  handleEmergencyStop() {  
    this.emergencyStop = true;  
    this.shouldReconnect = false;
    CONFIG.trading.autoTrade = false;  
    document.getElementById('autoTrade').checked = false;  
      
    this.showModal('warning', 'Emergency Stop Activated',   
      'All trading has been stopped. Reconnect to resume.');  
      
    Utils.notify('Emergency Stop', 'Trading stopped by user', 'warning');  
    Utils.log('Emergency stop activated', 'warn');
    
    // Disconnect WebSocket
    this.disconnect();
  }  

  /**
   * Manual disconnect
   */
  disconnect() {
    this.shouldReconnect = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.cleanupConnection();
    this.handleDisconnect();
  }

  /**  
   * Update stats display  
   */  
  updateStatsDisplay() {  
    const performance = Storage.getPerformance();  

    document.getElementById('totalTrades').textContent = performance.totalTrades;  
    document.getElementById('winCount').textContent = performance.wins;  
    document.getElementById('lossCount').textContent = performance.losses;  
    document.getElementById('winRate').textContent = `${performance.winRate.toFixed(1)}%`;  
    document.getElementById('totalPnL').textContent = Utils.formatCurrency(performance.totalPnL);  
    document.getElementById('accuracy').textContent = `${performance.winRate.toFixed(1)}%`;  

    // Update chart  
    this.updateModelChart();  
  }  

  /**  
   * Update history table  
   */  
  updateHistoryTable() {  
    const filterType = document.getElementById('filterType')?.value || 'all';  
    const filterDate = document.getElementById('filterDate')?.value || null;  

    const trades = Storage.getFilteredTrades({ type: filterType, date: filterDate });  
    const tbody = document.getElementById('historyTableBody');  
      
    if (!tbody) return;  

    tbody.innerHTML = '';  

    trades.slice(-50).reverse().forEach(trade => {  
      const row = tbody.insertRow();  
      row.innerHTML = `  
        <td>${Utils.formatDateTime(trade.timestamp / 1000)}</td>  
        <td>${trade.contractType || trade.prediction}</td>  
        <td>${Utils.formatCurrency(trade.stake)}</td>  
        <td>${trade.prediction}</td>  
        <td><span class="trade-result ${trade.result}">${trade.result.toUpperCase()}</span></td>  
        <td class="${trade.profit >= 0 ? 'text-success' : 'text-danger'}">  
          ${Utils.formatCurrency(trade.profit)}  
        </td>  
        <td>${(trade.confidence * 100).toFixed(1)}%</td>  
      `;  
    });  
  }  

  /**  
   * Setup charts  
   */  
  setupCharts() {  
    // Tick chart  
    const tickCtx = document.getElementById('tickChart')?.getContext('2d');  
    if (tickCtx) {  
      this.charts.tick = new Chart(tickCtx, {  
        type: 'line',  
        data: {  
          labels: [],  
          datasets: [{  
            label: 'Digit Stream',  
            data: [],  
            borderColor: 'rgb(102, 126, 234)',  
            backgroundColor: 'rgba(102, 126, 234, 0.1)',  
            tension: 0.4  
          }]  
        },  
        options: {  
          responsive: true,  
          maintainAspectRatio: false,  
          scales: {  
            y: { min: 0, max: 9 }  
          },  
          plugins: {  
            legend: { display: false }  
          }  
        }  
      });  
    }  

    // Model performance chart  
    const modelCtx = document.getElementById('modelChart')?.getContext('2d');  
    if (modelCtx) {  
      this.charts.model = new Chart(modelCtx, {  
        type: 'bar',  
        data: {  
          labels: ['Statistical', 'Pattern', 'Rule-Based', 'RL'],  
          datasets: [{  
            label: 'Accuracy (%)',  
            data: [0, 0, 0, 0],  
            backgroundColor: [  
              'rgba(102, 126, 234, 0.8)',  
              'rgba(16, 185, 129, 0.8)',  
              'rgba(245, 158, 11, 0.8)',  
              'rgba(239, 68, 68, 0.8)'  
            ]  
          }]  
        },  
        options: {  
          responsive: true,  
          maintainAspectRatio: false,  
          scales: {  
            y: { min: 0, max: 100 }  
          }  
        }  
      });  
    }  
  }  

  /**  
   * Update charts with new data  
   */  
  updateCharts(tick) {  
    if (this.charts.tick) {  
      const chart = this.charts.tick;  
      chart.data.labels.push(Utils.formatTime(tick.timestamp));  
      chart.data.datasets[0].data.push(tick.digit);  

      // Keep only last 50 points  
      if (chart.data.labels.length > 50) {  
        chart.data.labels.shift();  
        chart.data.datasets[0].data.shift();  
      }  

      chart.update('none'); // Update without animation for performance  
    }  
  }  

  /**  
   * Update model performance chart  
   */  
  updateModelChart() {  
    if (this.charts.model) {  
      const models = Storage.getModels();  
      this.charts.model.data.datasets[0].data = [  
        models.statistical?.accuracy || 0,  
        models.pattern?.accuracy || 0,  
        models.ruleBased?.accuracy || 0,  
        models.reinforcementLearning?.accuracy || 0  
      ];  
      this.charts.model.update();  
    }  
  }  

  /**  
   * Send message through WebSocket with retry capability
   */  
  sendMessage(message) {  
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {  
      try {
        this.ws.send(JSON.stringify(message));  
        Utils.log('Sent message', 'debug', message);
      } catch (error) {
        Utils.log('Failed to send message', 'error', error);
        
        // Check if we need to reconnect
        if (this.shouldReconnect && !this.emergencyStop) {
          this.forceReconnect('Failed to send message');
        }
      }
    } else {  
      Utils.log('WebSocket not connected, cannot send message', 'warn');
      
      // Attempt to reconnect if appropriate
      if (this.shouldReconnect && !this.emergencyStop && !this.isReconnecting) {
        Utils.log('Attempting to reconnect to send message', 'info');
        this.attemptReconnection('WebSocket not connected');
      }
    }  
  }  

  /**  
   * Handle disconnect  
   */  
  handleDisconnect() {  
    this.isConnected = false;  
    this.isTrading = false;  
    
    if (!this.emergencyStop) {
      this.emergencyStop = false;
    }

    this.updateConnectionStatus('Disconnected');
    document.getElementById('connectBtn').disabled = false;  

    Utils.notify('Disconnected', 'Connection to Deriv closed', 'info');  
    
    // Disable auto-trading when disconnected
    if (CONFIG.trading.autoTrade) {
      CONFIG.trading.autoTrade = false;
      document.getElementById('autoTrade').checked = false;
      Utils.log('Auto-trading disabled due to disconnection', 'warn');
    }
  }  

  /**  
   * Handle errors  
   */  
  handleError(error) {  
    Utils.log('API Error', 'error', error);  
    this.showModal('error', 'API Error', error.message);  
      
    if (error.code === 'InvalidToken') {  
      this.shouldReconnect = false;
      this.handleDisconnect();  
    } else if (error.code === 'DisconnectClientError') {
      // Server is asking us to disconnect
      this.shouldReconnect = false;
      this.disconnect();
    } else if (error.code === 'RateLimit') {
      // Rate limited - wait before reconnecting
      Utils.log('Rate limited, will retry after delay', 'warn');
      this.reconnectDelay = Math.max(this.reconnectDelay, 5000);
    }
  }  

  /**  
   * Export history  
   */  
  exportHistory(format) {  
    const trades = Storage.getTrades();  
    if (trades.length === 0) {  
      this.showModal('info', 'No Data', 'No trade history to export');  
      return;  
    }  

    if (format === 'csv') {  
      Utils.exportToCSV(trades, 'deriv_bot_history');  
    } else {  
      Utils.exportToJSON(trades, 'deriv_bot_history');  
    }  

    Utils.notify('Export Complete', `History exported as ${format.toUpperCase()}`, 'success');  
  }  

  /**  
   * Clear history  
   */  
  clearHistory() {  
    this.showModal('confirm', 'Clear History',   
      'Are you sure you want to clear all trade history? This cannot be undone.',  
      () => {  
        Storage.clearAll();  
        this.updateStatsDisplay();  
        this.updateHistoryTable();  
        Utils.notify('History Cleared', 'All data has been cleared', 'success');  
      }  
    );  
  }  

  /**  
   * Reset all data  
   */  
  resetAll() {  
    this.showModal('confirm', 'Reset Everything',   
      'This will clear ALL data including settings, history, and model performance. Continue?',  
      () => {  
        Storage.clearAll();  
        localStorage.clear();  
        location.reload();  
      }  
    );  
  }  

  /**  
   * Apply strategy preset  
   */  
  applyStrategyPreset(preset) {  
    if (STRATEGY_PRESETS[preset]) {  
      const settings = STRATEGY_PRESETS[preset];  
      CONFIG.trading.minConfidence = settings.minConfidence;  
      CONFIG.risk.maxConsecutiveLosses = settings.maxConsecutiveLosses;  
      CONFIG.risk.cooldownPeriod = settings.cooldownPeriod;  
      CONFIG.trading.adaptiveStaking = settings.adaptiveStaking;  

      // Update UI  
      document.getElementById('minConfidence').value = settings.minConfidence;  
      document.getElementById('minConfidenceValue').textContent = `${settings.minConfidence}%`;  

      Utils.notify('Strategy Applied', `${preset.charAt(0).toUpperCase() + preset.slice(1)} strategy activated`, 'success');  
    }  
  }  

  /**  
   * Switch view  
   */  
  switchView(viewName) {  
    document.querySelectorAll('.view-panel').forEach(panel => {  
      panel.classList.remove('active');  
    });  
    document.querySelectorAll('.nav-btn').forEach(btn => {  
      btn.classList.remove('active');  
    });  

    document.getElementById(`${viewName}View`).classList.add('active');  
    event.target.classList.add('active');  

    // Load view-specific data  
    if (viewName === 'history') {  
      this.updateHistoryTable();  
    } else if (viewName === 'models') {  
      this.updateModelAnalytics();  
    }  
  }  

  /**  
   * Update model analytics view  
   */  
  updateModelAnalytics() {  
    const models = Storage.getModels();  
    const container = document.getElementById('modelAnalytics');  
      
    if (!container) return;  

    container.innerHTML = '';  

    Object.entries(models).forEach(([name, data]) => {  
      const statDiv = document.createElement('div');  
      statDiv.className = 'model-stat';  
      statDiv.innerHTML = `
        <h4>${name.charAt(0).toUpperCase() + name.slice(1)}</h4>
        <div class="model-stat-value">${data.accuracy?.toFixed(1) || 0}%</div>
        <div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.5rem;">
          ${data.predictions || 0} predictions | ${data.correct || 0} correct
        </div>
      `;
      container.appendChild(statDiv);
    });
  }

  /** 
   * Toggle theme 
   */ 
  toggleTheme() { 
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light'; 
    const newTheme = currentTheme === 'light' ? 'dark' : 'light'; 

    document.documentElement.setAttribute('data-theme', newTheme); 
    CONFIG.ui.theme = newTheme; 
    Storage.saveSettings(CONFIG); 

    Utils.notify('Theme Changed', `Switched to ${newTheme} mode`, 'info'); 
  } 

  /** 
   * Toggle notifications 
   */ 
  toggleNotifications() { 
    CONFIG.ui.notificationsEnabled = !CONFIG.ui.notificationsEnabled; 
    Storage.saveSettings(CONFIG); 

    const status = CONFIG.ui.notificationsEnabled ? 'enabled' : 'disabled'; 
    Utils.notify('Notifications', `Notifications ${status}`, 'info'); 
  } 

  /** 
   * Show modal 
   */ 
  showModal(type, title, message, confirmCallback = null) { 
    const modal = document.getElementById('alertModal'); 
    const modalIcon = document.getElementById('modalIcon'); 
    const modalTitle = document.getElementById('modalTitle'); 
    const modalMessage = document.getElementById('modalMessage'); 
    const confirmBtn = document.getElementById('modalConfirm'); 
    const cancelBtn = document.getElementById('modalCancel'); 

    // Set icon based on type 
    const icons = { 
      success: '✅', 
      error: '❌', 
      warning: '⚠️', 
      info: 'ℹ️', 
      confirm: '❓' 
    }; 
    modalIcon.textContent = icons[type] || icons.info; 

    modalTitle.textContent = title; 
    modalMessage.textContent = message; 

    // Handle confirm callback 
    if (confirmCallback) { 
      this.modalConfirmCallback = confirmCallback; 
      cancelBtn.style.display = 'block'; 
      confirmBtn.textContent = 'Confirm'; 
    } else { 
      this.modalConfirmCallback = null; 
      cancelBtn.style.display = 'none'; 
      confirmBtn.textContent = 'OK'; 
    } 

    modal.classList.add('active'); 
  } 

  /** 
   * Hide modal 
   */ 
  hideModal() { 
    const modal = document.getElementById('alertModal'); 
    modal.classList.remove('active'); 
    this.modalConfirmCallback = null; 
  } 

  /** 
   * Handle modal confirm 
   */ 
  handleModalConfirm() { 
    if (this.modalConfirmCallback) { 
      this.modalConfirmCallback(); 
    } 
    this.hideModal(); 
  } 

  /** 
   * Show loading overlay 
   */ 
  showLoading(message = 'Loading...') { 
    const overlay = document.getElementById('loadingOverlay'); 
    overlay.querySelector('p').textContent = message; 
    overlay.classList.add('active'); 
  } 

  /** 
   * Hide loading overlay 
   */ 
  hideLoading() { 
    const overlay = document.getElementById('loadingOverlay'); 
    overlay.classList.remove('active'); 
  } 

  /** 
   * Load saved settings 
   */ 
  loadSavedSettings() { 
    const savedSettings = Storage.getSettings(); 
    if (savedSettings && savedSettings.trading) { 
      Object.assign(CONFIG, savedSettings); 

      // Apply to UI   
      document.getElementById('baseStake').value = CONFIG.trading.baseStake;   
      document.getElementById('minConfidence').value = CONFIG.trading.minConfidence;   
      document.getElementById('minConfidenceValue').textContent = `${CONFIG.trading.minConfidence}%`;   
      document.getElementById('autoTrade').checked = CONFIG.trading.autoTrade;   
      document.getElementById('simulationMode').checked = CONFIG.trading.simulationMode;   
      document.getElementById('adaptiveStaking').checked = CONFIG.trading.adaptiveStaking;   

      // Apply theme   
      document.documentElement.setAttribute('data-theme', CONFIG.ui.theme); 

    } 
  } 

  /** 
   * Update UI with current state 
   */ 
  updateUI() { 
    this.updateStatsDisplay(); 
    this.updateHistoryTable(); 

    // Update trade controls state 
    const autoTradeLabel = document.getElementById('autoTrade').parentElement; 
    if (CONFIG.trading.autoTrade) { 
      autoTradeLabel.style.fontWeight = 'bold'; 
    } else { 
      autoTradeLabel.style.fontWeight = 'normal'; 
    } 

    // Update simulation mode indicator 
    if (CONFIG.trading.simulationMode) { 
      document.querySelector('.brand-text').textContent = 'Deriv AI Bot (SIMULATION)'; 
    } else { 
      document.querySelector('.brand-text').textContent = 'Deriv AI Bot'; 
    } 
    
    // Update connection health indicator if element exists
    const healthIndicator = document.getElementById('connectionHealth');
    if (healthIndicator) {
      healthIndicator.textContent = `${this.connectionHealth}%`;
      healthIndicator.style.color = this.connectionHealth > 70 ? '#10b981' : 
                                    this.connectionHealth > 30 ? '#f59e0b' : '#ef4444';
    }
  } 

  /**
   * Get connection status info
   */
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      isReconnecting: this.isReconnecting,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      connectionHealth: this.connectionHealth,
      shouldReconnect: this.shouldReconnect,
      wsReadyState: this.ws ? this.ws.readyState : null
    };
  }

  /** 
   * Cleanup and destroy 
   */ 
  destroy() {
    Utils.log('Destroying bot instance', 'info');
    
    // Disable reconnection
    this.shouldReconnect = false;
    
    // Clear timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Cleanup connection
    this.cleanupConnection();

    // Destroy charts 
    Object.values(this.charts).forEach(chart => { 
      if (chart) chart.destroy(); 
    }); 

    Utils.log('Bot destroyed', 'info'); 
  } 
} 

// Initialize bot when DOM is ready 
let bot; 
document.addEventListener('DOMContentLoaded', () => { 
  bot = new DerivBot(); 
  
  // Auto-save settings periodically 
  setInterval(() => { 
    Storage.saveSettings(CONFIG); 
  }, 60000); // Every minute 

  // Reset daily loss at midnight 
  const now = new Date(); 
  const tomorrow = new Date(now); 
  tomorrow.setDate(tomorrow.getDate() + 1); 
  tomorrow.setHours(0, 0, 0, 0); 
  const msUntilMidnight = tomorrow.getTime() - now.getTime(); 

  setTimeout(() => { 
    bot.dailyLoss = 0; 
    Utils.notify('Daily Reset', 'Daily loss counter has been reset', 'info'); 

    // Set up daily interval   
    setInterval(() => {   
      bot.dailyLoss = 0;   
    }, 86400000); // 24 hours 

  }, msUntilMidnight);
  
  // Monitor connection health and display
  setInterval(() => {
    if (bot) {
      bot.updateUI();
      
      // Log connection status periodically for debugging
      if (bot.isConnected) {
        Utils.log('Connection health check', 'debug', bot.getConnectionStatus());
      }
    }
  }, 10000); // Every 10 seconds
}); 

// Cleanup on page unload 
window.addEventListener('beforeunload', () => { 
  if (bot) { 
    Storage.saveSettings(CONFIG); 
    bot.destroy(); 
  } 
}); 

// Handle visibility change (pause when tab is hidden) 
document.addEventListener('visibilitychange', () => { 
  if (document.hidden) { 
    Utils.log('Tab hidden - connection maintained but consider pausing trades', 'info'); 
  } else { 
    Utils.log('Tab visible - resuming', 'info'); 
    
    // Check connection health when tab becomes visible again
    if (bot && bot.isConnected && bot.ws) {
      if (bot.ws.readyState !== WebSocket.OPEN) {
        Utils.log('Connection lost while tab was hidden, attempting reconnect', 'warn');
        bot.forceReconnect('Tab regained focus, connection lost');
      }
    }
  } 
}); 

// Handle online/offline events
window.addEventListener('online', () => {
  Utils.log('Network connection restored', 'info');
  Utils.notify('Online', 'Network connection restored', 'success');
  
  if (bot && !bot.isConnected && bot.shouldReconnect && !bot.emergencyStop) {
    Utils.log('Attempting to reconnect after network restoration', 'info');
    setTimeout(() => {
      bot.attemptReconnection('Network connection restored');
    }, 1000);
  }
});

window.addEventListener('offline', () => {
  Utils.log('Network connection lost', 'warn');
  Utils.notify('Offline', 'Network connection lost', 'error');
  
  if (bot && bot.isConnected) {
    bot.connectionHealth = 0;
    bot.updateUI();
  }
});

// Global error handler 
window.addEventListener('error', (event) => { 
  Utils.log('Global error caught', 'error', { 
    message: event.message, 
    filename: event.filename, 
    lineno: event.lineno, 
    colno: event.colno 
  }); 
}); 

// Unhandled promise rejection handler 
window.addEventListener('unhandledrejection', (event) => { 
  Utils.log('Unhandled promise rejection', 'error', event.reason); 
}); 

// Export bot instance for debugging 
if (typeof window !== 'undefined') { 
  window.DerivBot = bot; 
}
