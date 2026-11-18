// MyDM Content Script: Video Sniffer & Floating Download Button (IDM Style v0.3)

(function () {
    if (window.__mydm_content_injected) return;
    window.__mydm_content_injected = true;

    const detectedStreams = new Map(); // key -> stream info
    let activePlayer = null;
    let panelElement = null;
    let dropdownOpen = false;
    let currentVideoId = "";
    let isExtensionEnabled = true;
    let userClosedPanel = false;

    // Check extension enabled status from storage
    chrome.storage.local.get(["mode", "automatic", "enabled"], (res) => {
        if (res.enabled !== undefined) {
            isExtensionEnabled = !!res.enabled;
        } else if (res.mode !== undefined) {
            isExtensionEnabled = res.mode !== "off";
        } else {
            isExtensionEnabled = true;
        }
        updatePanelState();
    });

    // Listen to storage changes for instant toggle
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local") {
            if (changes.enabled !== undefined) {
                isExtensionEnabled = !!changes.enabled.newValue;
            } else if (changes.mode !== undefined) {
                isExtensionEnabled = changes.mode.newValue !== "off";
            }
            updatePanelState();
        }
    });

    // Listen to direct broadcast from popup
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === "MYDM_TOGGLE_ENABLED") {
            isExtensionEnabled = !!msg.enabled;
            updatePanelState();
        }
    });

    function updatePanelState() {
        if (!isExtensionEnabled) {
            if (panelElement) {
                panelElement.style.display = "none";
                dropdownOpen = false;
                const dropdown = panelElement.querySelector(".mydm-video-dropdown");
                if (dropdown) dropdown.style.display = "none";
            }
        } else {
            if (panelElement && !userClosedPanel && detectedStreams.size > 0) {
                panelElement.style.display = "block";
            }
        }
    }

    function getCleanTitle() {
        let title =
            document.querySelector("h1.ytd-watch-metadata yt-formatted-string, #title h1, h1.title")
                ?.textContent?.trim() ||
            document.title ||
            "video";
        title = title.replace(/\s*-\s*YouTube$/, "").trim();
        return title.replace(/[\\/:*?"<>|]/g, "_");
    }

    // Dynamic stream handler from MAIN world (YouTube)
    window.addEventListener("message", (event) => {
        if (!isExtensionEnabled) return;

        // Video changed notification from MAIN world
        if (event.data?.type === "MYDM_YT_VIDEO_CHANGED") {
            currentVideoId = event.data.videoId || "";
            userClosedPanel = false;
            detectedStreams.clear();
            dropdownOpen = false;
            renderDropdownItems();
            return;
        }

        if (event.data?.type === "MYDM_YT_PLAYER_RESPONSE" && event.data.payload) {
            const { title, videoId, videoStreams, subtitleStreams } = event.data.payload;
            const targetVideoId = new URLSearchParams(window.location.search).get("v") || "";

            // CRITICAL: If payload videoId does NOT match the current URL videoId, REJECT!
            if (targetVideoId && videoId && videoId !== targetVideoId) {
                return;
            }

            const cleanTitle = (title || getCleanTitle()).replace(/[\\/:*?"<>|]/g, "_").trim();
            if (!cleanTitle || cleanTitle.toLowerCase() === "youtube") return;

            if (targetVideoId && targetVideoId !== currentVideoId) {
                currentVideoId = targetVideoId;
                userClosedPanel = false;
            }

            // Always clear detectedStreams for YouTube to avoid duplicate/stale streams
            detectedStreams.clear();

            // Add video streams
            for (const s of videoStreams || []) {
                if (!s.url || !s.url.startsWith("http")) continue;
                const key = `yt_${s.format}_${s.quality}`;
                detectedStreams.set(key, {
                    url: s.url,
                    title: cleanTitle,
                    format: s.format,
                    quality: s.quality,
                    filename: `${cleanTitle}.${s.ext || "mp4"}`,
                    size: s.size,
                    height: s.height,
                    category: s.category || "Video",
                });
            }

            // Add subtitle streams
            for (const sub of subtitleStreams || []) {
                if (!sub.url || !sub.url.startsWith("http")) continue;
                const key = `sub_${sub.quality}`;
                detectedStreams.set(key, {
                    url: sub.url,
                    title: cleanTitle,
                    format: sub.format,
                    quality: sub.quality,
                    filename: `${cleanTitle}_${sub.quality.replace(/[\\/:*?"<>| ]/g, "_")}.${sub.ext || "ttml"}`,
                    size: sub.size || 150000,
                    height: -1,
                    category: sub.category || "Tài liệu",
                });
            }

            renderDropdownItems();
            mountButtonToPlayer();
        }
    });

    function requestYouTubeData() {
        if (!isExtensionEnabled) return;
        window.postMessage({ type: "MYDM_REQUEST_YT_PLAYER_RESPONSE" }, "*");
    }

    function addStream(stream) {
        if (!isExtensionEnabled) return;
        if (!stream || !stream.url) return;
        // YouTube is handled strictly via yt_injected.js
        if (window.location.hostname.includes("youtube.com")) return;
        if (detectedStreams.has(stream.url)) return;

        const title = stream.title || getCleanTitle();
        let format = "MP4 tệp tin";
        let quality = "720p HD";

        const lowerUrl = stream.url.toLowerCase();
        if (lowerUrl.includes(".mkv")) format = "MKV tệp tin";
        else if (lowerUrl.includes(".webm")) format = "WebM tệp tin";
        else if (lowerUrl.includes(".m4a") || lowerUrl.includes(".mp3")) format = "Audio tệp tin";
        else if (lowerUrl.includes(".ttml")) {
            format = "TTML tệp tin";
            quality = "VI subtitles (ASR)";
        }

        const ext = format.includes("MKV")
            ? "mkv"
            : format.includes("WebM")
            ? "webm"
            : format.includes("TTML")
            ? "ttml"
            : "mp4";

        detectedStreams.set(stream.url, {
            url: stream.url,
            title,
            format,
            quality: stream.quality || quality,
            filename: `${title}.${ext}`,
            size: stream.size,
            category: format.includes("TTML") ? "Tài liệu" : "Video",
        });

        renderDropdownItems();
        mountButtonToPlayer();
    }

    function createPanelElement() {
        if (panelElement && document.body.contains(panelElement)) return panelElement;

        panelElement = document.createElement("div");
        panelElement.className = "mydm-video-panel";
        panelElement.innerHTML = `
            <div class="mydm-badge-bar">
                <button type="button" class="mydm-btn-main">
                    <span class="mydm-play-icon">▶</span> Tải video này
                </button>
                <div class="mydm-btn-sep"></div>
                <button type="button" class="mydm-btn-help" title="Trợ giúp MyDM">?</button>
                <div class="mydm-btn-sep"></div>
                <button type="button" class="mydm-btn-close" title="Ẩn nút tải">✕</button>
            </div>
            <div class="mydm-video-dropdown" style="display:none;"></div>
        `;

        const btnMain = panelElement.querySelector(".mydm-btn-main");
        const btnClose = panelElement.querySelector(".mydm-btn-close");
        const dropdown = panelElement.querySelector(".mydm-video-dropdown");

        btnMain.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!isExtensionEnabled) return;
            dropdownOpen = !dropdownOpen;
            dropdown.style.display = dropdownOpen ? "flex" : "none";
            if (dropdownOpen) {
                requestYouTubeData();
                renderDropdownItems();
            }
        });

        btnClose.addEventListener("click", (e) => {
            e.stopPropagation();
            userClosedPanel = true;
            panelElement.style.display = "none";
        });

        document.addEventListener("click", (e) => {
            if (!panelElement.contains(e.target)) {
                dropdownOpen = false;
                dropdown.style.display = "none";
            }
        });

        return panelElement;
    }

    function renderDropdownItems() {
        if (!panelElement) return;
        const dropdown = panelElement.querySelector(".mydm-video-dropdown");
        if (!dropdown) return;

        let html = `<div class="mydm-menu-header-item" data-action="all">Tải xuống tất</div><div class="mydm-menu-divider"></div>`;

        let idx = 1;
        const streamEntries = Array.from(detectedStreams.entries()).filter(
            ([_, s]) => s.url && s.url.startsWith("http") && !s.url.includes("/watch?")
        );

        if (streamEntries.length === 0) {
            html += `<div class="mydm-menu-item" style="color:#888;cursor:default;">Đang phân tích định dạng video...</div>`;
        } else {
            streamEntries.forEach(([key, stream]) => {
                const shortTitle =
                    stream.title.length > 36 ? stream.title.slice(0, 36) + "..." : stream.title;
                const metaText = `${stream.format}, chất lượng ${stream.quality}`;

                html += `
                    <div class="mydm-menu-item" data-key="${encodeURIComponent(key)}">
                        <span class="mydm-item-index">${idx}.</span>
                        <span class="mydm-item-title">${shortTitle}</span>
                        <span class="mydm-item-meta">${metaText}</span>
                    </div>
                `;
                idx++;
            });
        }

        dropdown.innerHTML = html;

        dropdown.querySelectorAll(".mydm-menu-item[data-key]").forEach((el) => {
            el.addEventListener("click", (e) => {
                e.stopPropagation();
                const key = decodeURIComponent(el.getAttribute("data-key") || "");
                const target = detectedStreams.get(key);
                if (target) {
                    triggerDownload(target);
                }
                dropdownOpen = false;
                dropdown.style.display = "none";
            });
        });

        const allBtn = dropdown.querySelector('[data-action="all"]');
        if (allBtn) {
            allBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                detectedStreams.forEach((st) => triggerDownload(st));
                dropdownOpen = false;
                dropdown.style.display = "none";
            });
        }
    }

    function triggerDownload(stream) {
        if (!isExtensionEnabled) return;
        chrome.runtime.sendMessage({
            op: "downloadMedia",
            stream: {
                url: stream.url,
                name: stream.filename,
                title: stream.title,
                size: stream.size,
                category: stream.category || (stream.filename?.endsWith(".ttml") ? "Tài liệu" : "Video"),
                referer: window.location.href,
            },
        });
    }

    function mountButtonToPlayer() {
        if (!isExtensionEnabled || userClosedPanel) {
            if (panelElement) panelElement.style.display = "none";
            return;
        }

        // On YouTube, only mount if on watch page (with video ID)
        if (window.location.hostname.includes("youtube.com")) {
            const urlParams = new URLSearchParams(window.location.search);
            if (!urlParams.get("v")) {
                if (panelElement) panelElement.style.display = "none";
                return;
            }
        }

        const ytPlayer =
            document.getElementById("movie_player") ||
            document.querySelector(".html5-video-player");
        if (ytPlayer) {
            activePlayer = ytPlayer;
            const panel = createPanelElement();
            panel.style.display = "block";
            panel.style.position = "absolute";
            panel.style.top = "12px";
            panel.style.right = "18px";
            panel.style.left = "auto";
            panel.style.zIndex = "2147483647";

            if (!ytPlayer.contains(panel)) {
                ytPlayer.appendChild(panel);
            }
            return;
        }

        if (window.location.hostname.includes("youtube.com")) return;

        const video = document.querySelector("video");
        if (video) {
            activePlayer = video;
            const title = getCleanTitle();
            if (video.src && video.src.startsWith("http")) {
                addStream({ url: video.src, title });
            }

            const panel = createPanelElement();
            panel.style.display = "block";

            const rect = video.getBoundingClientRect();
            panel.style.position = "absolute";
            panel.style.top = `${Math.max(10, rect.top + window.scrollY + 10)}px`;
            panel.style.right = `${Math.max(
                10,
                window.innerWidth - (rect.right + window.scrollX) + 12
            )}px`;
            panel.style.left = "auto";
            panel.style.zIndex = "2147483647";

            if (!document.body.contains(panel)) {
                document.body.appendChild(panel);
            }
        }
    }

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === "MEDIA_DETECTED" && msg.stream) {
            // NEVER add stream to YouTube from webRequest! YouTube is handled strictly by yt_injected.js!
            if (window.location.hostname.includes("youtube.com")) {
                if (msg.stream.url && msg.stream.url.includes("googlevideo.com/videoplayback")) {
                    window.postMessage({ type: "MYDM_LIVE_STREAM_DETECTED", url: msg.stream.url }, "*");
                }
                return;
            }
            if (!isExtensionEnabled) return;
            addStream(msg.stream);
        }
    });

    setInterval(mountButtonToPlayer, 1000);

    const observer = new MutationObserver(() => {
        mountButtonToPlayer();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            mountButtonToPlayer();
            requestYouTubeData();
        });
    } else {
        mountButtonToPlayer();
        requestYouTubeData();
    }
})();
