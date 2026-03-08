import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date().toISOString();

    // Get all scheduled messages that are due
    const { data: dueMessages } = await adminClient
      .from("scheduled_messages")
      .select("*, bots!inner(token_encrypted, status)")
      .eq("enabled", true)
      .lte("send_at", now);

    if (!dueMessages || dueMessages.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let sent = 0;

    for (const msg of dueMessages) {
      const token = atob((msg as any).bots.token_encrypted);
      const body: any = { content: msg.message_content };

      if (msg.embed_data) {
        body.embeds = [msg.embed_data];
      }

      const res = await fetch(`https://discord.com/api/v10/channels/${msg.channel_id}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        sent++;
        
        if (msg.recurring) {
          // Calculate next send_at based on recurring type
          const nextDate = new Date(msg.send_at);
          switch (msg.recurring) {
            case "every_hour": nextDate.setHours(nextDate.getHours() + 1); break;
            case "every_6h": nextDate.setHours(nextDate.getHours() + 6); break;
            case "every_12h": nextDate.setHours(nextDate.getHours() + 12); break;
            case "daily": nextDate.setDate(nextDate.getDate() + 1); break;
            case "weekly": nextDate.setDate(nextDate.getDate() + 7); break;
            case "monthly": nextDate.setMonth(nextDate.getMonth() + 1); break;
          }
          await adminClient.from("scheduled_messages").update({
            send_at: nextDate.toISOString(),
            last_sent_at: now,
          }).eq("id", msg.id);
        } else {
          // One-time: disable after sending
          await adminClient.from("scheduled_messages").update({
            enabled: false,
            last_sent_at: now,
          }).eq("id", msg.id);
        }
      }
    }

    return new Response(JSON.stringify({ sent, total: dueMessages.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
