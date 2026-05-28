/* ==========================================================================
   Client-Side Upload Logic - S3 Secure Storage Portal
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("fileInput");
    const uploadDetails = document.getElementById("uploadDetails");
    const fileName = document.getElementById("fileName");
    const fileSize = document.getElementById("fileSize");
    const fileIcon = document.getElementById("fileIcon");
    const btnCancelFile = document.getElementById("btnCancelFile");
    const btnStartUpload = document.getElementById("btnStartUpload");
    const progressContainer = document.getElementById("progressContainer");
    const uploadStatus = document.getElementById("uploadStatus");
    const uploadPct = document.getElementById("uploadPct");
    const progressBarFill = document.getElementById("progressBarFill");
    const successCard = document.getElementById("successCard");
    const s3UrlInput = document.getElementById("s3UrlInput");
    const btnCopyS3Url = document.getElementById("btnCopyS3Url");
    const consoleLogs = document.getElementById("consoleLogs");

    // AWS Config DOM Elements
    const credStatusBadge = document.getElementById("credStatusBadge");
    const credForm = document.getElementById("credForm");
    const inputAccessKey = document.getElementById("inputAccessKey");
    const inputSecretKey = document.getElementById("inputSecretKey");
    const credActiveState = document.getElementById("credActiveState");
    const activeKeyDisplay = document.getElementById("activeKeyDisplay");
    const btnClearCreds = document.getElementById("btnClearCreds");

    // Internal State
    let selectedFile = null;
    let currentUploadXhr = null;

    // Helper: secure log writing to UI console (prevents XSS)
    const logConsole = (message, type = "info") => {
        const time = new Date().toLocaleTimeString();
        const line = document.createElement("div");
        line.className = `console-line ${type}`;

        const timeSpan = document.createElement("span");
        timeSpan.className = "console-time";
        timeSpan.textContent = `[${time}]`;

        const msgSpan = document.createElement("span");
        msgSpan.className = "console-msg";
        msgSpan.textContent = message;

        line.appendChild(timeSpan);
        line.appendChild(msgSpan);
        consoleLogs.appendChild(line);
        consoleLogs.scrollTop = consoleLogs.scrollHeight;
    };

    // Helper: format file size
    const formatBytes = (bytes, decimals = 2) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    // Helper: map file extensions to friendly emojis
    const getFileEmoji = (filename) => {
        const ext = filename.split('.').pop().toLowerCase();
        const emojiMap = {
            'pdf': '📕',
            'doc': '📘', 'docx': '📘',
            'xls': '📗', 'xlsx': '📗',
            'ppt': '📙', 'pptx': '📙',
            'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'svg': '🖼️', 'webp': '🖼️',
            'zip': '📦', 'rar': '📦', 'tar': '📦', 'gz': '📦', '7z': '📦',
            'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵',
            'mp4': '🎥', 'avi': '🎥', 'mkv': '🎥', 'mov': '🎥',
            'txt': '📄', 'md': '📝', 'html': '🌐', 'css': '🎨', 'js': '⚙️', 'json': '⚙️', 'py': '🐍'
        };
        return emojiMap[ext] || '📄';
    };

    // ==========================================================================
    // AWS Credentials Configuration Status Management
    // ==========================================================================
    const checkCredentialsStatus = async () => {
        try {
            const res = await fetch("/api/credentials/status");
            const data = await res.json();
            
            if (data.configured) {
                // Configured state UI update
                credStatusBadge.textContent = "🟢 Active";
                credStatusBadge.className = "status-badge active";
                
                credForm.style.display = "none";
                credActiveState.style.display = "flex";
                activeKeyDisplay.textContent = data.aws_access_key_id;
                
                if (!data.boto3_available) {
                    logConsole("Warning: AWS keys are set, but boto3 is NOT installed on the server.", "warn");
                }
            } else {
                // Unconfigured state UI update
                if (!data.boto3_available) {
                    credStatusBadge.textContent = "⚠️ Missing Library";
                    credStatusBadge.className = "status-badge";
                    credStatusBadge.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
                    credStatusBadge.style.borderColor = "rgba(239, 68, 68, 0.3)";
                    credStatusBadge.style.color = "var(--accent-red)";
                } else {
                    credStatusBadge.textContent = "🔴 Unset";
                    credStatusBadge.className = "status-badge";
                    credStatusBadge.style.backgroundColor = "";
                    credStatusBadge.style.borderColor = "";
                    credStatusBadge.style.color = "";
                }
                
                credForm.style.display = "flex";
                credActiveState.style.display = "none";
            }
        } catch (e) {
            console.error("Failed to check credentials status", e);
            credStatusBadge.textContent = "⚠️ Connection Err";
        }
    };

    // Handle saving credentials
    credForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const accessKey = inputAccessKey.value.trim();
        const secretKey = inputSecretKey.value.trim();
        
        if (!accessKey || !secretKey) return;
        
        logConsole("Saving AWS credentials temporarily to server process environment...", "info");
        try {
            const res = await fetch("/api/credentials/update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    aws_access_key_id: accessKey,
                    aws_secret_access_key: secretKey
                })
            });
            const data = await res.json();
            
            if (res.ok && data.success) {
                logConsole("AWS credentials configured successfully in server memory.", "success");
                inputAccessKey.value = "";
                inputSecretKey.value = "";
                await checkCredentialsStatus();
            } else {
                throw new Error(data.error || "Failed to update configuration.");
            }
        } catch (error) {
            logConsole(`Error configuring credentials: ${error.message}`, "error");
            alert(`⚠️ Error: ${error.message}`);
        }
    });

    // Handle clearing credentials
    btnClearCreds.addEventListener("click", async () => {
        logConsole("Clearing AWS credentials from server process environment...", "info");
        try {
            const res = await fetch("/api/credentials/clear", { method: "POST" });
            const data = await res.json();
            
            if (res.ok && data.success) {
                logConsole("AWS credentials cleared successfully.", "warn");
                await checkCredentialsStatus();
            } else {
                throw new Error(data.error || "Failed to clear configuration.");
            }
        } catch (error) {
            logConsole(`Error clearing credentials: ${error.message}`, "error");
        }
    });

    // ==========================================================================
    // File Selection & Drag-and-Drop Events
    // ==========================================================================

    const handleFileSelect = (file) => {
        if (!file) return;

        // Security check: enforce 50MB file size limit before requesting backend resources
        const maxLimitBytes = 50 * 1024 * 1024;
        if (file.size > maxLimitBytes) {
            logConsole(`Block: File "${file.name}" exceeds 50MB limit (${formatBytes(file.size)}).`, "error");
            alert(`⚠️ File is too large! Maximum limit is 50MB. (Your file is ${formatBytes(file.size)})`);
            return;
        }

        selectedFile = file;
        fileName.textContent = file.name;
        fileSize.textContent = `${formatBytes(file.size)} • Type: ${file.type || 'unknown'}`;
        fileIcon.textContent = getFileEmoji(file.name);

        // UI toggles
        uploadDetails.style.display = "flex";
        dropzone.style.display = "none";
        successCard.style.display = "none";
        progressContainer.style.display = "none";
        progressBarFill.style.width = "0%";
        btnStartUpload.disabled = false;
        btnStartUpload.style.display = "block";

        logConsole(`Selected file "${file.name}" (${formatBytes(file.size)}). Ready to secure-upload.`, "info");
    };

    // Dropzone click triggers input click
    dropzone.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    // Drag over states
    ["dragenter", "dragover"].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add("dragover");
        }, false);
    });

    ["dragleave", "drop"].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove("dragover");
        }, false);
    });

    // Drop event
    dropzone.addEventListener("drop", (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    });

    // Cancel file selection
    btnCancelFile.addEventListener("click", () => {
        if (currentUploadXhr) {
            currentUploadXhr.abort();
            currentUploadXhr = null;
            logConsole("File upload cancelled by user.", "warn");
        }
        selectedFile = null;
        fileInput.value = "";
        uploadDetails.style.display = "none";
        dropzone.style.display = "flex";
        successCard.style.display = "none";
    });

    const startProxyUpload = (errorMessage = "") => {
        logConsole(`Direct S3 upload failed/blocked${errorMessage ? ': ' + errorMessage : ''}. Bypassing S3 CORS via local Server Proxy...`, "warn");
        uploadStatus.textContent = "Redirecting: Uploading via local server proxy...";
        
        currentUploadXhr = new XMLHttpRequest();
        currentUploadXhr.open("POST", "/api/upload/proxy", true);
        
        // Encode metadata in custom headers
        currentUploadXhr.setRequestHeader("X-File-Name", encodeURIComponent(selectedFile.name));
        if (selectedFile.type) {
            currentUploadXhr.setRequestHeader("X-File-Type", selectedFile.type);
        }
        currentUploadXhr.setRequestHeader("Content-Type", "application/octet-stream");
        
        // Track proxy upload progress
        currentUploadXhr.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) {
                const percentComplete = Math.round((event.loaded / event.total) * 100);
                progressBarFill.style.width = `${percentComplete}%`;
                uploadPct.textContent = `${percentComplete}%`;
                
                if (percentComplete === 100) {
                    uploadStatus.textContent = "Proxy forwarding data stream to S3...";
                }
            }
        });
        
        currentUploadXhr.addEventListener("load", () => {
            if (currentUploadXhr.status === 200) {
                try {
                    const data = JSON.parse(currentUploadXhr.responseText);
                    logConsole("Proxy upload successful. Server completed upload to S3.", "success");
                    logConsole(`File access URL: ${data.file_url}`, "success");

                    uploadStatus.textContent = "Upload successful! (via Proxy)";
                    btnStartUpload.style.display = "none";
                    btnCancelFile.textContent = "Upload New File";

                    successCard.style.display = "flex";
                    s3UrlInput.value = data.file_url;
                } catch (e) {
                    logConsole(`Error parsing server response: ${e.message}`, "error");
                    alert("❌ Proxy Upload Failed: Invalid server response.");
                    resetUploadUI();
                }
            } else {
                let errMsg = "Proxy Upload Failed";
                try {
                    const errData = JSON.parse(currentUploadXhr.responseText);
                    errMsg = errData.error || errMsg;
                } catch (e) {}
                
                logConsole(`Server returned HTTP ${currentUploadXhr.status}: ${errMsg}`, "error");
                alert(`❌ S3 Proxy Upload Failed: ${errMsg}`);
                resetUploadUI();
            }
            currentUploadXhr = null;
        });
        
        currentUploadXhr.addEventListener("error", () => {
            logConsole("Network error occurred during proxy transfer to Python server.", "error");
            alert("❌ Proxy Upload Failed due to a local network error.");
            resetUploadUI();
            currentUploadXhr = null;
        });
        
        currentUploadXhr.send(selectedFile);
    };

    // ==========================================================================
    // S3 Pre-signed URL and Upload Handler
    // ==========================================================================

    btnStartUpload.addEventListener("click", async () => {
        if (!selectedFile) return;

        btnStartUpload.disabled = true;
        btnCancelFile.textContent = "Cancel Upload";
        progressContainer.style.display = "flex";
        progressBarFill.style.width = "0%";
        uploadPct.textContent = "0%";
        uploadStatus.textContent = "Requesting cryptographically signed S3 URL...";

        logConsole("Requesting pre-signed upload URL from backend API...", "info");

        try {
            // Step 1: Request pre-signed URL from server
            const presignRes = await fetch("/api/upload/presign", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    filename: selectedFile.name,
                    file_type: selectedFile.type,
                    file_size: selectedFile.size
                })
            });

            const data = await presignRes.json();

            if (!presignRes.ok) {
                throw new Error(data.error || "Failed to generate presigned upload endpoint.");
            }

            logConsole("Pre-signed URL successfully generated by Python backend.", "success");
            logConsole(`S3 Object key assigned: ${data.s3_key}`, "warn");
            logConsole("Initiating binary streaming payload directly to S3 endpoint...", "info");

            uploadStatus.textContent = "Uploading payload directly to AWS S3...";

            // Step 2: Upload file directly to S3 via HTTP PUT
            currentUploadXhr = new XMLHttpRequest();
            currentUploadXhr.open("PUT", data.upload_url, true);

            // Set Content-Type as generated by signature validation
            if (selectedFile.type) {
                currentUploadXhr.setRequestHeader("Content-Type", selectedFile.type);
            }

            // Track upload progress
            currentUploadXhr.upload.addEventListener("progress", (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100);
                    progressBarFill.style.width = `${percentComplete}%`;
                    uploadPct.textContent = `${percentComplete}%`;
                    
                    if (percentComplete === 100) {
                        uploadStatus.textContent = "S3 checking integrity & persisting object...";
                    }
                }
            });

            // Upload response handler
            currentUploadXhr.addEventListener("load", () => {
                if (currentUploadXhr.status === 200) {
                    logConsole("HTTP PUT stream completed. AWS S3 verified 200 OK.", "success");
                    logConsole(`File access URL: ${data.file_url}`, "success");

                    uploadStatus.textContent = "Upload successful!";
                    btnStartUpload.style.display = "none";
                    btnCancelFile.textContent = "Upload New File";

                    // Show copy card
                    successCard.style.display = "flex";
                    s3UrlInput.value = data.file_url;
                    currentUploadXhr = null;
                } else {
                    // Fallback to S3 Proxy Upload
                    startProxyUpload(`S3 HTTP ${currentUploadXhr.status}`);
                }
            });

            // Upload error handler
            currentUploadXhr.addEventListener("error", () => {
                // Fallback to S3 Proxy Upload due to network error / CORS blocker
                startProxyUpload("CORS block or Network error");
            });

            // Send raw binary file
            currentUploadXhr.send(selectedFile);

        } catch (error) {
            logConsole(`Error: ${error.message}`, "error");
            alert(`⚠️ Upload Error:\n${error.message}`);
            resetUploadUI();
        }
    });

    const resetUploadUI = () => {
        btnStartUpload.disabled = false;
        btnStartUpload.style.display = "block";
        btnCancelFile.textContent = "Remove";
        progressContainer.style.display = "none";
        progressBarFill.style.width = "0%";
        uploadPct.textContent = "0%";
    };

    // Copy S3 Link
    btnCopyS3Url.addEventListener("click", () => {
        s3UrlInput.select();
        navigator.clipboard.writeText(s3UrlInput.value).then(() => {
            const originalText = btnCopyS3Url.textContent;
            btnCopyS3Url.textContent = "Copied! ✓";
            btnCopyS3Url.style.borderColor = "var(--accent-green)";
            btnCopyS3Url.style.color = "var(--accent-green)";

            setTimeout(() => {
                btnCopyS3Url.textContent = originalText;
                btnCopyS3Url.style.borderColor = "";
                btnCopyS3Url.style.color = "";
            }, 1500);
        }).catch(err => {
            alert("Failed to copy link: " + err);
        });
    });

    // Initial check of AWS credentials config status
    checkCredentialsStatus();
});
