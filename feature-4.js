// CPU Stress Testing Dashboard Engine
// Powered by Python standard library and vanilla JS telemetry

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const coreCountBadge = document.getElementById('coreCountBadge');
    const intensitySlider = document.getElementById('intensitySlider');
    const intensityVal = document.getElementById('intensityVal');
    const btnToggleStress = document.getElementById('btnToggleStress');
    const btnStressIcon = document.getElementById('btnStressIcon');
    const btnStressText = document.getElementById('btnStressText');
    const safetyStatus = document.getElementById('safetyStatus');
    const telemetryStatusBadge = document.getElementById('telemetryStatusBadge');
    const gaugeFill = document.getElementById('gaugeFill');
    const gaugeVal = document.getElementById('gaugeVal');
    const consoleLogs = document.getElementById('consoleLogs');
    const canvas = document.getElementById('telemetryChart');
    const ctx = canvas.getContext('2d');

    // Telemetry State
    let isStressing = false;
    let targetIntensity = 0.90;
    let cpuHistory = Array(60).fill(0); // Store 60 samples
    let safetyTimerValue = 60;
    let safetyCountdownInterval = null;
    let coresCounted = false;

    // Canvas configuration
    function initCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
    }
    
    // Resize chart dynamically
    window.addEventListener('resize', () => {
        initCanvas();
        drawChart();
    });

    initCanvas();

    // Logger Helper
    function addLog(message, type = 'info') {
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        
        const now = new Date();
        const timeStr = now.toTimeString().split(' ')[0];
        
        line.innerHTML = `
            <span class="console-time">[${timeStr}]</span>
            <span class="console-msg">${message}</span>
        `;
        
        consoleLogs.appendChild(line);
        // Autoscroll to bottom
        consoleLogs.scrollTop = consoleLogs.scrollHeight;
        
        // Truncate logs if too long
        while (consoleLogs.children.length > 50) {
            consoleLogs.removeChild(consoleLogs.firstChild);
        }
    }

    // Format target intensity output
    intensitySlider.addEventListener('input', (e) => {
        const pct = e.target.value;
        intensityVal.textContent = `${pct}%`;
        targetIntensity = pct / 100;
        
        // If stress is active, dynamically update target load
        if (isStressing) {
            addLog(`Calibrating active load level target to ${pct}%...`, 'info');
            sendStressRequest(true, targetIntensity);
        }
    });

    // Update gauge progress (SVG DashOffset)
    // Radius = 90. Circumference = 2 * PI * r = ~565
    function updateGauge(percentage) {
        const maxOffset = 565;
        const offset = maxOffset - (percentage / 100) * maxOffset;
        gaugeFill.style.strokeDashoffset = offset;
        gaugeVal.textContent = `${percentage}%`;

        // Style intensity text shadow depending on load
        if (percentage >= 80) {
            gaugeVal.style.textShadow = `0 0 20px rgba(239, 68, 68, 0.8)`;
            gaugeVal.style.color = '#ef4444';
        } else if (percentage >= 50) {
            gaugeVal.style.textShadow = `0 0 15px rgba(99, 102, 241, 0.6)`;
            gaugeVal.style.color = '#8b5cf6';
        } else {
            gaugeVal.style.textShadow = `0 0 10px rgba(6, 182, 212, 0.4)`;
            gaugeVal.style.color = '#f3f4f6';
        }
    }

    // Draw Rolling Telemetry Chart
    function drawChart() {
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;

        ctx.clearRect(0, 0, width, height);

        // 1. Draw Grid Lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        
        // Horizontal grids
        for (let i = 1; i < 4; i++) {
            const y = (height / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // Vertical grids moving left
        for (let i = 1; i < 6; i++) {
            const x = (width / 6) * i;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        if (cpuHistory.length === 0) return;

        // 2. Draw Gradient Fill Area first
        ctx.beginPath();
        const points = cpuHistory.map((val, idx) => {
            const x = (width / (cpuHistory.length - 1)) * idx;
            // Pad by 5px top and bottom
            const y = height - (val * (height - 15)) - 8;
            return { x, y };
        });

        ctx.moveTo(0, height);
        points.forEach(pt => {
            ctx.lineTo(pt.x, pt.y);
        });
        ctx.lineTo(width, height);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        // Shift colors under load
        if (isStressing) {
            gradient.addColorStop(0, 'rgba(239, 68, 68, 0.28)'); // red glow
            gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.15)'); // purple
        } else {
            gradient.addColorStop(0, 'rgba(6, 182, 212, 0.2)'); // cyan glow
            gradient.addColorStop(0.5, 'rgba(99, 102, 241, 0.08)');
        }
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fill();

        // 3. Draw Telemetry Path Line
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }

        ctx.strokeStyle = isStressing ? '#ef4444' : '#6366f1';
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 10;
        ctx.shadowColor = isStressing ? 'rgba(239, 68, 68, 0.6)' : 'rgba(99, 102, 241, 0.4)';
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset shadow

        // 4. Highlight current pointer value
        const lastPt = points[points.length - 1];
        ctx.beginPath();
        ctx.arc(lastPt.x, lastPt.y, 4.5, 0, 2 * Math.PI);
        ctx.fillStyle = isStressing ? '#ef4444' : '#06b6d4';
        ctx.shadowBlur = 15;
        ctx.shadowColor = isStressing ? '#ef4444' : '#06b6d4';
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // Toggle stress click event
    btnToggleStress.addEventListener('click', () => {
        const toggleState = !isStressing;
        sendStressRequest(toggleState, targetIntensity);
    });

    // Send HTTP POST request to API to toggle state
    function sendStressRequest(active, loadVal) {
        btnToggleStress.disabled = true;
        
        fetch('/api/cpu/stress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                active: active,
                target_load: loadVal
            })
        })
        .then(res => res.json())
        .then(data => {
            btnToggleStress.disabled = false;
            if (data.success) {
                isStressing = data.active;
                handleStressorStateChange(isStressing, loadVal, data.message);
            } else {
                addLog(`Error changing CPU stress: ${data.error}`, 'error');
            }
        })
        .catch(err => {
            btnToggleStress.disabled = false;
            addLog(`Network failed: ${err.message}`, 'error');
        });
    }

    // Manage UI changes when stress state switches
    function handleStressorStateChange(active, loadVal, message) {
        if (active) {
            btnToggleStress.classList.add('active');
            btnStressIcon.textContent = '🛑';
            btnStressText.textContent = 'Deactivate Stress Test';
            
            telemetryStatusBadge.textContent = `Stressing (${Math.round(loadVal * 100)}%)`;
            telemetryStatusBadge.style.color = 'var(--accent-red)';
            telemetryStatusBadge.style.background = 'rgba(239, 68, 68, 0.1)';
            telemetryStatusBadge.style.borderColor = 'rgba(239, 68, 68, 0.2)';
            
            addLog(message || `CPU Stress Generator launched successfully.`, 'warning');
            
            // Start countdown
            startSafetyCountdown();
        } else {
            btnToggleStress.classList.remove('active');
            btnStressIcon.textContent = '⚡';
            btnStressText.textContent = 'Activate Stress Test';
            
            telemetryStatusBadge.textContent = 'System Idle';
            telemetryStatusBadge.style.color = 'var(--accent-green)';
            telemetryStatusBadge.style.background = 'rgba(16, 185, 129, 0.1)';
            telemetryStatusBadge.style.borderColor = 'rgba(16, 185, 129, 0.2)';
            
            addLog(message || `CPU Stress Generator terminated successfully. Ready.`, 'info');
            
            // Stop countdown
            stopSafetyCountdown();
        }
    }

    // Client-side Safety Countdown display (keeps state in sync with server timeout)
    function startSafetyCountdown() {
        stopSafetyCountdown();
        safetyTimerValue = 60;
        
        safetyStatus.innerHTML = `Auto-shutoff in <span class="safety-badge-active">${safetyTimerValue}s</span>`;
        
        safetyCountdownInterval = setInterval(() => {
            safetyTimerValue--;
            if (safetyTimerValue <= 0) {
                clearInterval(safetyCountdownInterval);
                safetyStatus.textContent = 'Auto-shutoff safety timer active (60s max)';
                // The server will auto-deactivate after 60s, which our status polling will catch
            } else {
                safetyStatus.innerHTML = `Auto-shutoff in <span class="safety-badge-active">${safetyTimerValue}s</span>`;
            }
        }, 1000);
    }

    function stopSafetyCountdown() {
        if (safetyCountdownInterval) {
            clearInterval(safetyCountdownInterval);
            safetyCountdownInterval = null;
        }
        safetyStatus.textContent = 'Auto-shutoff safety timer active (60s max)';
    }

    // Poll server API for status
    function pollStatus() {
        fetch('/api/cpu/status')
        .then(res => res.json())
        .then(data => {
            // Display cores count once
            if (!coresCounted && data.cores) {
                coreCountBadge.textContent = `${data.cores} Logical Cores`;
                coresCounted = true;
                addLog(`Detected system core architecture: ${data.cores} logical processors.`, 'info');
            }

            // Sync state if server changed (e.g. safety shutoff hit)
            if (data.active !== isStressing) {
                isStressing = data.active;
                handleStressorStateChange(isStressing, data.target_load, isStressing ? null : 'Watchdog: Maximum load session timeout reached (60 seconds). CPU stress shut down automatically.');
            }

            // Push newest telemetry to historical array
            const loadVal = data.system_cpu_usage || 0;
            cpuHistory.push(loadVal);
            cpuHistory.shift(); // Remove oldest

            // Update UI widgets
            updateGauge(Math.round(loadVal * 100));
            drawChart();
        })
        .catch(err => {
            console.error('Failed to poll telemetry status:', err);
        });
    }

    // Initial query
    pollStatus();
    // Run status polling every 500ms for high-definition chart reporting
    setInterval(pollStatus, 500);
});
