export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      active_giveaways: {
        Row: {
          bot_id: string
          channel_id: string
          color: string | null
          created_at: string
          end_color: string | null
          ended: boolean
          ends_at: string
          guild_id: string
          id: string
          message_id: string
          prize: string
          winners_count: number
        }
        Insert: {
          bot_id: string
          channel_id: string
          color?: string | null
          created_at?: string
          end_color?: string | null
          ended?: boolean
          ends_at: string
          guild_id: string
          id?: string
          message_id: string
          prize: string
          winners_count?: number
        }
        Update: {
          bot_id?: string
          channel_id?: string
          color?: string | null
          created_at?: string
          end_color?: string | null
          ended?: boolean
          ends_at?: string
          guild_id?: string
          id?: string
          message_id?: string
          prize?: string
          winners_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "active_giveaways_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_backups: {
        Row: {
          backup_data: Json
          backup_type: string
          bot_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          backup_data?: Json
          backup_type?: string
          bot_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          backup_data?: Json
          backup_type?: string
          bot_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_backups_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          actions: Json | null
          active: boolean
          bot_id: string
          created_at: string
          id: string
          name: string
          trigger_config: Json | null
          trigger_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actions?: Json | null
          active?: boolean
          bot_id: string
          created_at?: string
          id?: string
          name: string
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actions?: Json | null
          active?: boolean
          bot_id?: string
          created_at?: string
          id?: string
          name?: string
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automations_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_logs: {
        Row: {
          bot_id: string
          created_at: string
          id: string
          level: string
          message: string
          source: string | null
          user_id: string
        }
        Insert: {
          bot_id: string
          created_at?: string
          id?: string
          level?: string
          message: string
          source?: string | null
          user_id: string
        }
        Update: {
          bot_id?: string
          created_at?: string
          id?: string
          level?: string
          message?: string
          source?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_logs_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_modules: {
        Row: {
          bot_id: string
          config: Json | null
          created_at: string
          enabled: boolean
          id: string
          module_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bot_id: string
          config?: Json | null
          created_at?: string
          enabled?: boolean
          id?: string
          module_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bot_id?: string
          config?: Json | null
          created_at?: string
          enabled?: boolean
          id?: string
          module_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_modules_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      bots: {
        Row: {
          bot_avatar: string | null
          bot_id: string | null
          bot_name: string
          created_at: string
          guild_count: number | null
          guild_id: string | null
          id: string
          prefix: string | null
          status: string
          token_encrypted: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bot_avatar?: string | null
          bot_id?: string | null
          bot_name: string
          created_at?: string
          guild_count?: number | null
          guild_id?: string | null
          id?: string
          prefix?: string | null
          status?: string
          token_encrypted: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bot_avatar?: string | null
          bot_id?: string | null
          bot_name?: string
          created_at?: string
          guild_count?: number | null
          guild_id?: string | null
          id?: string
          prefix?: string | null
          status?: string
          token_encrypted?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      commands: {
        Row: {
          bot_id: string
          buttons: Json | null
          conditions: Json | null
          cooldown: number | null
          created_at: string
          description: string | null
          embed: Json | null
          enabled: boolean
          ephemeral: boolean | null
          id: string
          name: string
          permissions: string[] | null
          responses: Json | null
          type: Database["public"]["Enums"]["command_type"]
          updated_at: string
          user_id: string
          uses: number
        }
        Insert: {
          bot_id: string
          buttons?: Json | null
          conditions?: Json | null
          cooldown?: number | null
          created_at?: string
          description?: string | null
          embed?: Json | null
          enabled?: boolean
          ephemeral?: boolean | null
          id?: string
          name: string
          permissions?: string[] | null
          responses?: Json | null
          type?: Database["public"]["Enums"]["command_type"]
          updated_at?: string
          user_id: string
          uses?: number
        }
        Update: {
          bot_id?: string
          buttons?: Json | null
          conditions?: Json | null
          cooldown?: number | null
          created_at?: string
          description?: string | null
          embed?: Json | null
          enabled?: boolean
          ephemeral?: boolean | null
          id?: string
          name?: string
          permissions?: string[] | null
          responses?: Json | null
          type?: Database["public"]["Enums"]["command_type"]
          updated_at?: string
          user_id?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "commands_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_scripts: {
        Row: {
          bot_id: string
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          name: string
          script_code: string
          trigger_command: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bot_id: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          name: string
          script_code?: string
          trigger_command?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bot_id?: string
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          name?: string
          script_code?: string
          trigger_command?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_scripts_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      downtime_alerts: {
        Row: {
          alert_type: string
          bot_id: string
          created_at: string
          id: string
          message: string
          resolved: boolean
          user_id: string
        }
        Insert: {
          alert_type?: string
          bot_id: string
          created_at?: string
          id?: string
          message: string
          resolved?: boolean
          user_id: string
        }
        Update: {
          alert_type?: string
          bot_id?: string
          created_at?: string
          id?: string
          message?: string
          resolved?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "downtime_alerts_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      giveaway_entries: {
        Row: {
          created_at: string
          giveaway_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          giveaway_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          giveaway_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "giveaway_entries_giveaway_id_fkey"
            columns: ["giveaway_id"]
            isOneToOne: false
            referencedRelation: "active_giveaways"
            referencedColumns: ["id"]
          },
        ]
      }
      leveling_config: {
        Row: {
          bot_id: string
          created_at: string
          enabled: boolean
          id: string
          ignored_channels: Json | null
          ignored_roles: Json | null
          level_up_channel: string | null
          level_up_message: string | null
          multipliers: Json | null
          role_rewards: Json | null
          updated_at: string
          user_id: string
          xp_cooldown: number
          xp_per_message: number
        }
        Insert: {
          bot_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          ignored_channels?: Json | null
          ignored_roles?: Json | null
          level_up_channel?: string | null
          level_up_message?: string | null
          multipliers?: Json | null
          role_rewards?: Json | null
          updated_at?: string
          user_id: string
          xp_cooldown?: number
          xp_per_message?: number
        }
        Update: {
          bot_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          ignored_channels?: Json | null
          ignored_roles?: Json | null
          level_up_channel?: string | null
          level_up_message?: string | null
          multipliers?: Json | null
          role_rewards?: Json | null
          updated_at?: string
          user_id?: string
          xp_cooldown?: number
          xp_per_message?: number
        }
        Relationships: [
          {
            foreignKeyName: "leveling_config_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: true
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          discord_avatar: string | null
          discord_id: string | null
          discord_username: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          discord_avatar?: string | null
          discord_id?: string | null
          discord_username?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          discord_avatar?: string | null
          discord_id?: string | null
          discord_username?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_embeds: {
        Row: {
          bot_id: string
          created_at: string
          embed_data: Json
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bot_id: string
          created_at?: string
          embed_data?: Json
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bot_id?: string
          created_at?: string
          embed_data?: Json
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_embeds_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_messages: {
        Row: {
          bot_id: string
          channel_id: string
          created_at: string
          embed_data: Json | null
          enabled: boolean
          id: string
          last_sent_at: string | null
          message_content: string
          recurring: string | null
          send_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bot_id: string
          channel_id: string
          created_at?: string
          embed_data?: Json | null
          enabled?: boolean
          id?: string
          last_sent_at?: string | null
          message_content: string
          recurring?: string | null
          send_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bot_id?: string
          channel_id?: string
          created_at?: string
          embed_data?: Json | null
          enabled?: boolean
          id?: string
          last_sent_at?: string | null
          message_content?: string
          recurring?: string | null
          send_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      server_events: {
        Row: {
          bot_id: string
          created_at: string
          event_data: Json | null
          event_type: string
          guild_id: string
          id: string
        }
        Insert: {
          bot_id: string
          created_at?: string
          event_data?: Json | null
          event_type: string
          guild_id: string
          id?: string
        }
        Update: {
          bot_id?: string
          created_at?: string
          event_data?: Json | null
          event_type?: string
          guild_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_events_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_config: {
        Row: {
          bot_id: string
          category_id: string | null
          created_at: string
          enabled: boolean
          id: string
          log_channel_id: string | null
          max_tickets_per_user: number
          support_role_id: string | null
          support_role_ids: Json | null
          ticket_categories: Json | null
          updated_at: string
          user_id: string
          welcome_message: string | null
        }
        Insert: {
          bot_id: string
          category_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          log_channel_id?: string | null
          max_tickets_per_user?: number
          support_role_id?: string | null
          support_role_ids?: Json | null
          ticket_categories?: Json | null
          updated_at?: string
          user_id: string
          welcome_message?: string | null
        }
        Update: {
          bot_id?: string
          category_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          log_channel_id?: string | null
          max_tickets_per_user?: number
          support_role_id?: string | null
          support_role_ids?: Json | null
          ticket_categories?: Json | null
          updated_at?: string
          user_id?: string
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_config_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: true
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      user_levels: {
        Row: {
          bot_id: string
          created_at: string
          guild_id: string
          id: string
          last_xp_at: string | null
          level: number
          updated_at: string
          user_id: string
          xp: number
        }
        Insert: {
          bot_id: string
          created_at?: string
          guild_id: string
          id?: string
          last_xp_at?: string | null
          level?: number
          updated_at?: string
          user_id: string
          xp?: number
        }
        Update: {
          bot_id?: string
          created_at?: string
          guild_id?: string
          id?: string
          last_xp_at?: string | null
          level?: number
          updated_at?: string
          user_id?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_levels_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      command_type: "slash" | "prefix" | "context"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      command_type: ["slash", "prefix", "context"],
    },
  },
} as const
