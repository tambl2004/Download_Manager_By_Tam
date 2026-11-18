// MyDM YouTube MAIN World Stream Extractor (v0.3)
(function () {
    let activeVideoId = "";
    let lastVideoplaybackUrl = "";

    function getUrlVideoId() {
        try {
            const u = new URL(window.location.href);
            return u.searchParams.get("v") || "";
        } catch {
            return "";
        }
    }

    function checkVideoChange() {
        const v = getUrlVideoId();
        if (v && v !== activeVideoId) {
            activeVideoId = v;
            lastVideoplaybackUrl = "";
            window.postMessage({ type: "MYDM_YT_VIDEO_CHANGED", videoId: v }, "*");
        }
    }

    function captureVideoplayback(url) {
        if (!url || typeof url !== "string") return;
        if (url.includes("googlevideo.com/videoplayback")) {
            const targetVideoId = getUrlVideoId();
            if (targetVideoId) {
                try {
                    const u = new URL(url);
                    const docid = u.searchParams.get("docid") || u.searchParams.get("id");
                    if (docid && !docid.includes(targetVideoId) && !targetVideoId.includes(docid)) {
                        return; // Chunk from old video, ignore
                    }
                } catch {}
            }
            lastVideoplaybackUrl = url;
            sendUpdate();
        }
    }

    try {
        const origFetch = window.fetch;
        window.fetch = function (...args) {
            const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
            captureVideoplayback(url);
            return origFetch.apply(this, args);
        };
    } catch {}

    try {
        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            captureVideoplayback(url);
            return origOpen.apply(this, [method, url, ...rest]);
        };
    } catch {}

    function extractYouTubeData() {
        const targetVideoId = getUrlVideoId();
        if (!targetVideoId) return null;

        const player = document.getElementById("movie_player");

        let playerResponse = null;
        if (player && typeof player.getPlayerResponse === "function") {
            try {
                playerResponse = player.getPlayerResponse();
            } catch {}
        }

        if (!playerResponse || playerResponse.videoDetails?.videoId !== targetVideoId) {
            if (window.ytInitialPlayerResponse?.videoDetails?.videoId === targetVideoId) {
                playerResponse = window.ytInitialPlayerResponse;
            }
        }

        if (!playerResponse || playerResponse.videoDetails?.videoId !== targetVideoId) {
            const flexy = document.querySelector("ytd-watch-flexy, ytd-watch-grid");
            if (flexy && flexy.playerData && flexy.playerData.videoDetails?.videoId === targetVideoId) {
                playerResponse = flexy.playerData;
            }
        }

        // CRITICAL: Reject playerResponse if it belongs to another video!
        if (!playerResponse || playerResponse.videoDetails?.videoId !== targetVideoId) {
            return null;
        }

        const videoDetails = playerResponse.videoDetails || {};
        const streamingData = playerResponse.streamingData || {};
        const captions =
            playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

        let rawTitle =
            videoDetails.title ||
            (player && typeof player.getVideoData === "function" && player.getVideoData()?.title) ||
            document.querySelector(
                "h1.ytd-watch-metadata yt-formatted-string, #title h1, h1.title"
            )?.textContent?.trim() ||
            "";
        rawTitle = rawTitle.replace(/\s*-\s*YouTube$/, "").trim();
        if (!rawTitle || rawTitle.toLowerCase() === "youtube") {
            return null;
        }

        function getFormatUrl(f) {
            if (f.url && f.url.startsWith("http")) return f.url;
            if (f.cipher || f.signatureCipher) {
                const params = new URLSearchParams(f.cipher || f.signatureCipher);
                const u = params.get("url");
                if (u && u.startsWith("http")) {
                    const s = params.get("s");
                    const sp = params.get("sp") || "sig";
                    if (s) {
                        return `${u}&${sp}=${encodeURIComponent(s)}`;
                    }
                    return u;
                }
            }
            if (lastVideoplaybackUrl) {
                try {
                    const parsed = new URL(lastVideoplaybackUrl);
                    parsed.searchParams.delete("range");
                    parsed.searchParams.delete("rn");
                    if (f.itag) {
                        parsed.searchParams.set("itag", String(f.itag));
                    }
                    if (f.contentLength) {
                        parsed.searchParams.set("clen", String(f.contentLength));
                    }
                    return parsed.toString();
                } catch {}
            }
            return "";
        }

        const rawFormats = [
            ...(streamingData.formats || []),
            ...(streamingData.adaptiveFormats || []),
        ];

        const seenQualities = new Set();
        const videoStreams = [];

        for (const f of rawFormats) {
            const mime = f.mimeType || "";
            if (!mime.startsWith("video/")) continue;

            const height = f.height || parseInt(f.qualityLabel, 10) || 0;
            let qualityLabel = f.qualityLabel || (height ? `${height}p` : "");
            if (!qualityLabel) continue;

            let formatName = "MP4";
            let ext = "mp4";
            if (
                height >= 1080 ||
                mime.includes("webm") ||
                mime.includes("vp9") ||
                mime.includes("av01")
            ) {
                formatName = "MKV";
                ext = "mkv";
            }

            let displayQuality = qualityLabel;
            if (height >= 720 && !displayQuality.includes("HD")) {
                displayQuality = `${displayQuality} HD`;
            }

            const key = `${formatName}_${displayQuality}`;
            if (seenQualities.has(key)) continue;
            seenQualities.add(key);

            const streamUrl = getFormatUrl(f);

            videoStreams.push({
                url: streamUrl,
                format: `${formatName} tệp tin`,
                quality: displayQuality,
                ext,
                height,
                size: f.contentLength ? parseInt(f.contentLength, 10) : undefined,
                itag: f.itag,
                category: "Video",
            });
        }

        // Sort descending: 2160p 4K, 1440p HD, 1080p HD, 720p HD, 480p, 360p, 240p, 144p
        videoStreams.sort((a, b) => (b.height || 0) - (a.height || 0));

        const subtitleStreams = [];
        for (const c of captions) {
            const langName =
                c.name?.simpleText || c.name?.runs?.[0]?.text || c.languageCode || "Subtitles";
            const isAsr = c.kind === "asr" || c.vssId?.startsWith("a.");
            const qualityDesc = isAsr ? `${langName} (ASR)` : langName;

            subtitleStreams.push({
                url: c.baseUrl,
                format: "TTML tệp tin",
                quality: qualityDesc,
                ext: "ttml",
                height: -1,
                size: 150000,
                category: "Tài liệu",
            });
        }

        return {
            title: rawTitle,
            videoId: targetVideoId,
            videoStreams,
            subtitleStreams,
        };
    }

    function sendUpdate() {
        checkVideoChange();
        const data = extractYouTubeData();
        if (data && (data.videoStreams.length > 0 || data.subtitleStreams.length > 0)) {
            window.postMessage(
                {
                    type: "MYDM_YT_PLAYER_RESPONSE",
                    payload: data,
                },
                "*"
            );
        }
    }

    window.addEventListener("message", (e) => {
        if (e.data?.type === "MYDM_REQUEST_YT_PLAYER_RESPONSE") {
            sendUpdate();
        }
        if (e.data?.type === "MYDM_LIVE_STREAM_DETECTED" && e.data.url) {
            captureVideoplayback(e.data.url);
        }
    });

    window.addEventListener("yt-navigate-start", () => {
        checkVideoChange();
    });

    window.addEventListener("yt-navigate-finish", () => {
        checkVideoChange();
        setTimeout(sendUpdate, 300);
        setTimeout(sendUpdate, 800);
        setTimeout(sendUpdate, 1500);
    });

    window.addEventListener("yt-page-data-updated", () => {
        checkVideoChange();
        setTimeout(sendUpdate, 400);
    });

    window.addEventListener("popstate", () => {
        checkVideoChange();
        setTimeout(sendUpdate, 500);
    });

    setInterval(() => {
        checkVideoChange();
        sendUpdate();
    }, 1500);

    setTimeout(sendUpdate, 600);
})();
