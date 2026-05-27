/* ==========================================================================
   Client-Side Application Logic - Python HTTP Explorer
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements - Metrics
    const statUptime = document.getElementById("statUptime");
    const statRequests = document.getElementById("statRequests");
    const statRps = document.getElementById("statRps");
    const statPlatform = document.getElementById("statPlatform");
    const statPythonVer = document.getElementById("statPythonVer");
    const statTime = document.getElementById("statTime");
    const serverStatusBadge = document.getElementById("serverStatusBadge");

    // DOM Elements - HTTP Playground
    const httpForm = document.getElementById("httpForm");
    const reqMethod = document.getElementById("reqMethod");
    const reqPath = document.getElementById("reqPath");
    const headersEditor = document.getElementById("headersEditor");
    const reqBody = document.getElementById("reqBody");
    const bodyGroup = document.getElementById("bodyGroup");
    const btnFormatJson = document.getElementById("btnFormatJson");
    const latencyBadge = document.getElementById("latencyBadge");
    const rawRequestText = document.getElementById("rawRequestText");
    const rawResponseText = document.getElementById("rawResponseText");

    // DOM Elements - Message Board
    const messageForm = document.getElementById("messageForm");
    const msgAuthor = document.getElementById("msgAuthor");
    const msgContent = document.getElementById("msgContent");
    const messagesList = document.getElementById("messagesList");

    // Internal Metrics State
    let lastRequestCount = 0;
    let lastPollTime = Date.now();
    let isServerConnected = true;

    // Toggle Request Body display based on method
    const toggleBodyField = () => {
        const method = reqMethod.value;
        if (method === "GET" || method === "DELETE") {
            bodyGroup.style.display = "none";
        } else {
            bodyGroup.style.display = "flex";
        }
    };
    reqMethod.addEventListener("change", toggleBodyField);
    toggleBodyField(); // Initial call

    // Helper: Format JSON text
    btnFormatJson.addEventListener("click", () => {
        try {
            const rawVal = reqBody.value.trim();
            if (rawVal) {
                const parsed = JSON.parse(rawVal);
                reqBody.value = JSON.stringify(parsed, null, 2);
            }
        } catch (e) {
            alert("⚠️ Invalid JSON format: " + e.message);
        }
    });

    // ==========================================================================
    // API & Status Polling
    // ==========================================================================
    
    const formatUptime = (seconds) => {
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        if (mins < 60) return `${mins}m ${secs}s`;
        const hrs = Math.floor(mins / 60);
        const remMins = mins % 60;
        return `${hrs}h ${remMins}m`;
    };

    const updateStatusUI = (connected) => {
        isServerConnected = connected;
        const indicator = serverStatusBadge.querySelector(".status-indicator");
        const statusText = serverStatusBadge.querySelector(".status-text");

        if (connected) {
            indicator.className = "status-indicator active";
            serverStatusBadge.style.backgroundColor = "rgba(16, 185, 129, 0.1)";
            serverStatusBadge.style.borderColor = "rgba(16, 185, 129, 0.2)";
            serverStatusBadge.style.color = "var(--accent-green)";
            statusText.textContent = "Server Active";
        } else {
            indicator.className = "status-indicator";
            indicator.style.backgroundColor = "var(--accent-red)";
            indicator.style.boxShadow = "0 0 8px var(--accent-red)";
            serverStatusBadge.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
            serverStatusBadge.style.borderColor = "rgba(239, 68, 68, 0.2)";
            serverStatusBadge.style.color = "var(--accent-red)";
            statusText.textContent = "Server Offline";
        }
    };

    const pollStats = async () => {
        try {
            const res = await fetch("/api/stats");
            if (!res.ok) throw new Error("Stats fetch failed");
            const data = await res.json();

            // Calculate RPS
            const now = Date.now();
            const timeDelta = (now - lastPollTime) / 1000;
            const reqDelta = data.request_count - lastRequestCount;
            const rps = (lastRequestCount > 0 && timeDelta > 0) ? (reqDelta / timeDelta) : 0.0;

            // Update UI Elements
            statUptime.textContent = formatUptime(data.uptime);
            statRequests.textContent = data.request_count;
            statRps.textContent = `${rps.toFixed(1)} req / sec`;
            statPlatform.textContent = data.platform;
            statPythonVer.textContent = `Python ${data.python_version}`;
            statTime.textContent = data.server_time.split(" ")[1];

            // Cache metrics
            lastRequestCount = data.request_count;
            lastPollTime = now;

            if (!isServerConnected) updateStatusUI(true);
        } catch (e) {
            updateStatusUI(false);
            statRps.textContent = "0.0 req / sec";
        }
    };

    // Poll every 1.5s
    setInterval(pollStats, 1500);
    pollStats(); // Immediate call

    // ==========================================================================
    // Message Board Section
    // ==========================================================================
    
    const fetchMessages = async () => {
        try {
            const res = await fetch("/api/messages");
            if (!res.ok) return;
            const messages = await res.json();
            renderMessages(messages);
        } catch (e) {
            console.error("Failed to load messages", e);
        }
    };

    const renderMessages = (messages) => {
        if (messages.length === 0) {
            messagesList.innerHTML = `<div class="loading-spinner">No messages yet. Write one above!</div>`;
            return;
        }

        // Sort descending by id to show newest messages first
        const sorted = [...messages].reverse();
        messagesList.innerHTML = sorted.map(msg => `
            <div class="message-item">
                <div class="message-meta">
                    <span>👤 ${escapeHtml(msg.author)}</span>
                    <span class="message-time">${escapeHtml(msg.time)}</span>
                </div>
                <div class="message-content">${escapeHtml(msg.content)}</div>
            </div>
        `).join("");
    };

    messageForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const author = msgAuthor.value.trim();
        const content = msgContent.value.trim();

        if (!content) return;

        try {
            const res = await fetch("/api/message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ author, content })
            });

            if (res.ok) {
                const data = await res.json();
                renderMessages(data.messages);
                msgContent.value = ""; // clear message text input
            } else {
                alert("Failed to submit message to the server.");
            }
        } catch (e) {
            alert("Error connecting to server message board.");
        }
    });

    fetchMessages(); // Immediate load

    // ==========================================================================
    // Stock Watchlist (Feature 1)
    // ==========================================================================
    const stocksList = document.getElementById("stocksList");
    const btnSyncStocks = document.getElementById("btnSyncStocks");

    const fetchStocks = async () => {
        try {
            const res = await fetch("/api/stocks");
            if (!res.ok) throw new Error("Stocks fetch failed");
            const stocks = await res.json();
            renderStocks(stocks);
        } catch (e) {
            stocksList.innerHTML = `<tr><td colspan="4" class="text-center text-muted">⚠️ Failed to sync market data.</td></tr>`;
        }
    };

    const renderStocks = (stocks) => {
        stocksList.innerHTML = stocks.map(stock => {
            const isUp = stock.change >= 0;
            const changeSign = isUp ? "+" : "";
            const badgeClass = isUp ? "stock-up" : "stock-down";
            
            return `
                <tr>
                    <td style="font-family: var(--font-mono); font-weight: 600;">${escapeHtml(stock.symbol)}</td>
                    <td>${escapeHtml(stock.name)}</td>
                    <td class="text-right font-mono" style="font-family: var(--font-mono);">$${stock.price.toFixed(2)}</td>
                    <td class="text-right"><span class="${badgeClass}">${changeSign}${stock.change.toFixed(2)}%</span></td>
                </tr>
            `;
        }).join("");
    };

    btnSyncStocks.addEventListener("click", async () => {
        const originalText = btnSyncStocks.innerHTML;
        btnSyncStocks.innerHTML = "🔄 Syncing...";
        btnSyncStocks.disabled = true;
        
        await fetchStocks();
        
        setTimeout(() => {
            btnSyncStocks.innerHTML = originalText;
            btnSyncStocks.disabled = false;
        }, 600);
    });

    fetchStocks(); // Initial load

    // ==========================================================================
    // Afternoon Company Hub (Feature 2)
    // ==========================================================================
    const companyCheckinBadge = document.getElementById("companyCheckinBadge");
    const companyName = document.getElementById("companyName");
    const companyRole = document.getElementById("companyRole");
    const companyLoc = document.getElementById("companyLoc");
    const companyShift = document.getElementById("companyShift");
    const companyProject = document.getElementById("companyProject");
    const companyProgress = document.getElementById("companyProgress");
    const companyProgressBar = document.getElementById("companyProgressBar");
    const btnCheckin = document.getElementById("btnCheckin");
    const companySchedule = document.getElementById("companySchedule");

    let isCheckedIn = false;

    const fetchCompany = async () => {
        try {
            const res = await fetch("/api/company");
            if (!res.ok) throw new Error("Company fetch failed");
            const data = await res.json();
            renderCompany(data);
        } catch (e) {
            console.error("Failed to load company hub", e);
        }
    };

    const renderCompany = (data) => {
        companyName.textContent = data.name;
        companyRole.textContent = data.role;
        companyLoc.textContent = data.location;
        companyShift.textContent = data.shift;
        companyProject.textContent = data.project;
        companyProgress.textContent = `${data.progress}%`;
        companyProgressBar.style.width = `${data.progress}%`;

        renderTimeline(data.schedule);
    };

    const renderTimeline = (schedule) => {
        companySchedule.innerHTML = schedule.map(item => {
            let badgeClass = "pending";
            if (item.status.toLowerCase() === "done") badgeClass = "done";
            else if (item.status.toLowerCase() === "active") badgeClass = "active";
            
            return `
                <li class="timeline-item">
                    <span class="timeline-time">${escapeHtml(item.time)}</span>
                    <span class="timeline-task">${escapeHtml(item.task)}</span>
                    <span class="timeline-badge ${badgeClass}">${escapeHtml(item.status)}</span>
                </li>
            `;
        }).join("");
    };

    btnCheckin.addEventListener("click", () => {
        isCheckedIn = !isCheckedIn;
        if (isCheckedIn) {
            btnCheckin.textContent = "🏢 Clock Out of Office";
            btnCheckin.className = "btn btn-secondary btn-sm";
            companyCheckinBadge.textContent = "🟢 Checked In";
            companyCheckinBadge.className = "status-badge active";
            
            // Visual feedback: complete the check-in task dynamically
            const firstBadge = companySchedule.querySelector(".timeline-badge");
            if (firstBadge) {
                firstBadge.textContent = "Done";
                firstBadge.className = "timeline-badge done";
            }
        } else {
            btnCheckin.textContent = "🏢 Clock In to Office";
            btnCheckin.className = "btn btn-accent btn-sm";
            companyCheckinBadge.textContent = "🕒 Standby";
            companyCheckinBadge.className = "status-badge";
            
            // Revert task state
            const firstBadge = companySchedule.querySelector(".timeline-badge");
            if (firstBadge) {
                firstBadge.textContent = "Pending";
                firstBadge.className = "timeline-badge pending";
            }
        }
    });

    fetchCompany(); // Initial load

    // ==========================================================================
    // HTTP Playground Protocol Viewer
    // ==========================================================================
    
    // Read header key-values from form
    const getFormHeaders = () => {
        const headers = {};
        const rows = headersEditor.querySelectorAll(".header-row");
        rows.forEach(row => {
            const key = row.querySelector(".header-key").value.trim();
            const val = row.querySelector(".header-val").value.trim();
            if (key) {
                headers[key] = val;
            }
        });
        return headers;
    };

    // Syntax Highlight Raw HTTP Protocol Text
    const highlightHttp = (text, type = "request") => {
        const lines = text.split("\n");
        const highlightedLines = lines.map((line, idx) => {
            // First line of request (Request Line) or response (Status Line)
            if (idx === 0) {
                if (type === "request") {
                    // Match: GET /api/stats HTTP/1.1
                    const parts = line.split(" ");
                    if (parts.length >= 3) {
                        const method = `<span class="http-method">${parts[0]}</span>`;
                        const path = `<span class="http-path">${parts[1]}</span>`;
                        const proto = `<span class="http-proto">${parts[2]}</span>`;
                        return `${method} ${path} ${proto}`;
                    }
                } else {
                    // Match: HTTP/1.1 200 OK
                    const match = line.match(/^(HTTP\/[0-9.]+)\s+(\d+)\s+(.*)$/);
                    if (match) {
                        const proto = `<span class="http-proto">${match[1]}</span>`;
                        const statusCode = parseInt(match[2]);
                        const isErr = statusCode >= 400;
                        const statusClass = isErr ? "http-status err" : "http-status";
                        const status = `<span class="${statusClass}">${match[2]} ${match[3]}</span>`;
                        return `${proto} ${status}`;
                    }
                }
                return line;
            }

            // Headers formatting
            const headerMatch = line.match(/^([\w-]+):\s*(.*)$/);
            if (headerMatch) {
                const key = `<span class="http-header-key">${headerMatch[1]}</span>`;
                const val = `<span class="http-header-val">${headerMatch[2]}</span>`;
                return `${key}: ${val}`;
            }

            // Check if body content
            if (line.trim() && !line.includes(": ")) {
                return `<span class="http-body">${escapeHtml(line)}</span>`;
            }

            return escapeHtml(line);
        });

        return highlightedLines.join("\n");
    };

    // Handle Custom Request Submissions
    httpForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const method = reqMethod.value;
        let path = reqPath.value.trim();
        if (!path.startsWith("/")) path = "/" + path;

        const headers = getFormHeaders();
        const hasBody = method !== "GET" && method !== "DELETE";
        const bodyContent = hasBody ? reqBody.value.trim() : "";

        // Auto-inject Content-Length if missing and body is present
        if (hasBody && bodyContent) {
            headers["Content-Length"] = new Blob([bodyContent]).size.toString();
        }

        // 1. Generate & Render Raw Outgoing Request Packet Simulation
        let rawRequest = `${method} ${path} HTTP/1.1\n`;
        rawRequest += `Host: ${window.location.host}\n`;
        rawRequest += `User-Agent: Mozilla/5.0 (Custom HTTP Explorer)\n`;
        for (const [k, v] of Object.entries(headers)) {
            rawRequest += `${k}: ${v}\n`;
        }
        rawRequest += `Connection: keep-alive\n`;
        rawRequest += `\n`;
        if (bodyContent) {
            rawRequest += bodyContent;
        }

        rawRequestText.innerHTML = highlightHttp(rawRequest, "request");
        rawResponseText.innerHTML = `<span class="text-muted">Awaiting response from backend...</span>`;
        latencyBadge.textContent = "⏱️ --ms";

        // 2. Perform actual Fetch API Request
        // We filter out browser-forbidden headers (like Content-Length, Host, Connection)
        // to prevent browsers from rejecting or failing the fetch request.
        const cleanHeaders = { ...headers };
        const forbiddenHeaders = ["content-length", "host", "connection", "user-agent", "keep-alive"];
        Object.keys(cleanHeaders).forEach(k => {
            if (forbiddenHeaders.includes(k.toLowerCase())) {
                delete cleanHeaders[k];
            }
        });

        const fetchOptions = {
            method: method,
            headers: cleanHeaders,
        };
        if (hasBody && bodyContent) {
            fetchOptions.body = bodyContent;
        }

        const startTime = performance.now();

        try {
            const response = await fetch(path, fetchOptions);
            const endTime = performance.now();
            const duration = Math.round(endTime - startTime);
            latencyBadge.textContent = `⚡ ${duration}ms`;

            // Read response headers & status
            const statusText = response.statusText || getStatusTextPlaceholder(response.status);
            let rawResponse = `HTTP/1.1 ${response.status} ${statusText}\n`;
            
            // Extract headers
            response.headers.forEach((value, key) => {
                // capitalize header keys for correct visual protocol format
                const formattedKey = key.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('-');
                rawResponse += `${formattedKey}: ${value}\n`;
            });
            rawResponse += `\n`;

            // Read body payload
            const responseText = await response.text();
            let prettyBody = responseText;
            
            // Format body content if JSON
            try {
                if (responseText) {
                    const parsed = JSON.parse(responseText);
                    prettyBody = JSON.stringify(parsed, null, 2);
                }
            } catch (err) {}

            rawResponse += prettyBody;
            rawResponseText.innerHTML = highlightHttp(rawResponse, "response");

            // If request was sent to /api/message, we update the message list
            if (path === "/api/message" || path === "/api/messages") {
                fetchMessages();
            }

        } catch (error) {
            const endTime = performance.now();
            const duration = Math.round(endTime - startTime);
            latencyBadge.textContent = `⚠️ Error`;

            let rawResponse = `HTTP/1.1 0 Connection Failed\n`;
            rawResponse += `Error: ${error.message}\n`;
            rawResponseText.innerHTML = `<span class="http-status err">${rawResponse}</span>`;
        }
    });

    // Fallback status texts for standard socket/HTTP server
    const getStatusTextPlaceholder = (status) => {
        const statuses = {
            200: "OK",
            201: "Created",
            204: "No Content",
            400: "Bad Request",
            401: "Unauthorized",
            403: "Forbidden",
            404: "Not Found",
            500: "Internal Server Error"
        };
        return statuses[status] || "Unknown State";
    };

    // ==========================================================================
    // UI Helpers (Clipboard Copying, HTML Escaping)
    // ==========================================================================
    
    // Copy buttons implementation
    document.querySelectorAll(".btn-copy").forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.getAttribute("data-target");
            const targetEl = document.getElementById(targetId);
            if (!targetEl) return;

            // Copy plain text content (without HTML tags/highlight wrappers)
            const plainText = targetEl.innerText;
            navigator.clipboard.writeText(plainText).then(() => {
                const originalText = btn.textContent;
                btn.textContent = "Copied! ✓";
                btn.style.borderColor = "var(--accent-green)";
                btn.style.color = "var(--accent-green)";

                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.borderColor = "";
                    btn.style.color = "";
                }, 1500);
            }).catch(err => {
                alert("Failed to copy code to clipboard: " + err);
            });
        });
    });

    // Helper: escape HTML entities to prevent markup injection
    function escapeHtml(string) {
        return String(string).replace(/[&<>"'`=\/]/g, function (s) {
            const entityMap = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
                '/': '&#x2F;',
                '=': '&#x3D;'
            };
            return entityMap[s] || s;
        });
    }
});
