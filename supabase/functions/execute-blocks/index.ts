import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Block {
  id: string;
  type: string;
  label: string;
  value: string;
  variableKey: string;
}

interface Variable {
  id: string;
  key: string;
  fallback: string;
  required: boolean;
}

interface ExecutionContext {
  user: string;
  server: string;
  channel: string;
  mention: string;
  [key: string]: string;
}

function resolveVariables(text: string, ctx: ExecutionContext): string {
  return text.replace(/\{(\w+)\}/g, (match, key) => ctx[key] ?? match);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { command_id, blocks, variables, context: inputContext, bot_id, dry_run } = await req.json();

    if (!blocks || !Array.isArray(blocks)) {
      return new Response(JSON.stringify({ error: "blocks array is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build execution context from variables
    const ctx: ExecutionContext = {
      user: inputContext?.user ?? "TestUser",
      server: inputContext?.server ?? "TestServer",
      channel: inputContext?.channel ?? "general",
      mention: inputContext?.mention ?? "@TestUser",
    };

    // Add custom variables with fallbacks
    if (variables && Array.isArray(variables)) {
      for (const v of variables as Variable[]) {
        if (v.key && !ctx[v.key]) {
          ctx[v.key] = inputContext?.[v.key] ?? v.fallback ?? "";
        }
        if (v.required && !ctx[v.key]) {
          return new Response(JSON.stringify({ error: `Required variable missing: ${v.key}` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const results: Array<{ block_id: string; type: string; status: string; output: string; duration_ms: number }> = [];
    const logs: string[] = [];

    for (const block of blocks as Block[]) {
      const start = Date.now();
      let output = "";
      let status = "success";

      try {
        switch (block.type) {
          case "reply": {
            output = resolveVariables(block.value, ctx);
            logs.push(`[reply] ${output}`);
            break;
          }
          case "embed": {
            output = JSON.stringify({ type: "embed", content: resolveVariables(block.value, ctx) });
            logs.push(`[embed] Embed block processed`);
            break;
          }
          case "condition": {
            const resolved = resolveVariables(block.value, ctx);
            const passed = resolved.trim().length > 0 && resolved !== "false" && resolved !== "0";
            output = passed ? "condition_passed" : "condition_failed";
            logs.push(`[condition] ${block.label}: ${output}`);
            if (!passed) {
              // Skip remaining blocks when condition fails
              results.push({ block_id: block.id, type: block.type, status: "skipped", output, duration_ms: Date.now() - start });
              // Log and continue - in real engine this would branch
            }
            break;
          }
          case "wait": {
            const seconds = Math.min(parseInt(block.value) || 1, 10); // Max 10s in dry run
            if (!dry_run) {
              await new Promise((r) => setTimeout(r, seconds * 1000));
            }
            output = `Waited ${seconds}s`;
            logs.push(`[wait] ${output}`);
            break;
          }
          case "run_event": {
            output = `Event hook triggered: ${resolveVariables(block.value, ctx)}`;
            logs.push(`[run_event] ${output}`);
            break;
          }
          case "log_error": {
            const message = resolveVariables(block.value, ctx);
            output = message;
            logs.push(`[log_error] ${message}`);

            // Write to bot_logs if not dry run
            if (!dry_run && bot_id) {
              await supabase.from("bot_logs").insert({
                bot_id,
                user_id: user.id,
                level: "error",
                source: "runtime-engine",
                message,
              });
            }
            break;
          }
          default: {
            output = `Unknown block type: ${block.type}`;
            status = "warning";
            logs.push(`[unknown] ${output}`);
          }
        }
      } catch (err) {
        status = "error";
        output = err.message;
        logs.push(`[error] Block ${block.id}: ${err.message}`);
      }

      // Store variable output
      if (block.variableKey && block.variableKey.trim()) {
        ctx[block.variableKey.trim()] = output;
      }

      results.push({
        block_id: block.id,
        type: block.type,
        status,
        output,
        duration_ms: Date.now() - start,
      });
    }

    // Log execution if not dry run
    if (!dry_run && bot_id) {
      await supabase.from("bot_logs").insert({
        bot_id,
        user_id: user.id,
        level: "info",
        source: "runtime-engine",
        message: `Executed ${blocks.length} blocks${command_id ? ` for command ${command_id}` : ""}`,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      dry_run: !!dry_run,
      blocks_executed: results.length,
      results,
      logs,
      final_context: ctx,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
