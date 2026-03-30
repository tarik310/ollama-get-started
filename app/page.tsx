"use client";

/**
 * app/test-ollama/page.tsx
 *
 * Dev/test page — NOT linked in the main nav.
 * Accessible at: localhost:3000/test-ollama
 *
 * Purpose: validates direct browser → Ollama connectivity.
 * All fetches go straight to http://localhost:11434 — no backend proxy.
 * Do NOT import from lib/aiClient.ts or lib/mongodb.ts (Node.js only).
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/shadcn_ui/button";
import { Textarea } from "@/components/shadcn_ui/textarea";
import {
  Cpu,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Square,
  RefreshCw,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ConnStatus = "checking" | "ok" | "cors" | "offline";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TestOllamaPage() {
  // Connectivity
  const [connStatus, setConnStatus] = useState<ConnStatus>("checking");
  const [models, setModels] = useState<string[]>([]);

  // Controls
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [prompt, setPrompt] = useState<string>(
    "Return a JSON object with a single key called 'hello' and value 'world'.",
  );

  // Request lifecycle
  const [loading, setLoading] = useState<boolean>(false);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Response / error
  const [responseJson, setResponseJson] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Connectivity check ────────────────────────────────────────────────────

  const checkConnectivity = useCallback(async () => {
    setConnStatus("checking");
    setModels([]);
    setSelectedModel("");

    try {
      const res = await fetch("http://localhost:11434/api/tags");
      const data = await res.json();
      console.log("Ollama tags response:", data);
      const names: string[] = (data.models ?? []).map(
        (m: { name: string }) => m.name,
      );
      setModels(names);
      setSelectedModel(names[0] ?? "");
      setConnStatus("ok");
    } catch {
      // Both CORS blocks and offline errors throw identical TypeError: "Failed to fetch".
      // Distinguish them with a no-cors probe:
      //   - If Ollama is UP but CORS blocked → no-cors probe resolves (opaque response)
      //   - If Ollama is DOWN              → no-cors probe also throws
      try {
        await fetch("http://localhost:11434", { mode: "no-cors" });
        // Resolved = server is alive, original failure was CORS
        setConnStatus("cors");
      } catch {
        // Also failed = server is genuinely offline
        setConnStatus("offline");
      }
    }
  }, []);

  useEffect(() => {
    checkConnectivity();
  }, [checkConnectivity]);

  // ── Send prompt to Ollama ─────────────────────────────────────────────────

  async function handleSend() {
    if (!prompt.trim() || !selectedModel) return;

    setLoading(true);
    setResponseJson(null);
    setErrorMsg(null);
    setElapsedMs(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const startTime = performance.now();

    try {
      const res = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: [{ role: "user", content: prompt }],
          stream: false,
          format: "json",
        }),
        signal: controller.signal,
      });

      const elapsed = performance.now() - startTime;
      setElapsedMs(elapsed);

      if (!res.ok) {
        const errText = await res.text();
        setErrorMsg(`HTTP ${res.status}: ${errText}`);
        return;
      }

      const data = await res.json();
      setResponseJson(JSON.stringify(data, null, 2));
    } catch (err: unknown) {
      const elapsed = performance.now() - startTime;
      setElapsedMs(elapsed);

      if (err instanceof DOMException && err.name === "AbortError") {
        setErrorMsg("Request cancelled by user.");
      } else if (err instanceof TypeError) {
        setErrorMsg(
          "Request failed — Ollama may have gone offline or CORS is blocking the response.\n" +
            "Fix: set OLLAMA_ORIGINS=http://localhost:3000 then restart Ollama.",
        );
      } else {
        setErrorMsg(String(err));
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }

  function handleAbort() {
    abortControllerRef.current?.abort();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const canSend =
    !!prompt.trim() && !!selectedModel && connStatus === "ok" && !loading;
  const hasResponse = responseJson !== null || errorMsg !== null;

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="mb-6 border-b border-border pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Cpu className="size-4 text-blue-400" />
          <span className="font-mono text-sm font-semibold tracking-widest uppercase">
            Ollama Browser Test
          </span>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          Validates direct browser → Ollama connectivity at{" "}
          <span className="text-foreground">http://localhost:11434</span>. All
          fetches bypass the Next.js backend — this is the browser talking to
          Ollama directly.
        </p>
      </div>

      <div className="max-w-2xl space-y-4">
        {/* ── Connectivity Panel ─────────────────────────────────────────────── */}
        <div className="rounded-sm border border-border bg-card p-4 space-y-3">
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
            Connectivity
          </span>

          {/* Status display */}
          <div>
            {connStatus === "checking" && (
              <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Checking http://localhost:11434...
              </div>
            )}

            {connStatus === "ok" && (
              <div className="flex items-center gap-2 font-mono text-xs text-green-500">
                <CheckCircle2 className="size-3 shrink-0" />
                Ollama reachable — {models.length} model
                {models.length !== 1 ? "s" : ""} found
              </div>
            )}

            {connStatus === "cors" && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 font-mono text-xs text-red-400">
                  <AlertCircle className="size-3 shrink-0" />
                  CORS error — Ollama is running but blocking browser requests
                </div>
                <div className="font-mono text-xs text-muted-foreground pl-5 space-y-0.5">
                  <p>Fix: set the env variable below, then restart Ollama.</p>
                  <p className="rounded-sm bg-muted/30 border border-border px-2 py-1 text-foreground inline-block">
                    OLLAMA_ORIGINS=http://localhost:3000
                  </p>
                </div>
              </div>
            )}

            {connStatus === "offline" && (
              <div className="flex items-center gap-2 font-mono text-xs text-red-400">
                <AlertCircle className="size-3 shrink-0" />
                Ollama offline — connection refused on port 11434
              </div>
            )}
          </div>

          {/* Re-check button */}
          {connStatus !== "checking" && (
            <Button
              size="sm"
              variant="outline"
              onClick={checkConnectivity}
              className="font-mono text-xs gap-1.5"
            >
              <RefreshCw className="size-3" />
              Re-check
            </Button>
          )}
        </div>

        {/* ── Test Prompt Panel (only when connected) ────────────────────────── */}
        {connStatus === "ok" && (
          <div className="rounded-sm border border-border bg-card p-4 space-y-4">
            <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
              Test Prompt
            </span>

            {/* Model selector */}
            <div className="space-y-1.5">
              <label className="font-mono text-xs text-muted-foreground">
                Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={loading}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 font-mono text-sm text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-input/30"
              >
                {models.map((m) => (
                  <option
                    key={m}
                    value={m}
                    className="bg-background text-foreground"
                  >
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Prompt textarea */}
            <div className="space-y-1.5">
              <label className="font-mono text-xs text-muted-foreground">
                Prompt
              </label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter a test prompt..."
                className="font-mono text-sm min-h-24 resize-y"
                disabled={loading}
              />
            </div>

            {/* Send / Cancel */}
            <div className="flex items-center gap-2">
              {!loading ? (
                <Button
                  size="sm"
                  onClick={handleSend}
                  disabled={!canSend}
                  className="font-mono text-xs uppercase tracking-wider"
                >
                  Send to Ollama
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAbort}
                  className="font-mono text-xs uppercase tracking-wider gap-1.5 border-red-400 text-red-400 bg-transparent hover:bg-red-400/10 hover:text-red-300 hover:border-red-300"
                >
                  <Square className="size-3 fill-red-400" />
                  Cancel
                </Button>
              )}

              {loading && (
                <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin text-blue-500" />
                  Waiting for model response...
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Response Panel ─────────────────────────────────────────────────── */}
        {hasResponse && (
          <div className="rounded-sm border border-border bg-card p-4 space-y-3">
            <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
              Response
            </span>

            {/* Elapsed time */}
            {elapsedMs !== null && (
              <div className="font-mono text-xs text-muted-foreground">
                Elapsed:{" "}
                <span className="text-foreground">
                  {(elapsedMs / 1000).toFixed(2)}s
                </span>
              </div>
            )}

            {/* Error */}
            {errorMsg && (
              <div className="rounded-sm border border-red-500/20 bg-red-500/10 p-3 font-mono text-xs text-red-400 whitespace-pre-wrap">
                {errorMsg}
              </div>
            )}

            {/* Raw JSON response */}
            {responseJson && (
              <pre className="rounded-sm border border-border bg-background p-3 font-mono text-xs text-foreground overflow-x-auto whitespace-pre-wrap break-all">
                {responseJson}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
